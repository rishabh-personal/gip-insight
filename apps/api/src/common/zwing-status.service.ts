import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DipJob } from '../schemas/dip-job.schema';
import { MysqlTenantService } from '../database/mysql-tenant.service';

export interface ZwingJobStatusResult {
  invoiceIds: string[];
  /**
   * Per-invoice rollup across all connectors:
   *   hasSuccess    — at least one connector delivered successfully
   *   hasAnyJob     — at least one GIP job exists
   *   hasAnyFailed  — at least one connector has a failed (non-success) attempt
   *   hasPendingOnly — has jobs but all are pending/processing (no success, no failure yet)
   */
  byInvoice: Map<string, {
    hasSuccess: boolean;
    hasAnyJob: boolean;
    hasAnyFailed: boolean;
    hasPendingOnly: boolean;
  }>;
  /** per (invoice, connector, event) triple — for detailed / drill-down views */
  byPair: Array<{
    refDocNo: string;
    connectorId: unknown;
    connectorAppEventId: unknown;
    hasSuccess: boolean;
    hasFailed: boolean;
    hasPendingOnly: boolean;
    latestError: string;
    latestDate: Date;
    failedAttempts: number;
    latestJobId: unknown;
  }>;
}

/** Safe error message extraction regardless of thrown value type. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

@Injectable()
export class ZwingStatusService {
  private readonly logger = new Logger(ZwingStatusService.name);

  constructor(
    @InjectModel(DipJob.name) private readonly jobModel: Model<DipJob>,
    private readonly mysql: MysqlTenantService,
  ) {}

  /**
   * The single source of truth for all failure / success metrics.
   *
   * 1. Fetches invoice IDs from Zwing MySQL for the given date window.
   * 2. Queries GIP MongoDB for jobs with refDocNo IN (invoiceIds) and
   *    transactionDate >= from (no upper bound — catches retriggered jobs
   *    whose success landed after the original window closes).
   * 3. Groups by (refDocNo, connectorId) and determines pass / fail / missing
   *    at the invoice level — regardless of how many job attempts were made.
   */
  async buildZwingJobStatus(
    ssoEnterpriseId: string,
    dbName: string,
    from: Date,
    to: Date,
    /** When set, only jobs for these connector IDs are included (connector-tab mode). */
    connectorIds?: string[],
  ): Promise<ZwingJobStatusResult> {
    const empty: ZwingJobStatusResult = { invoiceIds: [], byInvoice: new Map(), byPair: [] };

    let rows: { invoice_id: string | number }[];
    try {
      rows = await this.mysql.query<{ invoice_id: string | number }>(
        dbName,
        `SELECT invoice_id FROM invoices
         WHERE created_at BETWEEN ? AND ? AND channel_id != 3 AND status = 'SUCCESS'`,
        [from, to],
      );
    } catch (e) {
      this.logger.warn(
        `[buildZwingJobStatus] MySQL query failed for db "${dbName}": ${errMsg(e)}`,
      );
      return empty;
    }

    const invoiceIds = rows.map((r) => String(r.invoice_id));
    if (!invoiceIds.length) return empty;

    const connectorScoped = !!(connectorIds && connectorIds.length > 0);

    // ── MongoDB match strategy ────────────────────────────────────────────────
    // Connector-scoped: query by connectorId + date range — MongoDB can use a
    // tight { connectorId, transactionDate } IXSCAN, far faster than a multi-
    // value refDocNo $in scan over potentially 50k+ IDs. Invoice IDs are filtered
    // in memory after the aggregation.
    //
    // All-connectors: refDocNo $in is the only way to scope to source records
    // (no connector filter available).
    const jobMatch: Record<string, any> = {
      ssoEnterpriseId,
      // No upper bound on transactionDate: capture retriggered / delayed
      // deliveries that land after the Zwing window closes. The invoice set
      // is already bounded by the MySQL created_at BETWEEN clause above.
      transactionDate: { $gte: from },
    };
    if (connectorScoped) {
      jobMatch.connectorId = { $in: connectorIds!.map((id) => new Types.ObjectId(id)) };
    } else {
      jobMatch.refDocNo = { $in: invoiceIds };
    }

    // A job that exceeded maxRetry can get stuck in 'processing' state if the
    // process crashed before writing the final 'failed' transition.  We detect
    // these "zombie" jobs by checking the timestamps array for any 'failed'
    // entry in addition to the top-level status field.
    const hasFailedExpr = {
      $max: {
        $cond: [
          {
            $or: [
              { $eq: ['$status', 'failed'] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$timestamps', []] },
                        as: 't',
                        cond: { $eq: ['$$t.status', 'failed'] },
                      },
                    },
                  },
                  0,
                ],
              },
            ],
          },
          1,
          0,
        ],
      },
    };

    // $sort is intentionally removed — it was O(n log n) on all matched docs.
    // latestDate uses $max (accurate). latestError / latestJobId use $last
    // (arbitrary doc within group — acceptable for deep-link purposes).
    const allJobGroups = await this.jobModel.aggregate([
      { $match: jobMatch },
      {
        $group: {
          // Group at the event level (connectorAppEventId) so that different events
          // on the same connector are tracked independently. Without this, Event A
          // (succeeded) and Event B (pending) on the same connector would be merged
          // into one group and Event A's success would silence Event B's pending state.
          _id:            { refDocNo: '$refDocNo', connectorId: '$connectorId', connectorAppEventId: '$connectorAppEventId' },
          hasSuccess:     { $max: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          hasFailed:      hasFailedExpr,
          hasPending:     { $max: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
          latestError:    { $last: '$error' },
          latestDate:     { $max: '$transactionDate' },
          failedAttempts: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          latestJobId:    { $last: '$_id' },
        },
      },
    ]);

    // Connector-scoped path: post-filter to only invoice-relevant job groups.
    // The MongoDB query was intentionally broad (connectorId + date) to avoid
    // a huge refDocNo $in, so groups for non-invoice events may be included.
    const invoiceIdsSet = connectorScoped ? new Set(invoiceIds) : null;
    const jobGroups = invoiceIdsSet
      ? allJobGroups.filter((g) => invoiceIdsSet.has(g._id.refDocNo))
      : allJobGroups;

    // Roll up to invoice level across all connectors
    const byInvoice = new Map<string, {
      hasSuccess: boolean; hasAnyJob: boolean; hasAnyFailed: boolean; hasPendingOnly: boolean;
    }>();
    for (const id of invoiceIds) {
      byInvoice.set(id, { hasSuccess: false, hasAnyJob: false, hasAnyFailed: false, hasPendingOnly: false });
    }

    // Track invoices that have at least one event-group that is purely pending
    // (no failure AND no success on that specific event group). Since groups are
    // now at the event level, Event A (succeeded) and Event B (pending) are
    // separate entries, so Event A's success no longer silences Event B's pending.
    // Guard: !g.hasSuccess ensures that a group with retries that eventually
    // succeeded (hasSuccess=1 AND hasPending=1) does NOT appear as pending.
    const hasPendingGroupIds = new Set<string>();

    for (const g of jobGroups) {
      const inv = byInvoice.get(g._id.refDocNo);
      if (!inv) continue;
      inv.hasAnyJob = true;
      if (g.hasSuccess) inv.hasSuccess = true;
      if (g.hasFailed && !g.hasSuccess) inv.hasAnyFailed = true;
      if (g.hasPending && !g.hasFailed && !g.hasSuccess) hasPendingGroupIds.add(g._id.refDocNo);
    }

    // hasPendingOnly: any event-group for this invoice is purely in-flight.
    // A different event having succeeded does NOT disqualify this — the invoice
    // still has unfinished work.
    for (const [id, inv] of byInvoice) {
      inv.hasPendingOnly = inv.hasAnyJob && !inv.hasAnyFailed && hasPendingGroupIds.has(id);
    }

    const byPair = jobGroups.map((g) => {
      const purelyFailed = !!g.hasFailed && !g.hasSuccess;
      // pendingOnly: this event-group has no success yet and no failures.
      // Because grouping is now per-event, this correctly fires for Event B
      // (pending) while NOT firing for Event A (succeeded, even if it had
      // earlier pending retries, because g.hasSuccess=1 guards it).
      const pendingOnly = !g.hasSuccess && !g.hasFailed;
      return {
        refDocNo:            g._id.refDocNo,
        connectorId:         g._id.connectorId,
        connectorAppEventId: g._id.connectorAppEventId,
        hasSuccess:          !!g.hasSuccess,
        hasFailed:           purelyFailed,
        hasPendingOnly:      pendingOnly,
        latestError:         g.latestError,
        latestDate:          g.latestDate,
        failedAttempts:      g.failedAttempts,
        latestJobId:         g.latestJobId,
      };
    });

    return { invoiceIds, byInvoice, byPair };
  }

  /** Looks up the Zwing MySQL db_name for a single enterprise via the master vendor table. */
  async getVendorDbName(ssoEnterpriseId: string): Promise<string | null> {
    try {
      const row = await this.mysql.queryOne<{ db_name: string }>(
        this.mysql.getMasterDb(),
        `SELECT db_name FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
        [ssoEnterpriseId],
      );
      return row?.db_name ?? null;
    } catch {
      return null;
    }
  }
}
