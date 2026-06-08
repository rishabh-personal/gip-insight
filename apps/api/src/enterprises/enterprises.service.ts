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
import { EVENT_SOURCE_CONFIGS, DEFAULT_INVOICE_EVENT_CODE } from '../config/event-recon-config';

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
    const names = await this.connectorModel.distinct('name', { deletedOn: null });
    return (names as string[])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  }

  /**
   * Returns all connectors with their enterprise count and tracked outbound events.
   * Used by the Connector Health page.
   */
  async listConnectorCatalog(): Promise<{
    connectors: { name: string; enterpriseCount: number; events: { eventCode: string; label: string }[] }[];
  }> {
    // Group connectors by name to get enterprise counts and all connector IDs per name
    const groups = await this.connectorModel.aggregate([
      { $match: { deletedOn: null } },
      {
        $group: {
          _id: '$name',
          enterpriseIds: { $addToSet: '$ssoEnterpriseId' },
          connectorIds: { $addToSet: '$_id' },
        },
      },
      { $project: { name: '$_id', enterpriseCount: { $size: '$enterpriseIds' }, connectorIds: 1 } },
      { $sort: { name: 1 } },
    ]);

    if (!groups.length) return { connectors: [] };

    const allConnectorIds = groups.flatMap((g) => g.connectorIds);

    const mappings = await this.cemModel
      .find({ connectorId: { $in: allConnectorIds } }, { connectorId: 1, outboundEventId: 1 })
      .lean();

    const outboundIds = [...new Set(mappings.map((m) => m.outboundEventId?.toString()).filter(Boolean))];

    const eventDocs = await this.eventModel
      .find({ _id: { $in: outboundIds } }, { eventCode: 1, name: 1 })
      .lean();

    const eventById = new Map(eventDocs.map((e) => [e._id.toString(), { eventCode: e.eventCode, label: e.name }]));

    const eventsByConnectorId = new Map<string, { eventCode: string; label: string }[]>();
    for (const m of mappings) {
      const cid = m.connectorId.toString();
      const ev = eventById.get(m.outboundEventId?.toString());
      if (ev) {
        if (!eventsByConnectorId.has(cid)) eventsByConnectorId.set(cid, []);
        eventsByConnectorId.get(cid)!.push(ev);
      }
    }

    const connectors = groups.map((g) => {
      const seen = new Map<string, { eventCode: string; label: string }>();
      for (const cid of g.connectorIds) {
        for (const ev of eventsByConnectorId.get(cid.toString()) ?? []) {
          seen.set(ev.eventCode, ev);
        }
      }
      return {
        name: g.name,
        enterpriseCount: g.enterpriseCount,
        events: [...seen.values()].sort((a, b) => a.eventCode.localeCompare(b.eventCode)),
      };
    });

    return { connectors };
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
   *
   * When `connectorName` is supplied (connector-tab mode), only jobs for that
   * connector are considered and success/failure is evaluated per-connector.
   * When omitted (All tab), cross-connector rollup with success-takes-priority.
   */
  async getEnterpriseMetrics(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    connectorName?: string,
  ): Promise<any> {
    // Vendor lookup + optional connector lookup run in parallel since neither depends on the other.
    const [vendorRows, connectorDocsRaw] = await Promise.all([
      this.getVendorRows([ssoEnterpriseId]),
      connectorName
        ? this.connectorModel.find({ ssoEnterpriseId, name: connectorName, deletedOn: null }, { _id: 1 }).lean()
        : Promise.resolve(null),
    ]);
    const dbName = vendorRows[0]?.db_name ?? null;

    if (!dbName) {
      return {
        ssoEnterpriseId, health: 'red', dbName: null,
        metrics: { zwing_invoices: null, succeeded: 0, failed: 0, missing: 0, success_rate: 0, failure_rate: 0, sync_gap: null },
      };
    }

    let connectorIds: string[] | undefined;
    if (connectorName) {
      connectorIds = (connectorDocsRaw ?? []).map((c) => c._id.toString());
      if (!connectorIds.length) {
        return {
          ssoEnterpriseId, health: 'green', dbName,
          metrics: { zwing_invoices: 0, succeeded: 0, failed: 0, pending: 0, missing: 0, processed: 0, sync_gap: 0, success: 0, total_jobs: 0, gip_events: 0, processing: 0, success_rate: 0, failure_rate: 0 },
        };
      }
    }

    const { invoiceIds, byInvoice, byPair } = await this.zwingStatus.buildZwingJobStatus(
      ssoEnterpriseId, dbName, from, to, connectorIds,
    );

    const zwing_invoices = invoiceIds.length;
    let succeeded = 0, failed = 0, pending = 0, missing = 0;

    if (connectorName && connectorIds?.length) {
      // ── Connector-tab mode: per-connector accuracy ────────────────────────
      // byPair is already scoped to this connector; build per-invoice rollup.
      const invoiceStatus = new Map<string, { hasSuccess: boolean; hasFailed: boolean; hasPending: boolean }>();
      for (const id of invoiceIds) {
        invoiceStatus.set(id, { hasSuccess: false, hasFailed: false, hasPending: false });
      }
      for (const p of byPair) {
        const inv = invoiceStatus.get(String(p.refDocNo));
        if (!inv) continue;
        if (p.hasSuccess)     inv.hasSuccess = true;
        if (p.hasFailed)      inv.hasFailed  = true;
        if (p.hasPendingOnly) inv.hasPending  = true;
      }
      for (const [, v] of invoiceStatus) {
        // pending before success: an invoice with both a succeeded event and a
        // pending event still needs attention — don't mark it as succeeded yet.
        if (v.hasFailed)       failed++;
        else if (v.hasPending) pending++;
        else if (v.hasSuccess) succeeded++;
        else                   missing++;
      }
    } else {
      // ── All-connectors mode: pending before success ──────────────────────
      // An invoice with both a succeeded event and a pending event on the same
      // connector must surface as pending, not succeeded.
      for (const [, v] of byInvoice) {
        if (v.hasAnyFailed)        failed++;
        else if (v.hasPendingOnly) pending++;
        else if (v.hasSuccess)     succeeded++;
        else                       missing++;
      }
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

  async getEnterpriseDetail(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    connectorName?: string,
  ): Promise<any> {
    const enterprise = await this.enterpriseModel.findOne({ ssoEnterpriseId }).lean();
    if (!enterprise) return null;

    // ── Round 1: vendor lookup + connector filter run in parallel ────────────
    const connectorFilter: any = { ssoEnterpriseId, deletedOn: null };
    if (connectorName) connectorFilter.name = connectorName;

    const [vendorRows, connectors] = await Promise.all([
      this.getVendorRows([ssoEnterpriseId]),
      this.connectorModel.find(connectorFilter).lean(),
    ]);
    const vendor = vendorRows[0] ?? null;
    const dbName = vendor?.db_name ?? null;

    const connectorIds = connectors.map((c) => c._id);
    const appIds = [
      ...new Set([
        ...connectors.map((c) => c.outboundAppId?.toString()),
        ...connectors.map((c) => c.inboundAppId?.toString()),
      ]),
    ].filter(Boolean);

    // ── Round 2: apps + CEM list in parallel ─────────────────────────────────
    const [apps, cemList] = await Promise.all([
      this.appModel.find({ _id: { $in: appIds.map((id) => new Types.ObjectId(id)) } }).lean(),
      this.cemModel.find({ connectorId: { $in: connectorIds }, isEnabled: true }).lean(),
    ]);

    const appMap: Record<string, any> = {};
    for (const app of apps) appMap[app._id.toString()] = app;

    const eventIds = [
      ...new Set([
        ...cemList.map((c) => c.outboundEventId?.toString()),
        ...cemList.map((c) => c.inboundEventId?.toString()),
      ]),
    ].filter(Boolean);

    // ── Round 3: fire buildZwingJobStatus early ───────────────────────────────
    // When a specific connector is requested, pass connectorIds so the MongoDB
    // query uses { connectorId, transactionDate } IXSCAN instead of a huge
    // refDocNo $in scan — typically 10-20x faster for a single-connector view.
    // While it runs, fetch the event catalog (fast) in parallel.
    const zwingConnectorIds = connectorIds.map((id) => id.toString());
    const zwingStatusPromise = dbName
      ? this.zwingStatus.buildZwingJobStatus(
          ssoEnterpriseId, dbName, from, to,
          zwingConnectorIds.length ? zwingConnectorIds : undefined,
        )
      : Promise.resolve({ invoiceIds: [] as string[], byInvoice: new Map<string, any>(), byPair: [] as any[] });

    const events = await this.eventModel
      .find({ _id: { $in: eventIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const eventMap: Record<string, any> = {};
    for (const ev of events) eventMap[ev._id.toString()] = ev;

    // Classify CEMs: configured events use source-ID-scoped Mongo metrics;
    // unconfigured events fall back to transactionDate-bounded metrics.
    const unconfiguredCemIds: Types.ObjectId[] = [];
    for (const m of cemList) {
      const code = eventMap[m.outboundEventId?.toString()]?.eventCode as string | undefined;
      if (!code || !EVENT_SOURCE_CONFIGS[code]) unconfiguredCemIds.push(m._id);
    }

    // ── Round 4 (parallel): wait for buildZwingJobStatus + unconfigured metrics
    // Unconfigured CEMs still use transactionDate-bounded aggregation as fallback.
    // Configured CEMs are handled later by the source-ID-scoped aggregation —
    // running the full eventMetricsRaw here for those would be wasted work.
    const [zwingStatus, unconfiguredMetricsRaw] = await Promise.all([
      zwingStatusPromise,
      unconfiguredCemIds.length > 0
        ? this.jobModel.aggregate([
            {
              $match: {
                ssoEnterpriseId,
                transactionDate:     { $gte: from, $lte: to },
                connectorAppEventId: { $in: unconfiguredCemIds },
              },
            },
            {
              $group: {
                _id: { refDocNo: '$refDocNo', connectorAppEventId: '$connectorAppEventId' },
                hasSuccess: { $max: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                hasFailed: {
                  $max: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$status', 'failed'] },
                          { $gt: [{ $size: { $filter: { input: { $ifNull: ['$timestamps', []] }, as: 't', cond: { $eq: ['$$t.status', 'failed'] } } } }, 0] },
                        ],
                      },
                      1, 0,
                    ],
                  },
                },
                hasPending: { $max: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
              },
            },
            {
              $group: {
                _id:       '$_id.connectorAppEventId',
                succeeded: { $sum: '$hasSuccess' },
                failed:    { $sum: { $cond: [{ $and: [{ $eq: ['$hasFailed', 1] }, { $eq: ['$hasSuccess', 0] }] }, 1, 0] } },
                pending:   { $sum: { $cond: [{ $and: [{ $eq: ['$hasPending', 1] }, { $eq: ['$hasSuccess', 0] }, { $eq: ['$hasFailed', 0] }] }, 1, 0] } },
              },
            },
          ])
        : Promise.resolve([] as any[]),
    ]);

    const byPair         = zwingStatus.byPair;
    const zwingInvoiceIds = zwingStatus.invoiceIds;
    const byInvoice      = zwingStatus.byInvoice;

    // Overall invoice-level totals — pending before success so mixed-state
    // invoices (one event succeeded, another still pending) surface as pending.
    let totalSucceeded = 0, totalFailed = 0, totalPending = 0, totalMissing = 0;
    for (const [, v] of byInvoice) {
      if (v.hasAnyFailed)        totalFailed++;
      else if (v.hasPendingOnly) totalPending++;
      else if (v.hasSuccess)     totalSucceeded++;
      else                       totalMissing++;
    }
    const zwing_invoices = zwingInvoiceIds.length;
    const total_success_rate = zwing_invoices > 0
      ? Math.round((totalSucceeded / zwing_invoices) * 100 * 10) / 10 : 0;

    const connectorMetrics: Record<string, { zwing: number; succeeded: number; failed: number; pending: number; missing: number }> = {};
    for (const cid of connectorIds.map((id) => id.toString())) {
      connectorMetrics[cid] = { zwing: zwingInvoiceIds.length, succeeded: 0, failed: 0, pending: 0, missing: 0 };
    }
    // byPair is now event-level (grouped by refDocNo+connectorId+connectorAppEventId),
    // so the same invoice may have multiple entries for a single connector (one per
    // event). De-duplicate at the (refDocNo, connectorId) level before incrementing
    // connector-level counters, otherwise one invoice would inflate the total.
    {
      const invoiceConnectorStatus = new Map<string, { hasSuccess: boolean; hasFailed: boolean; hasPendingOnly: boolean }>();
      for (const p of byPair) {
        const cid = p.connectorId?.toString();
        if (!cid || !connectorMetrics[cid]) continue;
        const key = `${String(p.refDocNo)}::${cid}`;
        if (!invoiceConnectorStatus.has(key)) {
          invoiceConnectorStatus.set(key, { hasSuccess: false, hasFailed: false, hasPendingOnly: false });
        }
        const s = invoiceConnectorStatus.get(key)!;
        if (p.hasSuccess)     s.hasSuccess    = true;
        if (p.hasFailed)      s.hasFailed     = true;
        if (p.hasPendingOnly) s.hasPendingOnly = true;
      }
      for (const [key, s] of invoiceConnectorStatus) {
        const cid = key.split('::')[1];
        if (!cid || !connectorMetrics[cid]) continue;
        if (s.hasFailed)           connectorMetrics[cid].failed++;
        else if (s.hasPendingOnly) connectorMetrics[cid].pending++;
        else if (s.hasSuccess)     connectorMetrics[cid].succeeded++;
      }
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

    // ── Event metrics map: seed with unconfigured-CEM fallback metrics ───────
    // Configured events are handled below by the source-ID-scoped aggregation;
    // unconfiguredMetricsRaw was already fetched in parallel with buildZwingJobStatus.
    const eventMetricsMap = new Map<string, { succeeded: number; failed: number; pending: number }>();
    for (const row of unconfiguredMetricsRaw) {
      const cemId = row._id?.toString();
      if (cemId) eventMetricsMap.set(cemId, { succeeded: row.succeeded, failed: row.failed, pending: row.pending });
    }

    // ── Source IDs by event code ──────────────────────────────────────────────
    // buildZwingJobStatus already ran the MySQL query for DEFAULT_INVOICE_EVENT_CODE.
    // Reuse its invoiceIds directly. Non-default codes (different MySQL tables)
    // are fetched in parallel below.
    const uniqueOutboundCodes = [
      ...new Set(
        cemList
          .map((m) => eventMap[m.outboundEventId?.toString()]?.eventCode)
          .filter(Boolean),
      ),
    ] as string[];

    const sourceIdsByCode = new Map<string, string[] | null>();
    const remainingTableQueries = new Map<string, { config: (typeof EVENT_SOURCE_CONFIGS)[string]; codes: string[] }>();

    for (const code of uniqueOutboundCodes) {
      const cfg = EVENT_SOURCE_CONFIGS[code];
      if (!cfg) continue;
      if (code === DEFAULT_INVOICE_EVENT_CODE) {
        sourceIdsByCode.set(code, zwingInvoiceIds);
      } else {
        const key = `${cfg.tableName}__${cfg.dateField}__${cfg.extraWhere ?? ''}`;
        if (!remainingTableQueries.has(key)) remainingTableQueries.set(key, { config: cfg, codes: [] });
        remainingTableQueries.get(key)!.codes.push(code);
      }
    }

    // Fetch source IDs for non-invoice event codes in parallel.
    if (dbName && remainingTableQueries.size > 0) {
      await Promise.all(
        [...remainingTableQueries.values()].map(async ({ config: cfg, codes }) => {
          let ids: string[] | null = null;
          try {
            const where = `${cfg.dateField} BETWEEN ? AND ?${cfg.extraWhere ? ` AND ${cfg.extraWhere}` : ''}`;
            const rows = await this.mysql.query<Record<string, any>>(
              dbName,
              `SELECT \`${cfg.refDocField}\` AS id FROM \`${cfg.tableName}\` WHERE ${where}`,
              [from, to],
            );
            ids = (rows as any[]).map((r) => String(r.id));
          } catch (e) {
            this.logger.warn(`[EventRecon] MySQL source query failed for table "${cfg.tableName}": ${errMsg(e)}`);
          }
          for (const code of codes) sourceIdsByCode.set(code, ids);
        }),
      );
    }

    // ── Compute event metrics ─────────────────────────────────────────────────
    // DEFAULT_INVOICE_EVENT_CODE: reuse byPair from buildZwingJobStatus (already
    //   has per-event-group data) — zero extra MongoDB queries.
    // Other event codes: one aggregation per code, matched directly by
    //   connectorAppEventId (tight CEM-level filter, no post-filter stage needed).
    // All codes run in parallel.
    await Promise.all(
      [...sourceIdsByCode.entries()].map(async ([code, sourceIds]) => {
        if (sourceIds === null) return;

        const cemIdsForCode = cemList
          .filter((m) => eventMap[m.outboundEventId?.toString()]?.eventCode === code)
          .map((m) => m._id);
        if (!cemIdsForCode.length) return;

        const cemIdStringsForCode = cemIdsForCode.map((id) => id.toString());

        if (!sourceIds.length) {
          for (const cemId of cemIdStringsForCode) eventMetricsMap.set(cemId, { succeeded: 0, failed: 0, pending: 0 });
          return;
        }

        if (code === DEFAULT_INVOICE_EVENT_CODE) {
          // ── Fast path: derive from byPair (no extra MongoDB round-trip) ────
          // byPair is keyed by (refDocNo, connectorId, connectorAppEventId), so
          // filtering by connectorAppEventId gives the exact per-event counts.
          const cemIdSet      = new Set(cemIdStringsForCode);
          const sourceIdsSet  = new Set(sourceIds);

          // Per-connector counts for this event code.
          const perConnector  = new Map<string, { succeeded: number; failed: number; pending: number }>();
          for (const p of byPair) {
            if (!cemIdSet.has(p.connectorAppEventId?.toString())) continue;
            if (!sourceIdsSet.has(p.refDocNo)) continue;
            const cid = p.connectorId?.toString();
            if (!cid) continue;
            if (!perConnector.has(cid)) perConnector.set(cid, { succeeded: 0, failed: 0, pending: 0 });
            const c = perConnector.get(cid)!;
            if (p.hasSuccess)          c.succeeded++;
            else if (p.hasFailed)      c.failed++;
            else if (p.hasPendingOnly) c.pending++;
          }

          // Map connector-level counts to each CEM.
          const connectorToCems = new Map<string, string[]>();
          for (const m of cemList) {
            if (eventMap[m.outboundEventId?.toString()]?.eventCode !== code) continue;
            const cid = m.connectorId.toString();
            if (!connectorToCems.has(cid)) connectorToCems.set(cid, []);
            connectorToCems.get(cid)!.push(m._id.toString());
          }
          for (const [cid, counts] of perConnector) {
            for (const cemId of connectorToCems.get(cid) ?? []) eventMetricsMap.set(cemId, counts);
          }
          for (const cemId of cemIdStringsForCode) {
            if (!eventMetricsMap.has(cemId)) eventMetricsMap.set(cemId, { succeeded: 0, failed: 0, pending: 0 });
          }
          return;
        }

        // ── General path: MongoDB aggregation for non-default event codes ───
        // Match directly by connectorAppEventId (avoids the connectorId-broad
        // match + post-filter pattern used previously).
        const scopedMetrics = await this.jobModel.aggregate([
          {
            $match: {
              ssoEnterpriseId,
              refDocNo:            { $in: sourceIds },
              connectorAppEventId: { $in: cemIdsForCode },
            },
          },
          {
            $group: {
              _id:        { refDocNo: '$refDocNo', connectorAppEventId: '$connectorAppEventId' },
              hasSuccess: { $max: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
              hasFailed: {
                $max: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$status', 'failed'] },
                        { $gt: [{ $size: { $filter: { input: { $ifNull: ['$timestamps', []] }, as: 't', cond: { $eq: ['$$t.status', 'failed'] } } } }, 0] },
                      ],
                    },
                    1, 0,
                  ],
                },
              },
              hasPending: { $max: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
            },
          },
          {
            // Roll up to CEM level.
            $group: {
              _id:       '$_id.connectorAppEventId',
              succeeded: { $sum: '$hasSuccess' },
              failed:    { $sum: { $cond: [{ $and: [{ $eq: ['$hasFailed', 1] }, { $eq: ['$hasSuccess', 0] }] }, 1, 0] } },
              pending:   { $sum: { $cond: [{ $and: [{ $eq: ['$hasPending', 1] }, { $eq: ['$hasSuccess', 0] }, { $eq: ['$hasFailed', 0] }] }, 1, 0] } },
            },
          },
        ]);

        for (const row of scopedMetrics) {
          const cemId = row._id?.toString();
          if (cemId) eventMetricsMap.set(cemId, { succeeded: row.succeeded, failed: row.failed, pending: row.pending });
        }
        for (const cemId of cemIdStringsForCode) {
          if (!eventMetricsMap.has(cemId)) eventMetricsMap.set(cemId, { succeeded: 0, failed: 0, pending: 0 });
        }
      }),
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
          const em             = eventMetricsMap.get(m._id.toString());
          const outboundCode   = eventMap[m.outboundEventId?.toString()]?.eventCode as string | undefined;
          const sourceConfig   = outboundCode ? (EVENT_SOURCE_CONFIGS[outboundCode] ?? null) : null;
          const sourceIds2     = outboundCode ? (sourceIdsByCode.get(outboundCode) ?? null) : null;
          const sourceCount    = sourceIds2 !== null ? sourceIds2.length : null;

          // Use event-specific source count when configured; fall back to invoice count.
          const denominator    = sourceCount ?? zwingInvoiceIds.length;
          const eventMissing   = em != null
            ? Math.max(0, denominator - em.succeeded - em.failed - em.pending)
            : undefined;
          const eventSuccessRate = denominator > 0 && em
            ? Math.round((em.succeeded / denominator) * 100 * 10) / 10
            : 0;

          return {
            _id:           m._id,
            outboundEvent: eventMap[m.outboundEventId?.toString()],
            inboundEvent:  eventMap[m.inboundEventId?.toString()],
            isEnabled:     m.isEnabled,
            isRetryable:   m.isRetryable,
            metrics: em != null
              ? {
                  succeeded:        em.succeeded,
                  failed:           em.failed,
                  pending:          em.pending,
                  missing:          eventMissing,
                  success_rate:     eventSuccessRate,
                  sourceCount,
                  sourceConfigured: !!sourceConfig,
                  sourceLabel:      sourceConfig?.label ?? null,
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
    };
  }

  /**
   * Returns per-outbound-event reconciliation for an enterprise.
   *
   * For each unique outbound event found in the enterprise's connector event
   * mappings the method will:
   *   1. Aggregate GIP dipJobs by connectorAppEventId (= CEM _id) in the
   *      date window to get succeeded / failed / pending counts.
   *   2. If the event has a source config in EVENT_SOURCE_CONFIGS, query the
   *      Zwing MySQL table to get the raw source transaction count, then
   *      compute missing = source - succeeded - failed - pending.
   *
   * This lets the UI show "Source 500 → GIP 490 (missing 10)" per event
   * across all connectors, without touching the existing invoice-recon flow.
   */
  async getEventReconSummary(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
  ): Promise<any> {
    // ── 1+2. Vendor / DB name + Connectors in parallel ───────────────────────
    const [vendorRows, connectors] = await Promise.all([
      this.getVendorRows([ssoEnterpriseId]),
      this.connectorModel.find({ ssoEnterpriseId, deletedOn: null }).lean(),
    ]);
    const dbName = vendorRows[0]?.db_name ?? null;

    if (!connectors.length) return { events: [] };

    const connectorMap = new Map(connectors.map((c) => [c._id.toString(), c]));
    const connectorIds = connectors.map((c) => c._id);

    // ── 3. CEMs ──────────────────────────────────────────────────────────────
    const cems = await this.cemModel
      .find({ connectorId: { $in: connectorIds } })
      .lean();

    if (!cems.length) return { events: [] };

    // ── 4+5. Events + GIP job stats in parallel (both need CEMs, not each other)
    const outboundEventIds = [
      ...new Set(cems.map((c) => c.outboundEventId?.toString()).filter(Boolean)),
    ];
    const cemObjectIds = cems.map((c) => c._id);

    const [eventDocs, jobAggs] = await Promise.all([
      this.eventModel
        .find({ _id: { $in: outboundEventIds.map((id) => new Types.ObjectId(id)) } })
        .lean(),
      this.jobModel.aggregate([
      {
        $match: {
          ssoEnterpriseId,
          transactionDate: { $gte: from, $lte: to },
          connectorAppEventId: { $in: cemObjectIds },
        },
      },
      {
        // Collapse retries: one row per (refDocNo, CEM)
        $group: {
          _id: { connectorAppEventId: '$connectorAppEventId', refDocNo: '$refDocNo' },
          hasSuccess: { $max: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          hasFailed:  { $max: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          hasPending: { $max: { $cond: [{ $in: ['$status', ['pending', 'processing']] }, 1, 0] } },
        },
      },
      {
        // Roll up to CEM level
        $group: {
          _id: '$_id.connectorAppEventId',
          succeeded: { $sum: '$hasSuccess' },
          failed: {
            $sum: { $cond: [{ $and: [{ $eq: ['$hasFailed', 1] }, { $eq: ['$hasSuccess', 0] }] }, 1, 0] },
          },
          pending: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$hasPending', 1] }, { $eq: ['$hasSuccess', 0] }, { $eq: ['$hasFailed', 0] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ])
    ]);  // end Promise.all([eventDocs, jobAggs])

    const eventMap = new Map(eventDocs.map((e) => [e._id.toString(), e]));

    const cemJobStats = new Map<string, { succeeded: number; failed: number; pending: number }>();
    for (const row of jobAggs) {
      cemJobStats.set(row._id?.toString(), {
        succeeded: row.succeeded,
        failed: row.failed,
        pending: row.pending,
      });
    }

    // ── 6. Group CEMs by outbound event ──────────────────────────────────────
    const byEvent = new Map<
      string,
      {
        event: any;
        items: Array<{ cem: any; connector: any; stats: { succeeded: number; failed: number; pending: number } }>;
      }
    >();

    for (const cem of cems) {
      const evId = cem.outboundEventId?.toString();
      if (!evId) continue;
      const ev = eventMap.get(evId);
      if (!ev) continue;

      if (!byEvent.has(evId)) byEvent.set(evId, { event: ev, items: [] });

      const connector = connectorMap.get(cem.connectorId?.toString());
      const stats = cemJobStats.get(cem._id.toString()) ?? { succeeded: 0, failed: 0, pending: 0 };
      byEvent.get(evId)!.items.push({ cem, connector, stats });
    }

    // ── 7. Build result: all MySQL source-count queries run in parallel ───────
    // Fire all configured-event COUNT queries simultaneously, then assemble results.
    const byEventEntries = [...byEvent.entries()];
    const sourceCountResults = await Promise.all(
      byEventEntries.map(async ([, { event }]) => {
        const config = EVENT_SOURCE_CONFIGS[event.eventCode] ?? null;
        if (!config || !dbName) return null;
        try {
          const where = `${config.dateField} BETWEEN ? AND ?${config.extraWhere ? ` AND ${config.extraWhere}` : ''}`;
          const rows = await this.mysql.query<{ cnt: number }>(
            dbName,
            `SELECT COUNT(*) AS cnt FROM \`${config.tableName}\` WHERE ${where}`,
            [from, to],
          );
          return Number((rows as any[])[0]?.cnt ?? null);
        } catch (e) {
          this.logger.warn(`[EventRecon] MySQL source query failed for "${event.eventCode}": ${errMsg(e)}`);
          return null;
        }
      }),
    );

    const events: any[] = [];

    for (let i = 0; i < byEventEntries.length; i++) {
      const [evId, { event, items }] = byEventEntries[i];
      const config = EVENT_SOURCE_CONFIGS[event.eventCode] ?? null;
      const sourceCount = sourceCountResults[i];

      // Aggregate across connectors
      let totalSucceeded = 0, totalFailed = 0, totalPending = 0;
      for (const { stats } of items) {
        totalSucceeded += stats.succeeded;
        totalFailed   += stats.failed;
        totalPending  += stats.pending;
      }
      const totalGip = totalSucceeded + totalFailed + totalPending;
      const missing  = sourceCount != null
        ? Math.max(0, sourceCount - totalSucceeded - totalFailed - totalPending)
        : null;
      const successRate = sourceCount != null && sourceCount > 0
        ? Math.round((totalSucceeded / sourceCount) * 100 * 10) / 10
        : totalGip > 0
          ? Math.round((totalSucceeded / totalGip) * 100 * 10) / 10
          : 0;

      events.push({
        outboundEventId:   evId,
        outboundEventCode: event.eventCode,
        outboundEventName: event.name,
        sourceConfigured:  !!config,
        sourceLabel:       config?.label ?? null,
        sourceCount,
        connectors: items.map(({ cem, connector, stats }) => ({
          cemId:         cem._id,
          connectorId:   connector?._id,
          connectorName: connector?.name,
          isEnabled:     cem.isEnabled,
          succeeded:     stats.succeeded,
          failed:        stats.failed,
          pending:       stats.pending,
          total:         stats.succeeded + stats.failed + stats.pending,
        })),
        totals: { succeeded: totalSucceeded, failed: totalFailed, pending: totalPending, total: totalGip, missing, successRate },
      });
    }

    // Sort: events with failures first, then by event code
    events.sort((a, b) => {
      if (b.totals.failed !== a.totals.failed) return b.totals.failed - a.totals.failed;
      return (a.outboundEventCode ?? '').localeCompare(b.outboundEventCode ?? '');
    });

    return { events };
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
