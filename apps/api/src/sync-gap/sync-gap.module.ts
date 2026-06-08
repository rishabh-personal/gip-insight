import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncGapController } from './sync-gap.controller';
import { SyncGapService } from './sync-gap.service';
import { DipJob, DipJobSchema } from '../schemas/dip-job.schema';
import { Enterprise, EnterpriseSchema } from '../schemas/enterprise.schema';
import { Connector, ConnectorSchema } from '../schemas/connector.schema';
import { ConnectorEventMapping, ConnectorEventMappingSchema } from '../schemas/connector-event-mapping.schema';
import { EventCatalog, EventCatalogSchema } from '../schemas/event-catalog.schema';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DipJob.name,                schema: DipJobSchema },
      { name: Enterprise.name,            schema: EnterpriseSchema },
      { name: Connector.name,             schema: ConnectorSchema },
      { name: ConnectorEventMapping.name, schema: ConnectorEventMappingSchema },
      { name: EventCatalog.name,          schema: EventCatalogSchema },
    ]),
    CommonModule,
  ],
  controllers: [SyncGapController],
  providers: [SyncGapService],
})
export class SyncGapModule {}
