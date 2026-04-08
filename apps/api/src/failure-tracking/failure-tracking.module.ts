import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FailureCategory, FailureCategorySchema } from './failure-category.schema';
import { FailureCase, FailureCaseSchema } from './failure-case.schema';
import { FailureTrackingService } from './failure-tracking.service';
import { FailureTrackingController } from './failure-tracking.controller';

@Module({
  imports: [
    // Both schemas live in the 'insights' named connection (separate DB from GIP prod)
    MongooseModule.forFeature(
      [
        { name: FailureCategory.name, schema: FailureCategorySchema },
        { name: FailureCase.name, schema: FailureCaseSchema },
      ],
      'insights',
    ),
  ],
  providers: [FailureTrackingService],
  controllers: [FailureTrackingController],
  exports: [FailureTrackingService],
})
export class FailureTrackingModule {}
