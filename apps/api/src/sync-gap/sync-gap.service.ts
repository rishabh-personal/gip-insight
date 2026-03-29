import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DipJob } from '../schemas/dip-job.schema';
import { Enterprise } from '../schemas/enterprise.schema';
import { MysqlTenantService } from '../database/mysql-tenant.service';
import { ZwingStatusService, errMsg } from '../common/zwing-status.service';

@Injectable()
export class SyncGapService {
  private readonly logger = new Logger(SyncGapService.name);

  constructor(
    @InjectModel(DipJob.name) private jobModel: Model<DipJob>,
    @InjectModel(Enterprise.name) private enterpriseModel: Model<Enterprise>,
    private readonly mysql: MysqlTenantService,
    private readonly zwingStatus: ZwingStatusService,
  ) {}

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

    const vendors = await this.mysql.query(
      this.mysql.getMasterDb(),
      `SELECT db_name FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
      [ssoEnterpriseId],
    );
    const vendor = vendors[0] as any;
    if (!vendor?.db_name) throw new Error('No Zwing db_name for this enterprise');

    const BATCH = 1000;
    let updated = 0;
    let batches = 0;

    for (let i = 0; i < invoiceIds.length; i += BATCH) {
      const chunk = invoiceIds.slice(i, i + BATCH);
      const placeholders = chunk.map(() => '?').join(',');
      const result = await this.mysql.query(
        vendor.db_name,
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
   * Returns invoices that have been captured by GIP but whose jobs are still
   * in pending/processing state (no success, no failure yet).
   * These can be re-triggered the same way as missed events.
   */
  async getPendingInvoices(ssoEnterpriseId: string, from: Date, to: Date): Promise<any> {
    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return { data: null };

    const vendors = await this.mysql.query(
      this.mysql.getMasterDb(),
      `SELECT db_name FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
      [ssoEnterpriseId],
    );
    const vendor = vendors[0] as any;
    if (!vendor?.db_name) {
      return { data: { enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName }, count: 0, pendingInvoices: [] } };
    }

    const [zwingRows, statusResult] = await Promise.all([
      this.mysql.query(
        vendor.db_name,
        `SELECT invoice_id, store_id, transaction_type, transaction_sub_type, status, created_at
         FROM invoices WHERE created_at BETWEEN ? AND ? AND deleted_at IS NULL`,
        [from, to],
      ).catch((e) => {
        this.logger.warn(`[getPendingInvoices] MySQL query failed: ${errMsg(e)}`);
        return [] as any[];
      }),
      this.zwingStatus.buildZwingJobStatus(ssoEnterpriseId, vendor.db_name, from, to),
    ]);

    const { byInvoice, byPair } = statusResult;

    // Find invoices that are pending-only
    const pendingIds = new Set(
      [...byInvoice.entries()]
        .filter(([, v]) => v.hasPendingOnly)
        .map(([id]) => id),
    );

    if (!pendingIds.size) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName, dbName: vendor.db_name },
          count: 0,
          pendingInvoices: [],
        },
      };
    }

    // Build latest GIP job info per invoice (take the most recent pair)
    const jobInfoMap = new Map<string, { latestDate: Date }>();
    for (const p of byPair) {
      if (!p.hasPendingOnly || !pendingIds.has(p.refDocNo)) continue;
      const existing = jobInfoMap.get(p.refDocNo);
      if (!existing || (p.latestDate && p.latestDate > existing.latestDate)) {
        jobInfoMap.set(p.refDocNo, { latestDate: p.latestDate });
      }
    }

    const pendingInvoices = (zwingRows as any[])
      .filter((r) => pendingIds.has(String(r.invoice_id)))
      .map((r) => ({
        ...r,
        gipLastAttempt: jobInfoMap.get(String(r.invoice_id))?.latestDate ?? null,
      }));

    return {
      data: {
        enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName, dbName: vendor.db_name },
        count: pendingInvoices.length,
        pendingInvoices,
      },
    };
  }

  async getSyncGap(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    opts: { transactionType?: string; storeId?: string } = {},
  ) {
    // Find enterprise and its db_name
    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return { data: null };

    const vendors = await this.mysql.query(
      this.mysql.getMasterDb(),
      `SELECT db_name, id FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
      [ssoEnterpriseId],
    );
    const vendor = vendors[0] as any;
    if (!vendor?.db_name) {
      return {
        data: {
          enterprise: { ssoEnterpriseId, tradeName: enterprise.tradeName },
          zwingCount: null,
          gipCount: 0,
          gap: null,
          missedEvents: [],
          error: 'No Zwing db_name configured for this enterprise',
        },
      };
    }

    // Build Zwing invoice query
    let invoiceWhere = `created_at BETWEEN ? AND ? AND deleted_at IS NULL`;
    const invoiceParams: any[] = [from, to];
    if (opts.transactionType) {
      invoiceWhere += ` AND transaction_type = ?`;
      invoiceParams.push(opts.transactionType);
    }
    if (opts.storeId) {
      invoiceWhere += ` AND store_id = ?`;
      invoiceParams.push(opts.storeId);
    }

    const [zwingRows, gipJobRows] = await Promise.all([
      this.mysql.query(
        vendor.db_name,
        `SELECT invoice_id, store_id, transaction_type, transaction_sub_type, status, created_at
         FROM invoices WHERE ${invoiceWhere}`,
        invoiceParams,
      ).catch((e) => {
        this.logger.warn(`Zwing query failed: ${errMsg(e)}`);
        return [] as any[];
      }),
      this.jobModel
        .find({
          ssoEnterpriseId,
          transactionDate: { $gte: from, $lte: to },
        })
        .select('refDocNo')
        .lean(),
    ]);

    const gipSet = new Set(gipJobRows.map((j) => j.refDocNo));
    const missedEvents = (zwingRows as any[]).filter((r) => !gipSet.has(r.invoice_id));

    return {
      data: {
        enterprise: {
          ssoEnterpriseId,
          tradeName: enterprise.tradeName,
          dbName: vendor.db_name,
        },
        zwingCount: (zwingRows as any[]).length,
        gipCount: gipSet.size,
        gap: missedEvents.length,
        syncRate:
          (zwingRows as any[]).length > 0
            ? Math.round(
                (((zwingRows as any[]).length - missedEvents.length) /
                  (zwingRows as any[]).length) *
                  100 *
                  10,
              ) / 10
            : 100,
        missedEvents: missedEvents.slice(0, 500),
        from,
        to,
      },
    };
  }
}
