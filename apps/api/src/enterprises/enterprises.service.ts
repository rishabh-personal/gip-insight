import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enterprise } from '../schemas/enterprise.schema';
import { Connector } from '../schemas/connector.schema';
import { ConnectorEventMapping } from '../schemas/connector-event-mapping.schema';
import { AppCatalog } from '../schemas/app-catalog.schema';
import { EventCatalog } from '../schemas/event-catalog.schema';
import { DipJob } from '../schemas/dip-job.schema';
import { MysqlTenantService } from '../database/mysql-tenant.service';
import { ZwingStatusService, errMsg } from '../common/zwing-status.service';

@Injectable()
export class EnterprisesService {
  private readonly logger = new Logger(EnterprisesService.name);

  constructor(
    @InjectModel(Enterprise.name) private readonly enterpriseModel: Model<Enterprise>,
    @InjectModel(Connector.name) private readonly connectorModel: Model<Connector>,
    @InjectModel(ConnectorEventMapping.name) private readonly cemModel: Model<ConnectorEventMapping>,
    @InjectModel(AppCatalog.name) private readonly appModel: Model<AppCatalog>,
    @InjectModel(EventCatalog.name) private readonly eventModel: Model<EventCatalog>,
    @InjectModel(DipJob.name) private readonly jobModel: Model<DipJob>,
    private readonly mysql: MysqlTenantService,
    private readonly zwingStatus: ZwingStatusService,
  ) {}

  /**
   * Returns enterprises that have at least one active private app in the apps collection.
   * Lightweight — no metrics, no MySQL queries. Fast first render.
   */
  async listEnterpriseStubs(opts: { search?: string; connectorName?: string }): Promise<any> {
    // 1. Find all enterprises that have at least one private app
    const enterpriseApps = await this.appModel
      .find(
        { ssoEnterpriseId: { $exists: true, $ne: null }, deletedOn: null },
        { ssoEnterpriseId: 1, name: 1, accessType: 1, isEnabled: 1 },
      )
      .lean();

    if (!enterpriseApps.length) return { data: [], meta: { total: 0 } };

    const appsByEnterprise: Record<string, any[]> = {};
    for (const app of enterpriseApps) {
      const eid = app.ssoEnterpriseId;
      if (!appsByEnterprise[eid]) appsByEnterprise[eid] = [];
      appsByEnterprise[eid].push({
        _id: app._id.toString(),
        name: app.name,
        accessType: app.accessType,
        isEnabled: app.isEnabled,
      });
    }

    let ssoIds = Object.keys(appsByEnterprise);

    // 2. If a connector name filter is specified, narrow down to only enterprises
    //    that have a connector with that exact name.
    if (opts.connectorName) {
      const matchingConnectors = await this.connectorModel
        .find(
          { name: opts.connectorName, ssoEnterpriseId: { $in: ssoIds } },
          { ssoEnterpriseId: 1 },
        )
        .lean();

      const connectorSsoIds = new Set(
        matchingConnectors.map((c) => c.ssoEnterpriseId).filter(Boolean),
      );
      ssoIds = ssoIds.filter((id) => connectorSsoIds.has(id));

      if (!ssoIds.length) return { data: [], meta: { total: 0 } };
    }

    // 3. Build enterprise filter
    const enterpriseFilter: any = {
      ssoEnterpriseId: { $in: ssoIds },
      'meta.zwingVId': { $exists: true, $ne: null },
    };
    if (opts.search) {
      enterpriseFilter.$or = [
        { tradeName: { $regex: opts.search, $options: 'i' } },
        { baCode: { $regex: opts.search, $options: 'i' } },
      ];
    }

    const enterprises = await this.enterpriseModel
      .find(enterpriseFilter)
      .sort({ tradeName: 1 })
      .lean();

    const data = enterprises.map((e) => ({
      _id: e._id,
      ssoEnterpriseId: e.ssoEnterpriseId,
      tradeName: e.tradeName,
      baCode: e.baCode,
      apps: appsByEnterprise[e.ssoEnterpriseId] || [],
    }));

    return { data, meta: { total: data.length } };
  }

  /** Returns distinct connector names across all relevant enterprises (for the pin dropdown). */
  async listConnectors(): Promise<{ name: string }[]> {
    const docs = await this.connectorModel
      .find({ deletedOn: null }, { name: 1 })
      .lean();
    const seen = new Set<string>();
    const unique: { name: string }[] = [];
    for (const c of docs) {
      if (c.name && !seen.has(c.name)) {
        seen.add(c.name);
        unique.push({ name: c.name });
      }
    }
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Returns distinct app names used as private apps (for the filter dropdown). */
  async listApps(): Promise<any> {
    const apps = await this.appModel
      .find(
        { ssoEnterpriseId: { $exists: true, $ne: null }, deletedOn: null },
        { name: 1 },
      )
      .lean();

    const seen = new Set<string>();
    const unique: any[] = [];
    for (const a of apps) {
      if (!seen.has(a.name)) {
        seen.add(a.name);
        unique.push({ _id: a._id, name: a.name });
      }
    }
    unique.sort((a, b) => a.name.localeCompare(b.name));
    return unique;
  }

  /**
   * Metrics for a single enterprise — called async per row after list renders.
   * Zwing MySQL is the source of truth; GIP MongoDB checked for each invoice.
   */
  async getEnterpriseMetrics(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
  ): Promise<any> {
    const vendorRows = await this.getVendorRows([ssoEnterpriseId]);
    const dbName = vendorRows[0]?.db_name ?? null;

    if (!dbName) {
      return {
        ssoEnterpriseId, health: 'red', dbName: null,
        metrics: { zwing_invoices: null, succeeded: 0, failed: 0, missing: 0, success_rate: 0, failure_rate: 0, sync_gap: null },
      };
    }

    const { invoiceIds, byInvoice } = await this.zwingStatus.buildZwingJobStatus(
      ssoEnterpriseId, dbName, from, to,
    );

    const zwing_invoices = invoiceIds.length;
    let succeeded = 0, failed = 0, pending = 0, missing = 0;
    for (const [, v] of byInvoice) {
      // hasAnyFailed takes priority: if ANY connector failed for this invoice,
      // surface it as a failure even if another connector delivered it successfully.
      if (v.hasAnyFailed)        failed++;
      else if (v.hasSuccess)     succeeded++;
      else if (v.hasPendingOnly) pending++;
      else                       missing++;
    }
    const processed    = succeeded + failed;
    const sync_gap     = missing + pending;
    const success_rate = zwing_invoices > 0
      ? Math.round((succeeded / zwing_invoices) * 100 * 10) / 10 : 0;
    const failure_rate = zwing_invoices > 0
      ? Math.round((failed / zwing_invoices) * 100 * 10) / 10 : 0;

    const health =
      sync_gap > 0 || failure_rate > 10 ? 'red' :
      failure_rate >= 2                 ? 'yellow' : 'green';

    return {
      ssoEnterpriseId,
      health,
      dbName,
      metrics: {
        zwing_invoices, succeeded, failed, pending, missing, processed, sync_gap,
        success: succeeded,
        total_jobs: processed,
        gip_events: processed,
        processing: 0,
        success_rate,
        failure_rate,
      },
    };
  }

  async getEnterpriseDetail(ssoEnterpriseId: string, from: Date, to: Date): Promise<any> {
    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return null;

    const vendorRows = await this.getVendorRows([ssoEnterpriseId]);
    const vendor = vendorRows[0] ?? null;

    const connectors = await this.connectorModel
      .find({ ssoEnterpriseId, deletedOn: null })
      .lean();

    const connectorIds = connectors.map((c) => c._id);
    const appIds = [
      ...new Set([
        ...connectors.map((c) => c.outboundAppId?.toString()),
        ...connectors.map((c) => c.inboundAppId?.toString()),
      ]),
    ].filter(Boolean);

    const [apps, cemList] = await Promise.all([
      this.appModel.find({ _id: { $in: appIds.map((id) => new Types.ObjectId(id)) } }).lean(),
      this.cemModel.find({ connectorId: { $in: connectorIds } }).lean(),
    ]);

    const appMap: Record<string, any> = {};
    for (const app of apps) appMap[app._id.toString()] = app;

    const eventIds = [
      ...new Set([
        ...cemList.map((c) => c.outboundEventId?.toString()),
        ...cemList.map((c) => c.inboundEventId?.toString()),
      ]),
    ].filter(Boolean);

    const events = await this.eventModel
      .find({ _id: { $in: eventIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const eventMap: Record<string, any> = {};
    for (const ev of events) eventMap[ev._id.toString()] = ev;

    const dbName = vendor?.db_name ?? null;
    let byPair: Array<{ refDocNo: string; connectorId: any; hasSuccess: boolean; hasFailed: boolean; hasPendingOnly: boolean }> = [];
    let zwingInvoiceIds: string[] = [];
    let byInvoice: Map<string, { hasSuccess: boolean; hasAnyJob: boolean; hasAnyFailed: boolean; hasPendingOnly: boolean }> = new Map();
    if (dbName) {
      const status = await this.zwingStatus.buildZwingJobStatus(ssoEnterpriseId, dbName, from, to);
      byPair = status.byPair;
      zwingInvoiceIds = status.invoiceIds;
      byInvoice = status.byInvoice;
    }

    // Overall invoice-level totals (same logic as getEnterpriseMetrics)
    let totalSucceeded = 0, totalFailed = 0, totalPending = 0, totalMissing = 0;
    for (const [, v] of byInvoice) {
      // hasAnyFailed takes priority: if ANY connector failed for this invoice,
      // surface it as a failure even if another connector delivered it successfully.
      if (v.hasAnyFailed)        totalFailed++;
      else if (v.hasSuccess)     totalSucceeded++;
      else if (v.hasPendingOnly) totalPending++;
      else                       totalMissing++;
    }
    const zwing_invoices = zwingInvoiceIds.length;
    const total_success_rate = zwing_invoices > 0
      ? Math.round((totalSucceeded / zwing_invoices) * 100 * 10) / 10 : 0;

    const connectorMetrics: Record<string, { zwing: number; succeeded: number; failed: number; pending: number; missing: number }> = {};
    for (const cid of connectorIds.map((id) => id.toString())) {
      connectorMetrics[cid] = { zwing: zwingInvoiceIds.length, succeeded: 0, failed: 0, pending: 0, missing: 0 };
    }
    for (const p of byPair) {
      const cid = p.connectorId?.toString();
      if (!cid || !connectorMetrics[cid]) continue;
      if (p.hasSuccess)          connectorMetrics[cid].succeeded++;
      else if (p.hasPendingOnly) connectorMetrics[cid].pending++;
      else if (p.hasFailed)      connectorMetrics[cid].failed++;
    }
    // Invoices in Zwing with no DipJob for this connector (not failed — never reached GIP)
    for (const cid of connectorIds.map((id) => id.toString())) {
      const cm = connectorMetrics[cid];
      cm.missing = Math.max(0, cm.zwing - cm.succeeded - cm.failed - cm.pending);
    }

    const MISSING_REF_DOC_CAP = 500;
    const invoicesWithJobByConnector = new Map<string, Set<string>>();
    for (const cid of connectorIds.map((id) => id.toString())) {
      invoicesWithJobByConnector.set(cid, new Set());
    }
    for (const p of byPair) {
      const cid = p.connectorId?.toString();
      if (!cid || !invoicesWithJobByConnector.has(cid)) continue;
      invoicesWithJobByConnector.get(cid)!.add(String(p.refDocNo));
    }

    // ── Event-wise metrics: group jobs by connectorAppEventId (= CEM _id) ──
    // connectorAppEventId in DipJob is a direct FK to connectorEventMappings._id.
    const eventMetricsRaw = zwingInvoiceIds.length > 0
      ? await this.jobModel.aggregate([
          {
            $match: {
              ssoEnterpriseId,
              refDocNo:             { $in: zwingInvoiceIds },
              transactionDate:      { $gte: from },
              connectorAppEventId:  { $exists: true, $ne: null },
            },
          },
          {
            // Collapse retries: one row per (refDocNo, connectorAppEventId)
            $group: {
              _id: {
                refDocNo:            '$refDocNo',
                connectorAppEventId: '$connectorAppEventId',
              },
              hasSuccess: { $max: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
              hasFailed:  { $max: { $cond: [{ $eq: ['$status', 'failed'] },  1, 0] } },
              hasPending: { $max: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
            },
          },
          {
            // Roll up to connectorAppEventId level — invoice counts per CEM
            $group: {
              _id: '$_id.connectorAppEventId',
              succeeded: { $sum: '$hasSuccess' },
              failed:    { $sum: { $cond: [{ $and: [{ $eq: ['$hasFailed', 1] }, { $eq: ['$hasSuccess', 0] }] }, 1, 0] } },
              pending:   { $sum: { $cond: [{ $and: [{ $eq: ['$hasPending', 1] }, { $eq: ['$hasSuccess', 0] }, { $eq: ['$hasFailed', 0] }] }, 1, 0] } },
            },
          },
        ])
      : [];

    // Index by CEM _id string → metrics
    const eventMetricsMap = new Map<string, { succeeded: number; failed: number; pending: number }>();
    for (const row of eventMetricsRaw) {
      const cemId = row._id?.toString();
      if (!cemId) continue;
      eventMetricsMap.set(cemId, {
        succeeded: row.succeeded,
        failed:    row.failed,
        pending:   row.pending,
      });
    }

    // DEBUG — remove after confirming event metrics work
    this.logger.debug(
      `[eventMetrics] enterprise=${ssoEnterpriseId} ` +
      `zwingInvoices=${zwingInvoiceIds.length} ` +
      `aggRows=${eventMetricsRaw.length} ` +
      `mapKeys=[${[...eventMetricsMap.keys()].join(',')}] ` +
      `cemIds=[${cemList.map((m) => m._id.toString()).join(',')}]`,
    );

    const enrichedConnectors = connectors.map((c) => {
      const cid = c._id.toString();
      const cm  = connectorMetrics[cid] ?? { zwing: 0, succeeded: 0, failed: 0, pending: 0, missing: 0 };
      const total_jobs   = cm.succeeded + cm.failed + cm.pending;
      const success_rate = cm.zwing > 0
        ? Math.round((cm.succeeded / cm.zwing) * 100 * 10) / 10 : 0;
      const failure_rate = cm.zwing > 0
        ? Math.round((cm.failed / cm.zwing) * 100 * 10) / 10 : 0;

      const touched = invoicesWithJobByConnector.get(cid) ?? new Set<string>();
      let missingRefDocNos: string[] = [];
      let missingRefDocNosTruncated = false;
      if (cm.missing > 0) {
        const allMissing = zwingInvoiceIds.filter((id) => !touched.has(String(id))).sort();
        missingRefDocNosTruncated = allMissing.length > MISSING_REF_DOC_CAP;
        missingRefDocNos = missingRefDocNosTruncated
          ? allMissing.slice(0, MISSING_REF_DOC_CAP)
          : allMissing;
      }

      const mappings = cemList
        .filter((m) => m.connectorId.toString() === c._id.toString())
        .map((m) => {
          const em = eventMetricsMap.get(m._id.toString());
          const zwing = zwingInvoiceIds.length;
          const eventSuccessRate = zwing > 0 && em
            ? Math.round((em.succeeded / zwing) * 100 * 10) / 10 : 0;
          const eventMissing = em
            ? Math.max(0, zwing - em.succeeded - em.failed - em.pending)
            : undefined;
          return {
            _id:           m._id,
            outboundEvent: eventMap[m.outboundEventId?.toString()],
            inboundEvent:  eventMap[m.inboundEventId?.toString()],
            isEnabled:     m.isEnabled,
            isRetryable:   m.isRetryable,
            metrics: em
              ? {
                  succeeded: em.succeeded,
                  failed: em.failed,
                  pending: em.pending,
                  missing: eventMissing,
                  success_rate: eventSuccessRate,
                }
              : null,
          };
        });

      return {
        _id: c._id,
        name: c.name,
        outboundApp: appMap[c.outboundAppId?.toString()],
        inboundApp: appMap[c.inboundAppId?.toString()],
        isEnabled: c.isEnabled,
        deletedOn: c.deletedOn,
        mappings,
        metrics: {
          zwing_invoices: cm.zwing,
          total_jobs,
          succeeded: cm.succeeded,
          failed: cm.failed,
          pending: cm.pending,
          missing: cm.missing,
          missingRefDocNos,
          missingRefDocNosTruncated,
          success: cm.succeeded,
          failure_rate,
          success_rate,
        },
      };
    });

    return {
      enterprise: { ...enterprise, dbName: vendor?.db_name },
      connectors: enrichedConnectors,
      totals: {
        total: zwing_invoices,
        success: totalSucceeded,
        failed: totalFailed,
        pending: totalPending,
        missing: totalMissing,
        success_rate: total_success_rate,
      },
      _debug: {
        zwingInvoiceCount: zwingInvoiceIds.length,
        eventAggRows: eventMetricsRaw.length,
        eventMapKeys: [...eventMetricsMap.keys()],
        cemListIds: cemList.map((m) => m._id.toString()),
      },
    };
  }

  private async getVendorRows(ssoIds: string[]): Promise<any[]> {
    if (!ssoIds.length) return [];
    try {
      const placeholders = ssoIds.map(() => '?').join(',');
      return await this.mysql.query(
        this.mysql.getMasterDb(),
        `SELECT id, name, sso_enterprise_id, db_name FROM vendor WHERE sso_enterprise_id IN (${placeholders}) AND deleted = 0`,
        ssoIds,
      );
    } catch (e) {
      this.logger.warn(`Vendor query failed: ${errMsg(e)}`);
      return [];
    }
  }
}
