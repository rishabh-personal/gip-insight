import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnterprisesController } from './enterprises.controller';
import { EnterprisesService } from './enterprises.service';
import { Enterprise, EnterpriseSchema } from '../schemas/enterprise.schema';
import { Connector, ConnectorSchema } from '../schemas/connector.schema';
import { ConnectorEventMapping, ConnectorEventMappingSchema } from '../schemas/connector-event-mapping.schema';
import { AppCatalog, AppCatalogSchema } from '../schemas/app-catalog.schema';
import { EventCatalog, EventCatalogSchema } from '../schemas/event-catalog.schema';
import { DipJob, DipJobSchema } from '../schemas/dip-job.schema';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Enterprise.name, schema: EnterpriseSchema },
      { name: Connector.name, schema: ConnectorSchema },
      { name: ConnectorEventMapping.name, schema: ConnectorEventMappingSchema },
      { name: AppCatalog.name, schema: AppCatalogSchema },
      { name: EventCatalog.name, schema: EventCatalogSchema },
      { name: DipJob.name, schema: DipJobSchema },
    ]),
    CommonModule,
  ],
  controllers: [EnterprisesController],
  providers: [EnterprisesService],
  exports: [EnterprisesService],
})
export class EnterprisesModule {}
