import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DipJob } from '../schemas/dip-job.schema';
import { DipJobTask } from '../schemas/dip-job-task.schema';
import { Connector } from '../schemas/connector.schema';
import { ConnectorEventMapping } from '../schemas/connector-event-mapping.schema';
import { AppCatalog } from '../schemas/app-catalog.schema';
import { EventCatalog } from '../schemas/event-catalog.schema';
import { Enterprise } from '../schemas/enterprise.schema';
import { ZwingStatusService } from '../common/zwing-status.service';

@Injectable()
export class DipJobsService {

  constructor(
    @InjectModel(DipJob.name) private readonly jobModel: Model<DipJob>,
    @InjectModel(DipJobTask.name) private readonly taskModel: Model<DipJobTask>,
    @InjectModel(Connector.name) private readonly connectorModel: Model<Connector>,
    @InjectModel(ConnectorEventMapping.name) private readonly cemModel: Model<ConnectorEventMapping>,
    @InjectModel(AppCatalog.name) private readonly appModel: Model<AppCatalog>,
    @InjectModel(EventCatalog.name) private readonly eventModel: Model<EventCatalog>,
    @InjectModel(Enterprise.name) private readonly enterpriseModel: Model<Enterprise>,
    private readonly zwingStatus: ZwingStatusService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the ConnectorEventMapping ObjectIds for a given eventCode (and
   * optionally a single connector) — used to scope job queries to one event
   * so that jobs from a different event on the same connector don't bleed in.
   * Mirrors SyncGapService.resolveCemObjectIds. Returns null on lookup failure
   * (callers should fall back to unscoped behaviour) or when the eventCode
   * doesn't resolve to any EventCatalog doc.
   */
  private async resolveCemObjectIds(
    ssoEnterpriseId: string,
    eventCode: string,
    connectorId?: string,
  ): Promise<Types.ObjectId[] | null> {
    try {
      const eventDocs = await this.eventModel.find({ eventCode }).select('_id').lean();
      if (!eventDocs.length) return null;

      const cemFilter: Record<string, any> = {
        outboundEventId: { $in: eventDocs.map((e) => e._id) },
      };

      if (connectorId) {
        cemFilter.connectorId = new Types.ObjectId(connectorId);
      } else {
        const connectorDocs = await this.connectorModel
          .find({ ssoEnterpriseId })
          .select('_id')
          .lean();
        if (!connectorDocs.length) return [];
        cemFilter.connectorId = { $in: connectorDocs.map((c) => c._id) };
      }

      const cemDocs = await this.cemModel.find(cemFilter).select('_id').lean();
      return cemDocs.map((c) => c._id as Types.ObjectId);
    } catch {
      return null;
    }
  }

  /**
   * Returns ssoEnterpriseIds of enterprises that have a private app AND a Zwing VId.
   * Same filter logic as the enterprise list page.
   */
  private async getValidEnterpriseIds(): Promise<string[]> {
    const apps = await this.appModel
      .find(
        { ssoEnterpriseId: { $exists: true, $ne: null }, deletedOn: null },
        { ssoEnterpriseId: 1 },
      )
      .lean();

    const ssoIds = [...new Set(apps.map((a) => a.ssoEnterpriseId).filter(Boolean))];
    if (!ssoIds.length) return [];

    const enterprises = await this.enterpriseModel
      .find(
        { ssoEnterpriseId: { $in: ssoIds }, 'meta.zwingVId': { $exists: true, $ne: null } },
        { ssoEnterpriseId: 1 },
      )
      .lean();

    return enterprises.map((e) => e.ssoEnterpriseId);
  }

  async getSummary(ssoEnterpriseId: string, from: Date, to: Date) {
    const match: any = { transactionDate: { $gte: from, $lte: to } };

    if (ssoEnterpriseId) {
      match.ssoEnterpriseId = ssoEnterpriseId;
    } else {
      const validIds = await this.getValidEnterpriseIds();
      // If no valid enterprise IDs exist, return empty rather than querying all data
      if (!validIds.length) {
        return {
          data: {
            totals: { total: 0, success: 0, failed: 0, pending: 0, processing: 0, failure_rate: 0, success_rate: 0 },
            byConnector: [],
            timeseries: [],
          },
        };
      }
      match.ssoEnterpriseId = { $in: validIds };
    }

    const [byStatus, byConnector, timeseries] = await Promise.all([
      this.jobModel.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.jobModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { connectorId: '$connectorId', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.jobModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              hour: { $dateTrunc: { date: '$transactionDate', unit: 'hour' } },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.hour': 1 } },
      ]),
    ]);

    const totals = { total: 0, success: 0, failed: 0, pending: 0, processing: 0 };
    for (const row of byStatus) {
      totals[row._id as string] = row.count;
      totals.total += row.count;
    }
    const failure_rate =
      totals.total > 0 ? Math.round((totals.failed / totals.total) * 100 * 10) / 10 : 0;
    const success_rate =
      totals.total > 0 ? Math.round((totals.success / totals.total) * 100 * 10) / 10 : 0;

    const connectorIds = [...new Set(byConnector.map((r) => r._id.connectorId?.toString()))].filter(Boolean);
    const connectors = await this.connectorModel.find({
      _id: { $in: connectorIds.map((id) => new Types.ObjectId(id)) },
    }).lean();
    const connectorMap: Record<string, any> = {};
    for (const c of connectors) connectorMap[c._id.toString()] = c;

    const appIds = [
      ...new Set([
        ...connectors.map((c) => c.outboundAppId?.toString()),
        ...connectors.map((c) => c.inboundAppId?.toString()),
      ]),
    ].filter(Boolean);
    const apps = await this.appModel.find({
      _id: { $in: appIds.map((id) => new Types.ObjectId(id)) },
    }).lean();
    const appMap: Record<string, any> = {};
    for (const a of apps) appMap[a._id.toString()] = a;

    const connectorSummary: Record<string, any> = {};
    for (const row of byConnector) {
      const cid = row._id.connectorId?.toString();
      if (!cid) continue;
      if (!connectorSummary[cid]) {
        const c = connectorMap[cid];
        connectorSummary[cid] = {
          connectorId: cid,
          name: c?.name,
          outboundApp: appMap[c?.outboundAppId?.toString()],
          inboundApp: appMap[c?.inboundAppId?.toString()],
          total: 0, success: 0, failed: 0, pending: 0, processing: 0,
        };
      }
      connectorSummary[cid][row._id.status] = row.count;
      connectorSummary[cid].total += row.count;
    }

    return {
      data: {
        totals: { ...totals, failure_rate, success_rate },
        byConnector: Object.values(connectorSummary),
        timeseries: timeseries.map((r) => ({
          hour: r._id.hour,
          status: r._id.status,
          count: r.count,
        })),
      },
    };
  }

  async getFailedJobs(opts: {
    page: number;
    limit: number;
    from: Date;
    to: Date;
    ssoEnterpriseId?: string;
    connectorId?: string;
  }): Promise<any> {
    if (opts.ssoEnterpriseId) {
      return this.getFailedJobsForEnterprise(opts as Required<typeof opts>);
    }

    // All-enterprises fallback: MongoDB-only
    const baseMatch: any = { transactionDate: { $gte: opts.from, $lte: opts.to }, status: 'failed' };
    const validIds = await this.getValidEnterpriseIds();
    if (!validIds.length) return { data: [], meta: { total: 0, page: opts.page, limit: opts.limit } };
    baseMatch.ssoEnterpriseId = { $in: validIds };
    if (opts.connectorId) baseMatch.connectorId = new Types.ObjectId(opts.connectorId);

    const skip = (opts.page - 1) * opts.limit;
    const [jobs, total] = await Promise.all([
      this.jobModel.find(baseMatch).sort({ transactionDate: -1 }).skip(skip).limit(opts.limit).lean(),
      this.jobModel.countDocuments(baseMatch),
    ]);
    const enriched = await this.enrichJobs(jobs);
    return { data: enriched, meta: { total, page: opts.page, limit: opts.limit } };
  }

  /**
   * Per-enterprise failed jobs using Zwing MySQL as the source of truth.
   * 1. Fetch Zwing invoice IDs for the date window.
   * 2. Find GIP jobs for those IDs (transactionDate >= windowStart, no upper bound).
   * 3. Return one row per invoice that has NO success for any connector,
   *    showing the most recent error per (invoice, connector) pair.
   */
  private async getFailedJobsForEnterprise(opts: {
    page: number; limit: number;
    from: Date; to: Date;
    ssoEnterpriseId: string;
    connectorId?: string;
    eventCode?: string;
    search?: string;
  }): Promise<any> {
    const dbName = await this.zwingStatus.getVendorDbName(opts.ssoEnterpriseId);
    if (!dbName) return { data: [], meta: { total: 0, page: opts.page, limit: opts.limit } };

    const [{ byInvoice, byPair }, cemObjectIds] = await Promise.all([
      this.zwingStatus.buildZwingJobStatus(
        opts.ssoEnterpriseId, dbName, opts.from, opts.to,
        opts.connectorId ? [opts.connectorId] : undefined,
        opts.eventCode,
      ),
      opts.eventCode
        ? this.resolveCemObjectIds(opts.ssoEnterpriseId, opts.eventCode, opts.connectorId)
        : Promise.resolve(null),
    ]);

    // p.hasFailed already means: this connector failed AND never succeeded for this invoice.
    // Do NOT filter by inv.hasSuccess — that would hide a connector failure just because
    // another connector delivered the same invoice successfully.
    let failedPairs = byPair.filter((p) => p.hasFailed && !p.hasPendingOnly);

    if (opts.connectorId) {
      failedPairs = failedPairs.filter(
        (p) => p.connectorId?.toString() === opts.connectorId,
      );
    }

    // buildZwingJobStatus now sources its candidate refDocNo set from
    // EVENT_SOURCE_CONFIGS[opts.eventCode] (falls back to the invoice event),
    // so this correctly narrows results to the selected event's own table —
    // not just invoices. The CEM scoping below is an extra guard against
    // job groups from a different event bleeding in.
    if (cemObjectIds) {
      const cemIdSet = new Set(cemObjectIds.map((c) => c.toString()));
      failedPairs = failedPairs.filter((p) => cemIdSet.has((p.connectorAppEventId as any)?.toString()));
    }

    if (opts.search) {
      const needle = opts.search.toLowerCase();
      failedPairs = failedPairs.filter((p) =>
        p.refDocNo?.toLowerCase().includes(needle),
      );
    }

    const total = failedPairs.length;
    const skip  = (opts.page - 1) * opts.limit;
    const page  = failedPairs
      .sort((a, b) => (b.latestDate?.getTime() ?? 0) - (a.latestDate?.getTime() ?? 0))
      .slice(skip, skip + opts.limit);

    if (!page.length) return { data: [], meta: { total, page: opts.page, limit: opts.limit } };

    const jobs = await this.jobModel
      .find({ _id: { $in: page.map((p) => p.latestJobId).filter(Boolean) } })
      .lean();
    const attemptsMap = new Map(
      page.map((p) => [p.latestJobId?.toString(), p.failedAttempts]),
    );
    const merged = jobs.map((j) => ({
      ...j,
      failedAttempts: attemptsMap.get(j._id.toString()) ?? 1,
    }));

    const enriched = await this.enrichJobs(merged);
    return { data: enriched, meta: { total, page: opts.page, limit: opts.limit } };
  }

  /**
   * Lightweight failed-invoice summary for one enterprise (used async per-row
   * on the failed jobs page). Uses Zwing MySQL as the source of truth.
   */
  async getEnterpriseFailedSummary(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    previewLimit = 5,
  ): Promise<any> {
    const dbName = await this.zwingStatus.getVendorDbName(ssoEnterpriseId);
    if (!dbName) return { data: { count: 0, jobs: [] } };

    const { byInvoice, byPair } = await this.zwingStatus.buildZwingJobStatus(
      ssoEnterpriseId, dbName, from, to,
    );

    // Count any invoice that has at least one connector-level failure, regardless of
    // whether another connector delivered the same invoice successfully.
    const failedInvoiceIds = [...byInvoice.entries()]
      .filter(([, v]) => v.hasAnyFailed && !v.hasPendingOnly)
      .map(([id]) => id);

    const count = failedInvoiceIds.length;
    if (count === 0) return { data: { count: 0, jobs: [] } };

    const failedPairs = byPair
      .filter((p) => failedInvoiceIds.includes(p.refDocNo) && p.hasFailed)
      .sort((a, b) => (b.latestDate?.getTime() ?? 0) - (a.latestDate?.getTime() ?? 0));

    // One entry per invoice — pick the most recent across connectors
    const seenInvoices = new Set<string>();
    const preview: typeof failedPairs = [];
    for (const p of failedPairs) {
      if (!seenInvoices.has(p.refDocNo)) {
        seenInvoices.add(p.refDocNo);
        preview.push(p);
        if (preview.length >= previewLimit) break;
      }
    }

    const connectorIds = [...new Set(preview.map((p) => p.connectorId?.toString()).filter(Boolean))];
    const connectors = await this.connectorModel
      .find({ _id: { $in: connectorIds.map((id) => new Types.ObjectId(id)) } }, { name: 1 })
      .lean();
    const connectorMap: Record<string, any> = {};
    for (const c of connectors) connectorMap[c._id.toString()] = c;

    return {
      data: {
        count,
        jobs: preview.map((p) => ({
          _id: p.latestJobId,
          refDocNo: p.refDocNo,
          error: p.latestError,
          failedAttempts: p.failedAttempts,
          transactionDate: p.latestDate,
          connectorName: connectorMap[p.connectorId?.toString()]?.name ?? null,
        })),
      },
    };
  }

  /**
   * Generic job listing for a connector.
   * status = 'all' | 'success' | 'failed' | 'pending'
   * - 'failed' uses Zwing MySQL as source of truth (same as getFailedJobs).
   * - All other statuses query DipJob directly (fast, no MySQL round-trip).
   */
  async getJobsList(opts: {
    ssoEnterpriseId: string;
    connectorId?: string;
    eventCode?: string;
    status: 'all' | 'success' | 'failed' | 'pending';
    from: Date;
    to: Date;
    page: number;
    limit: number;
    search?: string;
  }): Promise<any> {
    if (opts.status === 'failed') {
      return this.getFailedJobsForEnterprise({
        ...opts,
        search: opts.search,
      });
    }

    const match: any = {
      ssoEnterpriseId: opts.ssoEnterpriseId,
      transactionDate: { $gte: opts.from, $lte: opts.to },
    };
    if (opts.connectorId) match.connectorId = new Types.ObjectId(opts.connectorId);
    if (opts.status === 'success') match.status = 'success';
    if (opts.status === 'pending') match.status = { $in: ['pending', 'processing'] };
    if (opts.search?.trim()) {
      match.refDocNo = { $regex: opts.search.trim(), $options: 'i' };
    }
    if (opts.eventCode) {
      // outboundEventId is stored directly on the job doc, so we can filter
      // without going through ConnectorEventMapping.
      const eventDocs = await this.eventModel.find({ eventCode: opts.eventCode }).select('_id').lean();
      match.outboundEventId = { $in: eventDocs.map((e) => e._id) };
    }

    const skip = (opts.page - 1) * opts.limit;
    const [jobs, total] = await Promise.all([
      this.jobModel.find(match).sort({ transactionDate: -1 }).skip(skip).limit(opts.limit).lean(),
      this.jobModel.countDocuments(match),
    ]);
    const enriched = await this.enrichJobs(jobs);
    return { data: enriched, meta: { total, page: opts.page, limit: opts.limit } };
  }

  async getJobDetail(jobId: string) {
    const job = await this.jobModel.findById(jobId).lean();
    if (!job) throw new NotFoundException('Job not found');

    const [tasks, enriched] = await Promise.all([
      this.taskModel.find({ jobId: new Types.ObjectId(jobId) }).sort({ createdAt: 1 }).lean(),
      this.enrichJobs([job]),
    ]);

    return { data: { ...enriched[0], tasks } };
  }

  private async enrichJobs(jobs: any[]) {
    if (!jobs.length) return [];

    const connectorIds  = [...new Set(jobs.map((j) => j.connectorId?.toString()))].filter(Boolean);
    const appIds        = [...new Set([...jobs.map((j) => j.inboundAppId?.toString()), ...jobs.map((j) => j.outboundAppId?.toString())])].filter(Boolean);
    const enterpriseIds = [...new Set(jobs.map((j) => j.ssoEnterpriseId))].filter(Boolean);
    const cemIds        = [...new Set(jobs.map((j) => j.connectorAppEventId?.toString()))].filter(Boolean);
    // outboundEventId is stored directly on the job doc — use it to avoid a
    // sequential CEM→events chain and fetch events in the same round.
    const eventIds      = [...new Set(jobs.map((j) => j.outboundEventId?.toString()))].filter(Boolean);

    const [connectors, apps, enterprises, cems, events] = await Promise.all([
      connectorIds.length  ? this.connectorModel.find({ _id: { $in: connectorIds.map((id) => new Types.ObjectId(id)) } }).lean()        : Promise.resolve([]),
      appIds.length        ? this.appModel.find({ _id: { $in: appIds.map((id) => new Types.ObjectId(id)) } }).lean()                    : Promise.resolve([]),
      enterpriseIds.length ? this.enterpriseModel.find({ ssoEnterpriseId: { $in: enterpriseIds } }).lean()                              : Promise.resolve([]),
      cemIds.length        ? this.cemModel.find({ _id: { $in: cemIds.map((id) => new Types.ObjectId(id)) } }).lean()                    : Promise.resolve([]),
      eventIds.length      ? this.eventModel.find({ _id: { $in: eventIds.map((id) => new Types.ObjectId(id)) } }).lean()                : Promise.resolve([]),
    ]);

    const connectorMap: Record<string, any>  = {};
    for (const c of connectors)  connectorMap[c._id.toString()]    = c;
    const appMap: Record<string, any>        = {};
    for (const a of apps)        appMap[a._id.toString()]          = a;
    const enterpriseMap: Record<string, any> = {};
    for (const e of enterprises) enterpriseMap[e.ssoEnterpriseId]  = e;
    const cemMap: Record<string, any>        = {};
    for (const m of cems)        cemMap[m._id.toString()]          = m;
    const eventMap: Record<string, any>      = {};
    for (const ev of events)     eventMap[ev._id.toString()]       = ev;

    return jobs.map((j) => ({
      ...j,
      connector:   connectorMap[j.connectorId?.toString()],
      outboundApp: appMap[j.outboundAppId?.toString()],
      inboundApp:  appMap[j.inboundAppId?.toString()],
      enterprise:  enterpriseMap[j.ssoEnterpriseId],
      // Prefer the event from the job's own outboundEventId; fall back to CEM lookup.
      event: eventMap[j.outboundEventId?.toString()] ?? (cemMap[j.connectorAppEventId?.toString()]
        ? eventMap[cemMap[j.connectorAppEventId?.toString()].outboundEventId?.toString()] ?? null
        : null),
    }));
  }
}
