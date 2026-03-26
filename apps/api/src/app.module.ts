import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { EnterprisesModule } from './enterprises/enterprises.module';
import { DipJobsModule } from './dip-jobs/dip-jobs.module';
import { TraceModule } from './trace/trace.module';
import { SyncGapModule } from './sync-gap/sync-gap.module';
import { HealthModule } from './health/health.module';

function buildMongoUri(): string {
  const raw = process.env.MONGODB_URI || '';
  if (!process.env.MONGO_PROXY_PORT) {
    // No SOCKS5 proxy — use raw URI as-is (direct Atlas connection; may fail if IP not whitelisted)
    return raw;
  }
  return raw;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['../../.env', '.env'],
    }),

    MongooseModule.forRoot(buildMongoUri(), {
      dbName: process.env.MONGODB_DB_NAME || 'gip-prod',
      // Don't block NestJS startup — connect on first use
      lazyConnection: true,
      // Route Atlas traffic through the SOCKS5 proxy when it is available
      ...(process.env.MONGO_PROXY_PORT
        ? {
            proxyHost: '127.0.0.1',
            proxyPort: parseInt(process.env.MONGO_PROXY_PORT, 10),
          }
        : {}),
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DatabaseModule,
    EnterprisesModule,
    DipJobsModule,
    TraceModule,
    SyncGapModule,
    HealthModule,
  ],
  providers: [
    // Rate-limit all routes globally: 120 requests / 60 s per IP
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
