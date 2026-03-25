import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DipJob } from '../schemas/dip-job.schema';
import { DipJobTask } from '../schemas/dip-job-task.schema';
import { Connector } from '../schemas/connector.schema';
import { ConnectorEventMapping } from '../schemas/connector-event-mapping.schema';
import { AppCatalog } from '../schemas/app-catalog.schema';
import { EventCatalog } from '../schemas/event-catalog.schema';
import { Enterprise } from '../schemas/enterprise.schema';

@Injectable()
export class DipJobsService {
  private readonly logger = new Logger(DipJobsService.name);

  constructor(
    @InjectModel(DipJob.name) private jobModel: Model<DipJob>,
    @InjectModel(DipJobTask.name) private taskModel: Model<DipJobTask>,
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
    @InjectModel(ConnectorEventMapping.name) private cemModel: Model<ConnectorEventMapping>,
    @InjectModel(AppCatalog.name) private appModel: Model<AppCatalog>,
    @InjectModel(EventCatalog.name) private eventModel: Model<EventCatalog>,
    @InjectModel(Enterprise.name) private enterpriseModel: Model<Enterprise>,
  ) {}

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
      if (validIds.length) match.ssoEnterpriseId = { $in: validIds };
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
              hour: {
                $dateTrunc: { date: '$transactionDate', unit: 'hour' },
              },
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

    // Enrich connector data
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

    // Aggregate by connector
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
        totals: { ...totals, failure_rate },
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
    appId?: string;
  }) {
    const match: any = {
      status: 'failed',
      transactionDate: { $gte: opts.from, $lte: opts.to },
    };
    if (opts.ssoEnterpriseId) {
      match.ssoEnterpriseId = opts.ssoEnterpriseId;
    } else {
      const validIds = await this.getValidEnterpriseIds();
      if (validIds.length) match.ssoEnterpriseId = { $in: validIds };
    }
    if (opts.connectorId) match.connectorId = new Types.ObjectId(opts.connectorId);
    if (opts.appId) match.inboundAppId = new Types.ObjectId(opts.appId);

    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(match)
        .sort({ transactionDate: -1 })
        .skip((opts.page - 1) * opts.limit)
        .limit(opts.limit)
        .lean(),
      this.jobModel.countDocuments(match),
    ]);

    const enriched = await this.enrichJobs(jobs);
    return { data: enriched, meta: { total, page: opts.page, limit: opts.limit } };
  }

  /**
   * Lightweight failed-job summary for one enterprise.
   * Returns the count + a preview of the most recent failed jobs.
   * Called async per-row on the failed jobs page.
   */
  async getEnterpriseFailedSummary(
    ssoEnterpriseId: string,
    from: Date,
    to: Date,
    previewLimit = 5,
  ) {
    const match = {
      ssoEnterpriseId,
      status: 'failed',
      transactionDate: { $gte: from, $lte: to },
    };

    const [count, jobs] = await Promise.all([
      this.jobModel.countDocuments(match),
      this.jobModel
        .find(match, {
          _id: 1,
          refDocNo: 1,
          error: 1,
          retryCount: 1,
          transactionDate: 1,
          connectorId: 1,
        })
        .sort({ transactionDate: -1 })
        .limit(previewLimit)
        .lean(),
    ]);

    if (!jobs.length) return { data: { count: 0, jobs: [] } };

    const connectorIds = [...new Set(jobs.map((j) => j.connectorId?.toString()).filter(Boolean))];
    const connectors = await this.connectorModel
      .find({ _id: { $in: connectorIds.map((id) => new Types.ObjectId(id)) } }, { name: 1 })
      .lean();
    const connectorMap: Record<string, any> = {};
    for (const c of connectors) connectorMap[c._id.toString()] = c;

    return {
      data: {
        count,
        jobs: jobs.map((j) => ({
          _id: j._id,
          refDocNo: j.refDocNo,
          error: j.error,
          retryCount: j.retryCount,
          transactionDate: j.transactionDate,
          connectorName: connectorMap[j.connectorId?.toString()]?.name ?? null,
        })),
      },
    };
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

    const connectorIds = [...new Set(jobs.map((j) => j.connectorId?.toString()))].filter(Boolean);
    const appIds = [...new Set([
      ...jobs.map((j) => j.inboundAppId?.toString()),
      ...jobs.map((j) => j.outboundAppId?.toString()),
    ])].filter(Boolean);
    const enterpriseIds = [...new Set(jobs.map((j) => j.ssoEnterpriseId))].filter(Boolean);

    const [connectors, apps, enterprises] = await Promise.all([
      this.connectorModel.find({
        _id: { $in: connectorIds.map((id) => new Types.ObjectId(id)) },
      }).lean(),
      this.appModel.find({
        _id: { $in: appIds.map((id) => new Types.ObjectId(id)) },
      }).lean(),
      this.enterpriseModel.find({
        ssoEnterpriseId: { $in: enterpriseIds },
      }).lean(),
    ]);

    const connectorMap: Record<string, any> = {};
    for (const c of connectors) connectorMap[c._id.toString()] = c;
    const appMap: Record<string, any> = {};
    for (const a of apps) appMap[a._id.toString()] = a;
    const enterpriseMap: Record<string, any> = {};
    for (const e of enterprises) enterpriseMap[e.ssoEnterpriseId] = e;

    // Fetch event codes via connectorAppEventId
    const cemIds = [...new Set(jobs.map((j) => j.connectorAppEventId?.toString()))].filter(Boolean);
    const cems = await this.cemModel.find({
      _id: { $in: cemIds.map((id) => new Types.ObjectId(id)) },
    }).lean();
    const cemMap: Record<string, any> = {};
    for (const m of cems) cemMap[m._id.toString()] = m;

    const eventIds = [...new Set(cems.map((m) => m.outboundEventId?.toString()))].filter(Boolean);
    const events = await this.eventModel.find({
      _id: { $in: eventIds.map((id) => new Types.ObjectId(id)) },
    }).lean();
    const eventMap: Record<string, any> = {};
    for (const ev of events) eventMap[ev._id.toString()] = ev;

    return jobs.map((j) => {
      const cem = cemMap[j.connectorAppEventId?.toString()];
      const event = cem ? eventMap[cem.outboundEventId?.toString()] : null;
      return {
        ...j,
        connector: connectorMap[j.connectorId?.toString()],
        outboundApp: appMap[j.outboundAppId?.toString()],
        inboundApp: appMap[j.inboundAppId?.toString()],
        enterprise: enterpriseMap[j.ssoEnterpriseId],
        event,
      };
    });
  }
}
