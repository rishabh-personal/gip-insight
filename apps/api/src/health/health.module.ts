import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

@Module({
  imports: [MongooseModule],
  controllers: [HealthController],
})
export class HealthModule {}
