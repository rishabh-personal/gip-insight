import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncGapController } from './sync-gap.controller';
import { SyncGapService } from './sync-gap.service';
import { DipJob, DipJobSchema } from '../schemas/dip-job.schema';
import { Enterprise, EnterpriseSchema } from '../schemas/enterprise.schema';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DipJob.name, schema: DipJobSchema },
      { name: Enterprise.name, schema: EnterpriseSchema },
    ]),
    CommonModule,
  ],
  controllers: [SyncGapController],
  providers: [SyncGapService],
})
export class SyncGapModule {}
