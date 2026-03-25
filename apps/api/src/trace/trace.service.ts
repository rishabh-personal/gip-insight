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

    // Step 2: Fetch Zwing invoice record for each enterprise
    const zwingRecords: Record<string, any> = {};
    for (const eid of enterpriseIds) {
      const enterprise = enterpriseMap[eid];
      if (!enterprise?.meta?.zwingVId) continue;

      try {
        // Find vendor row to get db_name
        const vendors = await this.mysql.query(
          this.mysql.getMasterDb(),
          `SELECT db_name FROM vendor WHERE sso_enterprise_id = ? AND deleted = 0 LIMIT 1`,
          [eid],
        );
        const dbName = (vendors[0] as any)?.db_name;
        if (!dbName) continue;

        const invoices = await this.mysql.query(
          dbName,
          `SELECT id, invoice_id, store_id, v_id, status, transaction_type, transaction_sub_type,
                  total, created_at, updated_at, sync_status
           FROM invoices WHERE invoice_id = ? LIMIT 1`,
          [invoiceId],
        );
        if (invoices[0]) zwingRecords[eid] = invoices[0];
      } catch (e) {
        this.logger.warn(`Zwing lookup failed for ${eid}: ${e.message}`);
      }
    }

    // Step 3: Enrich jobs with connector/app/event and tasks
    const enrichedJobs = await Promise.all(
      jobs.map(async (job) => {
        const [tasks, connector] = await Promise.all([
          this.taskModel.find({ jobId: job._id }).sort({ createdAt: 1 }).lean(),
          this.connectorModel.findById(job.connectorId).lean(),
        ]);

        const appIds = [connector?.outboundAppId?.toString(), connector?.inboundAppId?.toString()].filter(Boolean);
        const apps = await this.appModel.find({
          _id: { $in: appIds.map((id) => new Types.ObjectId(id)) },
        }).lean();
        const appMap: Record<string, any> = {};
        for (const a of apps) appMap[a._id.toString()] = a;

        let event = null;
        if (job.connectorAppEventId) {
          const cem = await this.cemModel.findById(job.connectorAppEventId).lean();
          if (cem?.outboundEventId) {
            event = await this.eventModel.findById(cem.outboundEventId).lean();
          }
        }

        const taskSummary = {
          total: tasks.length,
          success: tasks.filter((t) => t.status === 'success').length,
          failed: tasks.filter((t) => t.status === 'failed').length,
          pending: tasks.filter((t) => t.status === 'pending').length,
        };

        return {
          ...job,
          connector,
          outboundApp: connector ? appMap[connector.outboundAppId?.toString()] : null,
          inboundApp: connector ? appMap[connector.inboundAppId?.toString()] : null,
          event,
          tasks,
          taskSummary,
        };
      }),
    );

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
