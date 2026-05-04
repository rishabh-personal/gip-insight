import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DipJob } from '../schemas/dip-job.schema';
import { Enterprise } from '../schemas/enterprise.schema';
import { MysqlTenantService } from '../database/mysql-tenant.service';
import { ZwingStatusService, errMsg } from '../common/zwing-status.service';
import {
  EVENT_SOURCE_CONFIGS,
  DEFAULT_INVOICE_EVENT_CODE,
  EventSourceConfig,
} from '../config/event-recon-config';

@Injectable()
export class SyncGapService {
  private readonly logger = new Logger(SyncGapService.name);

  constructor(
    @InjectModel(DipJob.name) private jobModel: Model<DipJob>,
    @InjectModel(Enterprise.name) private enterpriseModel: Model<Enterprise>,
    private readonly mysql: MysqlTenantService,
    private readonly zwingStatus: ZwingStatusService,
  ) {}

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Resolves the Zwing db_name for an enterprise from the master vendor table.
   * Returns null when no vendor row exists.
   */
  private async resolveDbName(ssoEnterpriseId: string): Promise<string | null> {
    const rows = await this.mysql.query(
      this.mysql.getMasterDb(),
      `SELECT db_name FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
      [ssoEnterpriseId],
    );
    return (rows[0] as any)?.db_name ?? null;
  }

  /**
   * Builds the WHERE clause + params shared by SELECT and COUNT queries.
   */
  private buildWhere(
    config: EventSourceConfig,
    from: Date,
    to: Date,
    extra: { transactionType?: string; storeId?: string } = {},
  ): { where: string; params: any[] } {
    let where = `${config.dateField} BETWEEN ? AND ?`;
    const params: any[] = [from, to];

    if (config.extraWhere) where += ` AND ${config.extraWhere}`;

    // transactionType / storeId are invoice-specific dynamic filters.
    if (extra.transactionType) { where += ` AND transaction_type = ?`; params.push(extra.transactionType); }
    if (extra.storeId)         { where += ` AND store_id = ?`;          params.push(extra.storeId); }

    return { where, params };
  }

  /**
   * Builds a SELECT query with optional ORDER BY / LIMIT / OFFSET.
   */
  private buildSourceQuery(
    config: EventSourceConfig,
    from: Date,
    to: Date,
    extra: {
      transactionType?: string;
      storeId?: string;
      orderBy?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): { sql: string; params: any[] } {
    const columns = config.selectFields?.length ? config.selectFields.join(', ') : '*';
    const { where, params } = this.buildWhere(config, from, to, extra);

    let sql = `SELECT ${columns} FROM ${config.tableName} WHERE ${where}`;
    if (extra.orderBy)     sql += ` ORDER BY ${extra.orderBy}`;
    // LIMIT and OFFSET must be inlined as integers — mysql2 prepared statements
    // do not accept ? placeholders for these clauses.
    if (extra.limit  != null) sql += ` LIMIT ${Math.floor(Math.abs(extra.limit))}`;
    if (extra.offset != null) sql += ` OFFSET ${Math.floor(Math.abs(extra.offset))}`;

    return { sql, params };
  }

  /** Builds a COUNT(*) query using the same WHERE clause as buildSourceQuery. */
  private buildCountQuery(
    config: EventSourceConfig,
    from: Date,
    to: Date,
    extra: { transactionType?: string; storeId?: string } = {},
  ): { sql: string; params: any[] } {
    const { where, params } = this.buildWhere(config, from, to, extra);
    return {
      sql: `SELECT COUNT(*) AS total FROM ${config.tableName} WHERE ${where}`,
      params,
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Increments sync_status by 1 on the given invoice IDs in the enterprise's Zwing DB.
   * This causes Debezium to pick up the row change and re-emit the event to Kafka.
   * Runs in batches of 1000 to avoid hitting MySQL's IN() limit.
   */
  async retriggerInvoices(
    ssoEnterpriseId: string,
    invoiceIds: string[],
  ): Promise<{ updated: number; batches: number }> {
    if (!invoiceIds.length) return { updated: 0, batches: 0 };

    const dbName = await this.resolveDbName(ssoEnterpriseId);
    if (!dbName) throw new Error('No Zwing db_name for this enterprise');

    const BATCH = 1000;
    let updated = 0;
    let batches = 0;

    for (let i = 0; i < invoiceIds.length; i += BATCH) {
      const chunk = invoiceIds.slice(i, i + BATCH);
      const placeholders = chunk.map(() => '?').join(',');
      const result = await this.mysql.query(
        dbName,
        `UPDATE invoices SET sync_status = sync_status + 1 WHERE invoice_id IN (${placeholders})`,
        chunk,
      );
      updated += (result as any).affectedRows ?? chunk.length;
      batches += 1;
      this.logger.log(
        `[Retrigger] ${ssoEnterpriseId} batch ${batches}: ${chunk.length} invoices → sync_status+1`,
      );
    }

    return { updated, batches };
  }

  /**
   * Returns source records that GIP has captured but whose jobs are still
   * in pending/processing state (no success, no failure yet).
   * These can be re-triggered the same way as missed events.
   */
  async getPendingInvoices(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    opts: { eventCode?: string } = {},
  ): Promise<any> {
    const eventCode = opts.eventCode ?? DEFAULT_INVOICE_EVENT_CODE;
    const sourceConfig = EVENT_SOURCE_CONFIGS[eventCode];
    if (!sourceConfig) {
      return { data: { error: `No source config found for event "${eventCode}". Add it to EVENT_SOURCE_CONFIGS.` } };
    }

    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return { data: null };

    const dbName = await this.resolveDbName(ssoEnterpriseId);
    if (!dbName) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName },
          count: 0,
          pendingInvoices: [],
        },
      };
    }

    const { sql, params } = this.buildSourceQuery(sourceConfig, from, to);

    const [sourceRows, statusResult] = await Promise.all([
      this.mysql
        .query(dbName, sql, params)
        .catch((e) => {
          this.logger.warn(`[getPendingInvoices] Source query failed for db "${dbName}": ${errMsg(e)}`);
          return [] as any[];
        }),
      this.zwingStatus.buildZwingJobStatus(ssoEnterpriseId, dbName, from, to),
    ]);

    const { byInvoice, byPair } = statusResult;
    const refDocField = sourceConfig.refDocField;

    const pendingIds = new Set(
      [...byInvoice.entries()]
        .filter(([, v]) => v.hasPendingOnly)
        .map(([id]) => id),
    );

    if (!pendingIds.size) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName, dbName },
          count: 0,
          pendingInvoices: [],
        },
      };
    }

    const jobInfoMap = new Map<string, { latestDate: Date; latestJobId: unknown }>();
    for (const p of byPair) {
      if (!p.hasPendingOnly || !pendingIds.has(p.refDocNo)) continue;
      const existing = jobInfoMap.get(p.refDocNo);
      if (!existing || (p.latestDate && p.latestDate > existing.latestDate)) {
        jobInfoMap.set(p.refDocNo, { latestDate: p.latestDate, latestJobId: p.latestJobId });
      }
    }

    const pendingInvoices = (sourceRows as any[])
      .filter((r) => pendingIds.has(String(r[refDocField])))
      .map((r) => ({
        ...r,
        gipLastAttempt: jobInfoMap.get(String(r[refDocField]))?.latestDate ?? null,
        gipJobId:       jobInfoMap.get(String(r[refDocField]))?.latestJobId?.toString() ?? null,
      }));

    return {
      data: {
        enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName, dbName },
        count: pendingInvoices.length,
        pendingInvoices,
      },
    };
  }

  /**
   * Reconciles source records (Zwing MySQL) against GIP jobs (MongoDB) for the
   * given date window.
   *
   * Source records are bounded by the MySQL BETWEEN clause on the configured
   * dateField.  GIP is queried by refDocNo only — NO date filter — so that
   * late/retriggered deliveries are never falsely reported as missed.
   *
   * Returns three buckets:
   *   missing — source record exists but GIP has no job at all
   *   failed  — GIP has jobs but none succeeded
   *   (success is implicit: zwingCount - missing - failed)
   */
  async getSyncGap(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    opts: { eventCode?: string; transactionType?: string; storeId?: string } = {},
  ) {
    const eventCode = opts.eventCode ?? DEFAULT_INVOICE_EVENT_CODE;
    const sourceConfig = EVENT_SOURCE_CONFIGS[eventCode];
    if (!sourceConfig) {
      return {
        data: {
          error: `No source config found for event "${eventCode}". Add it to EVENT_SOURCE_CONFIGS.`,
        },
      };
    }

    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return { data: null };

    const dbName = await this.resolveDbName(ssoEnterpriseId);
    if (!dbName) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName },
          eventCode,
          label: sourceConfig.label,
          zwingCount: null,
          gipCount: 0,
          gap: null,
          syncRate: null,
          missing: { count: 0, items: [] },
          failed:  { count: 0, items: [] },
          error: 'No Zwing db_name configured for this enterprise',
        },
      };
    }

    const { sql, params } = this.buildSourceQuery(sourceConfig, from, to, {
      transactionType: opts.transactionType,
      storeId: opts.storeId,
    });

    const sourceRows = await this.mysql
      .query(dbName, sql, params)
      .catch((e) => {
        this.logger.warn(`[getSyncGap] Source query failed for db "${dbName}": ${errMsg(e)}`);
        return [] as any[];
      }) as any[];

    const refDocField = sourceConfig.refDocField;

    // Convert to strings — MySQL may return numeric primary keys as JS numbers,
    // while MongoDB stores refDocNo as strings. String() normalises the type.
    const sourceIds = sourceRows.map((r) => String(r[refDocField]));

    // Query GIP with NO date filter.
    // The source window is already bounded by the MySQL BETWEEN clause above.
    // Adding a transactionDate filter here would falsely report invoices as
    // missed when GIP processed the event outside the queried window
    // (e.g. a Debezium event received a day late, or after a manual retrigger).
    const gipJobs = sourceIds.length
      ? await this.jobModel
          .find({ ssoEnterpriseId, refDocNo: { $in: sourceIds } })
          .select('refDocNo status')
          .lean()
      : [];

    // Group GIP jobs by refDocNo: track whether any job ever succeeded or failed.
    type GipStatus = { hasSuccess: boolean; hasFailed: boolean };
    const gipMap = new Map<string, GipStatus>();
    for (const job of gipJobs) {
      const cur = gipMap.get(job.refDocNo) ?? { hasSuccess: false, hasFailed: false };
      if (job.status === 'success') cur.hasSuccess = true;
      if (job.status === 'failed')  cur.hasFailed  = true;
      gipMap.set(job.refDocNo, cur);
    }

    // Classify each source row into missing / failed / success.
    const missing: any[] = [];
    const failed:  any[] = [];

    for (const row of sourceRows) {
      const id  = String(row[refDocField]);
      const gip = gipMap.get(id);

      if (!gip) {
        // No GIP job at all — Debezium never emitted / consumed the event.
        missing.push(row);
      } else if (!gip.hasSuccess) {
        // GIP received the event but every job attempt failed.
        failed.push(row);
      }
      // else: at least one success → captured, skip.
    }

    const successCount = sourceRows.length - missing.length - failed.length;
    // gap = total docs not successfully delivered (missing + failed)
    const gap = missing.length + failed.length;

    return {
      data: {
        enterprise: {
          ssoEnterpriseId,
          tradeName: enterprise.tradeName,
          dbName,
        },
        eventCode,
        label: sourceConfig.label,
        zwingCount: sourceRows.length,
        gipCount:   gipMap.size,
        gap,
        syncRate:
          sourceRows.length > 0
            ? Math.round((successCount / sourceRows.length) * 100 * 10) / 10
            : 100,
        missing: {
          count: missing.length,
          items: missing.slice(0, 500),
        },
        failed: {
          count: failed.length,
          items: failed.slice(0, 500),
        },
        from,
        to,
      },
    };
  }

  /**
   * Per-invoice timeline: Zwing source rows enriched with GIP job status and
   * sync delay.
   *
   * Delay calculation:
   *   - Zwing created_at is stored in IST.  mysql2 (timezone:'+05:30') converts
   *     it to a UTC JS Date automatically, so no manual offset is needed.
   *   - GIP timestamps are always UTC.
   *   - delay = first GIP success timestamp − Zwing created_at (both UTC).
   *
   * Returns all matching rows (capped at MAX_TIMELINE_ROWS). The frontend
   * handles client-side pagination and sorting.
   */
  async getInvoiceTimeline(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    opts: {
      eventCode?: string;
      transactionType?: string;
      storeId?: string;
    } = {},
  ) {
    const MAX_ROWS = 5000;

    const eventCode   = opts.eventCode ?? DEFAULT_INVOICE_EVENT_CODE;
    const sourceConfig = EVENT_SOURCE_CONFIGS[eventCode];
    if (!sourceConfig) {
      return { data: { error: `No source config found for event "${eventCode}". Add it to EVENT_SOURCE_CONFIGS.` } };
    }

    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return { data: null };

    const dbName = await this.resolveDbName(ssoEnterpriseId);
    if (!dbName) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName },
          eventCode,
          label: sourceConfig.label,
          total: 0,
          items: [],
        },
      };
    }

    const extra = { transactionType: opts.transactionType, storeId: opts.storeId };

    // ── 1. Fetch source rows ────────────────────────────────────────────────
    const { sql, params } = this.buildSourceQuery(sourceConfig, from, to, {
      ...extra,
      orderBy: `${sourceConfig.dateField} DESC`,
      limit: MAX_ROWS,
    });

    const sourceRows = await this.mysql
      .query(dbName, sql, params)
      .catch((e) => {
        this.logger.warn(`[getInvoiceTimeline] Source query failed for db "${dbName}": ${errMsg(e)}`);
        return [] as any[];
      }) as any[];

    if (!sourceRows.length) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName, dbName },
          eventCode,
          label: sourceConfig.label,
          total: 0,
          items: [],
          summary: { successCount: 0, failedCount: 0, pendingCount: 0, missingCount: 0, avgDelaySeconds: null, p95DelaySeconds: null },
        },
      };
    }

    const refDocField = sourceConfig.refDocField;
    const allIds = sourceRows.map((r) => String(r[refDocField]));

    // ── 2. Fetch all GIP jobs for these IDs ─────────────────────────────────
    // timestamps array holds per-attempt status + timestamp entries.
    // We need the earliest 'success' entry to compute the real sync time.
    const gipJobs = await this.jobModel
      .find({ ssoEnterpriseId, refDocNo: { $in: allIds } })
      .select('refDocNo status timestamps updatedAt')
      .lean();

    // ── 3. Build per-refDocNo aggregated info ───────────────────────────────
    type GipInfo = {
      hasSuccess: boolean;
      hasFailed: boolean;
      hasPending: boolean;
      firstSuccessAt: Date | null;
      latestJobId: string | null;
    };

    const gipMap = new Map<string, GipInfo>();

    for (const job of gipJobs) {
      const cur: GipInfo = gipMap.get(job.refDocNo) ?? {
        hasSuccess: false,
        hasFailed: false,
        hasPending: false,
        firstSuccessAt: null,
        latestJobId: null,
      };

      if (job.status === 'success') {
        cur.hasSuccess = true;
        // Pick the timestamp where status === 'success' inside the attempts array.
        // Falls back to job.updatedAt when timestamps are absent.
        const successTs =
          ((job.timestamps ?? []) as Array<{ status: string; timestamp: Date }>)
            .find((t) => t.status === 'success')?.timestamp ?? job.updatedAt;

        if (successTs && (!cur.firstSuccessAt || successTs < cur.firstSuccessAt)) {
          cur.firstSuccessAt = successTs;
        }
      }
      if (job.status === 'failed')                                   cur.hasFailed  = true;
      if (job.status === 'pending' || job.status === 'processing')   cur.hasPending = true;

      // Keep the latest jobId so the UI can deep-link to the trace page.
      cur.latestJobId = (job as any)._id?.toString() ?? null;
      gipMap.set(job.refDocNo, cur);
    }

    // ── 4. Build per-row timeline items ──────────────────────────────────────
    type GipStatus = 'success' | 'failed' | 'pending' | 'missing';

    const delayValues: number[] = [];

    const items = sourceRows.map((row) => {
      const id            = String(row[refDocField]);
      const gip           = gipMap.get(id);
      // mysql2 with timezone:'+05:30' already converts IST datetime → UTC Date.
      const zwingCreatedAt: Date | null = row[sourceConfig.dateField] ?? null;

      let gipStatus: GipStatus;
      let gipSyncedAt: Date | null = null;
      let delaySeconds: number | null = null;

      if (!gip) {
        gipStatus = 'missing';
      } else if (gip.hasSuccess) {
        gipStatus   = 'success';
        gipSyncedAt = gip.firstSuccessAt;
        if (gipSyncedAt && zwingCreatedAt) {
          delaySeconds = Math.max(
            0,
            Math.round((gipSyncedAt.getTime() - zwingCreatedAt.getTime()) / 1000),
          );
          delayValues.push(delaySeconds);
        }
      } else if (gip.hasFailed) {
        gipStatus = 'failed';
      } else {
        gipStatus = 'pending';
      }

      return {
        invoiceId:          id,
        storeId:            row.store_id            ?? null,
        transactionType:    row.transaction_type     ?? null,
        transactionSubType: row.transaction_sub_type ?? null,
        zwingStatus:        row.status              ?? null,
        zwingCreatedAt:     zwingCreatedAt?.toISOString() ?? null,
        gipStatus,
        gipSyncedAt:        gipSyncedAt?.toISOString() ?? null,
        delaySeconds,
        gipJobId:           gip?.latestJobId ?? null,
      };
    });

    // ── 5. Compute summary stats ──────────────────────────────────────────────
    const successCount = items.filter((i) => i.gipStatus === 'success').length;
    const failedCount  = items.filter((i) => i.gipStatus === 'failed').length;
    const pendingCount = items.filter((i) => i.gipStatus === 'pending').length;
    const missingCount = items.filter((i) => i.gipStatus === 'missing').length;

    let avgDelaySeconds: number | null = null;
    let p95DelaySeconds: number | null = null;
    if (delayValues.length > 0) {
      avgDelaySeconds = Math.round(delayValues.reduce((a, b) => a + b, 0) / delayValues.length);
      const sorted    = [...delayValues].sort((a, b) => a - b);
      const p95idx    = Math.ceil(sorted.length * 0.95) - 1;
      p95DelaySeconds = sorted[p95idx];
    }

    return {
      data: {
        enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName, dbName },
        eventCode,
        label: sourceConfig.label,
        total: sourceRows.length,
        items,
        summary: { successCount, failedCount, pendingCount, missingCount, avgDelaySeconds, p95DelaySeconds },
      },
    };
  }
}
