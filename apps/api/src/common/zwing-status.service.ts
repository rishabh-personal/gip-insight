import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  /** per (invoice, connector) pair — for detailed / drill-down views */
  byPair: Array<{
    refDocNo: string;
    connectorId: unknown;
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
  ): Promise<ZwingJobStatusResult> {
    const empty: ZwingJobStatusResult = { invoiceIds: [], byInvoice: new Map(), byPair: [] };

    let rows: { invoice_id: string | number }[];
    try {
      rows = await this.mysql.query<{ invoice_id: string | number }>(
        dbName,
        `SELECT invoice_id FROM invoices
         WHERE created_at BETWEEN ? AND ? AND deleted_at IS NULL`,
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

    const jobGroups = await this.jobModel.aggregate([
      {
        $match: {
          ssoEnterpriseId,
          refDocNo: { $in: invoiceIds },
          transactionDate: { $gte: from }, // no upper bound
        },
      },
      { $sort: { transactionDate: -1 } },
      {
        $group: {
          _id:            { refDocNo: '$refDocNo', connectorId: '$connectorId' },
          hasSuccess:     { $max: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          hasFailed:      { $max: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          hasPending:     { $max: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
          latestError:    { $first: '$error' },
          latestDate:     { $first: '$transactionDate' },
          failedAttempts: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          latestJobId:    { $first: '$_id' },
        },
      },
    ]);

    // Roll up to invoice level across all connectors
    const byInvoice = new Map<string, {
      hasSuccess: boolean; hasAnyJob: boolean; hasAnyFailed: boolean; hasPendingOnly: boolean;
    }>();
    for (const id of invoiceIds) {
      byInvoice.set(id, { hasSuccess: false, hasAnyJob: false, hasAnyFailed: false, hasPendingOnly: false });
    }
    for (const g of jobGroups) {
      const inv = byInvoice.get(g._id.refDocNo);
      if (!inv) continue;
      inv.hasAnyJob = true;
      if (g.hasSuccess) inv.hasSuccess = true;
      // hasFailed on pair = failed attempts AND no success for this connector
      if (g.hasFailed && !g.hasSuccess) inv.hasAnyFailed = true;
    }
    // hasPendingOnly: jobs exist but none succeeded and none are purely failed yet
    for (const [, inv] of byInvoice) {
      inv.hasPendingOnly = inv.hasAnyJob && !inv.hasSuccess && !inv.hasAnyFailed;
    }

    const byPair = jobGroups.map((g) => {
      const purelyFailed = !!g.hasFailed && !g.hasSuccess;
      const pendingOnly  = !g.hasSuccess && !purelyFailed; // has a job but not failed/succeeded
      return {
        refDocNo:       g._id.refDocNo,
        connectorId:    g._id.connectorId,
        hasSuccess:     !!g.hasSuccess,
        hasFailed:      purelyFailed,
        hasPendingOnly: pendingOnly,
        latestError:    g.latestError,
        latestDate:     g.latestDate,
        failedAttempts: g.failedAttempts,
        latestJobId:    g.latestJobId,
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
