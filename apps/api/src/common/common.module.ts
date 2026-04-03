import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DipJob, DipJobSchema } from '../schemas/dip-job.schema';
import { ZwingStatusService } from './zwing-status.service';
import { BlobService } from './blob.service';

/**
 * Shared domain logic used by both EnterprisesModule and DipJobsModule.
 * Import this module wherever Zwing ↔ GIP reconciliation is needed.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: DipJob.name, schema: DipJobSchema }]),
  ],
  providers: [ZwingStatusService, BlobService],
  exports: [ZwingStatusService, BlobService],
})
export class CommonModule {}
