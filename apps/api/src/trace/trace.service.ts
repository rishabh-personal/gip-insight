import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DipJob } from '../schemas/dip-job.schema';
import { DipJobTask } from '../schemas/dip-job-task.schema';
import { Enterprise } from '../schemas/enterprise.schema';
import { Connector } from '../schemas/connector.schema';
import { AppCatalog } from '../schemas/app-catalog.schema';
import { ConnectorEventMapping } from '../schemas/connector-event-mapping.schema';
import { EventCatalog } from '../schemas/event-catalog.schema';
import { MysqlTenantService } from '../database/mysql-tenant.service';
import { EVENT_SOURCE_CONFIGS, DEFAULT_INVOICE_EVENT_CODE } from '../config/event-recon-config';

@Injectable()
export class TraceService {
  private readonly logger = new Logger(TraceService.name);

  constructor(
    @InjectModel(DipJob.name) private jobModel: Model<DipJob>,
    @InjectModel(DipJobTask.name) private taskModel: Model<DipJobTask>,
    @InjectModel(Enterprise.name) private enterpriseModel: Model<Enterprise>,
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
    @InjectModel(AppCatalog.name) private appModel: Model<AppCatalog>,
    @InjectModel(ConnectorEventMapping.name) private cemModel: Model<ConnectorEventMapping>,
    @InjectModel(EventCatalog.name) private eventModel: Model<EventCatalog>,
    private readonly mysql: MysqlTenantService,
  ) {}

  async trace(invoiceId: string, ssoEnterpriseId?: string): Promise<any> {
    // Step 1: Find GIP jobs matching this invoice ID
    const jobFilter: any = { refDocNo: invoiceId };
    if (ssoEnterpriseId) jobFilter.ssoEnterpriseId = ssoEnterpriseId;

    const jobs = await this.jobModel.find(jobFilter).lean();

    // Determine enterprise from jobs if not provided
    const enterpriseIds = ssoEnterpriseId
      ? [ssoEnterpriseId]
      : [...new Set(jobs.map((j) => j.ssoEnterpriseId))].filter(Boolean);

    const enterprises = await this.enterpriseModel
      .find({ ssoEnterpriseId: { $in: enterpriseIds } })
      .lean();

    const enterpriseMap: Record<string, any> = {};
    for (const e of enterprises) enterpriseMap[e.ssoEnterpriseId] = e;

    // Step 2: Fetch Zwing invoice record for each enterprise — all in parallel.
    // Each enterprise has its own MySQL db_name (vendor table), so we chain
    // vendor→invoice per enterprise but run all enterprises concurrently.
    const zwingEntries = await Promise.all(
      enterpriseIds.map(async (eid) => {
        const enterprise = enterpriseMap[eid];
        if (!enterprise?.meta?.zwingVId) return null;
        try {
          const vendors = await this.mysql.query(
            this.mysql.getMasterDb(),
            `SELECT db_name FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
            [eid],
          );
          const dbName = (vendors[0] as any)?.db_name;
          if (!dbName) return null;
          // Table / lookup column come from EVENT_SOURCE_CONFIGS (single source of
          // truth). The extra display columns below aren't part of the shared
          // selectFields since this trace view needs more detail than recon does.
          const invoiceConfig = EVENT_SOURCE_CONFIGS[DEFAULT_INVOICE_EVENT_CODE];
          const invoices = await this.mysql.query(
            dbName,
            `SELECT id, \`${invoiceConfig.refDocField}\`, store_id, v_id, status, transaction_type, transaction_sub_type,
                    total, created_at, updated_at, sync_status
             FROM \`${invoiceConfig.tableName}\` WHERE \`${invoiceConfig.refDocField}\` = ? LIMIT 1`,
            [invoiceId],
          );
          return invoices[0] ? { eid, row: invoices[0] } : null;
        } catch (e) {
          this.logger.warn(`Zwing lookup failed for ${eid}: ${e.message}`);
          return null;
        }
      }),
    );
    const zwingRecords: Record<string, any> = {};
    for (const entry of zwingEntries) {
      if (entry) zwingRecords[entry.eid] = entry.row;
    }

    // Step 3: Enrich jobs with connector/app/event and tasks (batched to avoid N+1)
    const connectorIds = [...new Set(jobs.map((j) => j.connectorId?.toString()))].filter(Boolean);
    const cemIds = [...new Set(jobs.map((j) => j.connectorAppEventId?.toString()))].filter(Boolean);

    const [allTasks, connectors, cems] = await Promise.all([
      this.taskModel.find({ jobId: { $in: jobs.map((j) => j._id) } }).sort({ createdAt: 1 }).lean(),
      connectorIds.length
        ? this.connectorModel.find({ _id: { $in: connectorIds.map((id) => new Types.ObjectId(id)) } }).lean()
        : Promise.resolve([]),
      cemIds.length
        ? this.cemModel.find({ _id: { $in: cemIds.map((id) => new Types.ObjectId(id)) } }).lean()
        : Promise.resolve([]),
    ]);

    const connectorMap: Record<string, any> = {};
    for (const c of connectors) connectorMap[c._id.toString()] = c;
    const cemMap: Record<string, any> = {};
    for (const m of cems) cemMap[m._id.toString()] = m;

    const appIds = [...new Set([
      ...connectors.map((c) => c.outboundAppId?.toString()),
      ...connectors.map((c) => c.inboundAppId?.toString()),
    ])].filter(Boolean);
    const eventIds = [...new Set(cems.map((m) => m.outboundEventId?.toString()))].filter(Boolean);

    const [apps, events] = await Promise.all([
      appIds.length
        ? this.appModel.find({ _id: { $in: appIds.map((id) => new Types.ObjectId(id)) } }).lean()
        : Promise.resolve([]),
      eventIds.length
        ? this.eventModel.find({ _id: { $in: eventIds.map((id) => new Types.ObjectId(id)) } }).lean()
        : Promise.resolve([]),
    ]);

    const appMap: Record<string, any> = {};
    for (const a of apps) appMap[a._id.toString()] = a;
    const eventMap: Record<string, any> = {};
    for (const ev of events) eventMap[ev._id.toString()] = ev;

    const tasksByJob: Record<string, any[]> = {};
    for (const t of allTasks) {
      const jid = t.jobId.toString();
      if (!tasksByJob[jid]) tasksByJob[jid] = [];
      tasksByJob[jid].push(t);
    }

    const enrichedJobs = jobs.map((job) => {
      const connector = connectorMap[job.connectorId?.toString()];
      const cem = cemMap[job.connectorAppEventId?.toString()];
      const event = cem ? eventMap[cem.outboundEventId?.toString()] ?? null : null;
      const tasks = tasksByJob[job._id.toString()] ?? [];
      const taskSummary = {
        total: tasks.length,
        success: tasks.filter((t) => t.status === 'success').length,
        failed: tasks.filter((t) => t.status === 'failed').length,
        pending: tasks.filter((t) => t.status === 'pending').length,
      };
      return {
        ...job,
        connector,
        outboundApp: connector ? appMap[connector.outboundAppId?.toString()] ?? null : null,
        inboundApp: connector ? appMap[connector.inboundAppId?.toString()] ?? null : null,
        event,
        tasks,
        taskSummary,
      };
    });

    // Determine overall pipeline status
    let pipelineStatus: 'SYNCED' | 'PARTIAL' | 'NOT_SYNCED' | 'PENDING';
    if (!jobs.length) {
      pipelineStatus = 'NOT_SYNCED';
    } else if (enrichedJobs.every((j) => j.status === 'success')) {
      pipelineStatus = 'SYNCED';
    } else if (enrichedJobs.some((j) => j.status === 'failed')) {
      pipelineStatus = 'PARTIAL';
    } else {
      pipelineStatus = 'PENDING';
    }

    return {
      data: {
        invoiceId,
        pipelineStatus,
        enterprises: enterpriseIds.map((eid) => ({
          ...enterpriseMap[eid],
          zwingInvoice: zwingRecords[eid] ?? null,
          zwingSynced: !!zwingRecords[eid],
        })),
        jobs: enrichedJobs,
      },
    };
  }
}
