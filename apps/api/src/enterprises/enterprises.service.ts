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

@Injectable()
export class EnterprisesService {
  private readonly logger = new Logger(EnterprisesService.name);

  constructor(
    @InjectModel(Enterprise.name) private enterpriseModel: Model<Enterprise>,
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
    @InjectModel(ConnectorEventMapping.name) private cemModel: Model<ConnectorEventMapping>,
    @InjectModel(AppCatalog.name) private appModel: Model<AppCatalog>,
    @InjectModel(EventCatalog.name) private eventModel: Model<EventCatalog>,
    @InjectModel(DipJob.name) private dipJobModel: Model<DipJob>,
    private readonly mysql: MysqlTenantService,
  ) {}

  /**
   * Returns enterprises that have at least one active private app in the apps collection.
   * Private apps (accessType:'private') are enterprise-owned and carry ssoEnterpriseId.
   * Lightweight — no metrics, no MySQL queries. Fast first render.
   */
  async listEnterpriseStubs(opts: { search?: string; appName?: string }): Promise<any> {
    // Query apps that belong to an enterprise (private apps with ssoEnterpriseId)
    const appFilter: any = {
      ssoEnterpriseId: { $exists: true, $ne: null },
      deletedOn: null,
    };
    if (opts.appName) {
      appFilter.name = { $regex: opts.appName, $options: 'i' };
    }

    const enterpriseApps = await this.appModel
      .find(appFilter, { ssoEnterpriseId: 1, name: 1, accessType: 1, isEnabled: 1 })
      .lean();

    if (!enterpriseApps.length) return { data: [], meta: { total: 0 } };

    // Group apps by enterprise
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

    const ssoIds = Object.keys(appsByEnterprise);

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

  /**
   * Returns distinct app names used as private apps (for the filter dropdown).
   */
  async listApps(): Promise<any> {
    const apps = await this.appModel
      .find(
        { ssoEnterpriseId: { $exists: true, $ne: null }, deletedOn: null },
        { name: 1, accessType: 1 },
      )
      .lean();

    // Deduplicate by name
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
   */
  async getEnterpriseMetrics(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
  ): Promise<any> {
    const [jobAgg, vendorRows] = await Promise.all([
      this.dipJobModel.aggregate([
        {
          $match: {
            ssoEnterpriseId,
            transactionDate: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.getVendorRows([ssoEnterpriseId]),
    ]);

    const jobs: Record<string, number> = {};
    for (const row of jobAgg) jobs[row._id] = row.count;

    const total_jobs = Object.values(jobs).reduce((a: number, b: number) => a + b, 0);
    const failed = jobs['failed'] || 0;
    const success = jobs['success'] || 0;
    const pending = jobs['pending'] || 0;
    const processing = jobs['processing'] || 0;
    const failure_rate = total_jobs > 0 ? Math.round((failed / total_jobs) * 100 * 10) / 10 : 0;

    const invoiceCounts = await this.batchInvoiceCounts(vendorRows, from, to);
    const zwing_invoices = invoiceCounts[ssoEnterpriseId] ?? null;
    const gip_events = total_jobs;
    const sync_gap = zwing_invoices != null ? Math.max(0, zwing_invoices - gip_events) : null;

    const health =
      (sync_gap != null && sync_gap > 0) || failure_rate > 10
        ? 'red'
        : failure_rate >= 2
        ? 'yellow'
        : 'green';

    return {
      ssoEnterpriseId,
      health,
      dbName: vendorRows[0]?.db_name ?? null,
      metrics: {
        zwing_invoices,
        gip_events,
        sync_gap,
        total_jobs,
        success,
        failed,
        pending,
        processing,
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

    const [apps, cemList, jobAgg] = await Promise.all([
      this.appModel.find({ _id: { $in: appIds.map((id) => new Types.ObjectId(id)) } }).lean(),
      this.cemModel.find({ connectorId: { $in: connectorIds } }).lean(),
      this.dipJobModel.aggregate([
        {
          $match: {
            connectorId: { $in: connectorIds },
            transactionDate: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: { connectorId: '$connectorId', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
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

    const jobMap: Record<string, Record<string, number>> = {};
    for (const row of jobAgg) {
      const cid = row._id.connectorId.toString();
      if (!jobMap[cid]) jobMap[cid] = {};
      jobMap[cid][row._id.status] = row.count;
    }

    const enrichedConnectors = connectors.map((c) => {
      const jobs = jobMap[c._id.toString()] || {};
      const total_jobs = Object.values(jobs).reduce((a: number, b: number) => a + (b as number), 0);
      const failed = jobs['failed'] || 0;
      const failure_rate = total_jobs > 0 ? Math.round((failed / total_jobs) * 100 * 10) / 10 : 0;

      const mappings = cemList
        .filter((m) => m.connectorId.toString() === c._id.toString())
        .map((m) => ({
          _id: m._id,
          outboundEvent: eventMap[m.outboundEventId?.toString()],
          inboundEvent: eventMap[m.inboundEventId?.toString()],
          isEnabled: m.isEnabled,
          isRetryable: m.isRetryable,
        }));

      return {
        _id: c._id,
        name: c.name,
        outboundApp: appMap[c.outboundAppId?.toString()],
        inboundApp: appMap[c.inboundAppId?.toString()],
        isEnabled: c.isEnabled,
        deletedOn: c.deletedOn,
        mappings,
        metrics: {
          total_jobs,
          failed,
          success: jobs['success'] || 0,
          pending: jobs['pending'] || 0,
          failure_rate,
        },
      };
    });

    return {
      enterprise: {
        ...enterprise,
        dbName: vendor?.db_name,
      },
      connectors: enrichedConnectors,
    };
  }

  private async getVendorRows(ssoIds: string[]): Promise<any[]> {
    if (!ssoIds.length) return [];
    try {
      const placeholders = ssoIds.map(() => '?').join(',');
      return await this.mysql.query(
        this.mysql.getMasterDb(),
        `SELECT id, name, sso_enterprise_id, db_name, db_type, status FROM vendor WHERE sso_enterprise_id IN (${placeholders}) AND deleted = 0`,
        ssoIds,
      );
    } catch (e) {
      this.logger.warn(`Vendor query failed: ${e.message}`);
      return [];
    }
  }

  private async batchInvoiceCounts(
    vendors: any[],
    from: Date,
    to: Date,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    await Promise.allSettled(
      vendors.map(async (v) => {
        if (!v.db_name) return;
        try {
          const rows = await this.mysql.query(
            v.db_name,
            `SELECT COUNT(*) as cnt FROM invoices WHERE created_at BETWEEN ? AND ? AND deleted_at IS NULL`,
            [from, to],
          );
          result[v.sso_enterprise_id] = (rows[0] as any)?.cnt ?? 0;
        } catch (e) {
          this.logger.warn(`Invoice count failed for ${v.db_name}: ${e.message}`);
        }
      }),
    );
    return result;
  }
}
