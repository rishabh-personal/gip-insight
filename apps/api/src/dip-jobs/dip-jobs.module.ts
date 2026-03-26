import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DipJobsController } from './dip-jobs.controller';
import { DipJobsService } from './dip-jobs.service';
import { DipJob, DipJobSchema } from '../schemas/dip-job.schema';
import { DipJobTask, DipJobTaskSchema } from '../schemas/dip-job-task.schema';
import { Connector, ConnectorSchema } from '../schemas/connector.schema';
import { ConnectorEventMapping, ConnectorEventMappingSchema } from '../schemas/connector-event-mapping.schema';
import { AppCatalog, AppCatalogSchema } from '../schemas/app-catalog.schema';
import { EventCatalog, EventCatalogSchema } from '../schemas/event-catalog.schema';
import { Enterprise, EnterpriseSchema } from '../schemas/enterprise.schema';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DipJob.name, schema: DipJobSchema },
      { name: DipJobTask.name, schema: DipJobTaskSchema },
      { name: Connector.name, schema: ConnectorSchema },
      { name: ConnectorEventMapping.name, schema: ConnectorEventMappingSchema },
      { name: AppCatalog.name, schema: AppCatalogSchema },
      { name: EventCatalog.name, schema: EventCatalogSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
    ]),
    CommonModule,
  ],
  controllers: [DipJobsController],
  providers: [DipJobsService],
})
export class DipJobsModule {}
