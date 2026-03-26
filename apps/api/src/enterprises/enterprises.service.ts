import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enterprise } from '../schemas/enterprise.schema';
import { Connector } from '../schemas/connector.schema';
import { ConnectorEventMapping } from '../schemas/connector-event-mapping.schema';
import { AppCatalog } from '../schemas/app-catalog.schema';
import { EventCatalog } from '../schemas/event-catalog.schema';
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
    private readonly mysql: MysqlTenantService,
    private readonly zwingStatus: ZwingStatusService,
  ) {}

  /**
   * Returns enterprises that have at least one active private app in the apps collection.
   * Lightweight — no metrics, no MySQL queries. Fast first render.
   */
  async listEnterpriseStubs(opts: { search?: string; appName?: string }): Promise<any> {
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
    let succeeded = 0, failed = 0, missing = 0;
    for (const [, v] of byInvoice) {
      if (v.hasSuccess)       succeeded++;
      else if (v.hasAnyJob)   failed++;
      else                    missing++;
    }
    const processed    = succeeded + failed;
    const sync_gap     = missing;
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
        zwing_invoices, succeeded, failed, missing, processed, sync_gap,
        success: succeeded,
        total_jobs: processed,
        gip_events: processed,
        pending: 0,
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
    let byPair: Array<{ refDocNo: string; connectorId: any; hasSuccess: boolean; hasFailed: boolean }> = [];
    let zwingInvoiceIds: string[] = [];
    if (dbName) {
      const status = await this.zwingStatus.buildZwingJobStatus(ssoEnterpriseId, dbName, from, to);
      byPair = status.byPair;
      zwingInvoiceIds = status.invoiceIds;
    }

    const connectorMetrics: Record<string, { zwing: number; succeeded: number; failed: number }> = {};
    for (const cid of connectorIds.map((id) => id.toString())) {
      connectorMetrics[cid] = { zwing: zwingInvoiceIds.length, succeeded: 0, failed: 0 };
    }
    for (const p of byPair) {
      const cid = p.connectorId?.toString();
      if (!cid || !connectorMetrics[cid]) continue;
      if (p.hasSuccess)     connectorMetrics[cid].succeeded++;
      else if (p.hasFailed) connectorMetrics[cid].failed++;
    }

    const enrichedConnectors = connectors.map((c) => {
      const cid = c._id.toString();
      const cm  = connectorMetrics[cid] ?? { zwing: 0, succeeded: 0, failed: 0 };
      const total_jobs   = cm.succeeded + cm.failed;
      const success_rate = cm.zwing > 0
        ? Math.round((cm.succeeded / cm.zwing) * 100 * 10) / 10 : 0;
      const failure_rate = cm.zwing > 0
        ? Math.round((cm.failed / cm.zwing) * 100 * 10) / 10 : 0;

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
          zwing_invoices: cm.zwing, total_jobs,
          succeeded: cm.succeeded, failed: cm.failed,
          success: cm.succeeded, pending: 0,
          failure_rate, success_rate,
        },
      };
    });

    return {
      enterprise: { ...enterprise, dbName: vendor?.db_name },
      connectors: enrichedConnectors,
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
