import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TraceController } from './trace.controller';
import { TraceService } from './trace.service';
import { DipJob, DipJobSchema } from '../schemas/dip-job.schema';
import { DipJobTask, DipJobTaskSchema } from '../schemas/dip-job-task.schema';
import { Enterprise, EnterpriseSchema } from '../schemas/enterprise.schema';
import { Connector, ConnectorSchema } from '../schemas/connector.schema';
import { AppCatalog, AppCatalogSchema } from '../schemas/app-catalog.schema';
import { ConnectorEventMapping, ConnectorEventMappingSchema } from '../schemas/connector-event-mapping.schema';
import { EventCatalog, EventCatalogSchema } from '../schemas/event-catalog.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DipJob.name, schema: DipJobSchema },
      { name: DipJobTask.name, schema: DipJobTaskSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
      { name: Connector.name, schema: ConnectorSchema },
      { name: AppCatalog.name, schema: AppCatalogSchema },
      { name: ConnectorEventMapping.name, schema: ConnectorEventMappingSchema },
      { name: EventCatalog.name, schema: EventCatalogSchema },
    ]),
  ],
  controllers: [TraceController],
  providers: [TraceService],
})
export class TraceModule {}
