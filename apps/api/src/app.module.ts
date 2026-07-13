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
import { FailureTrackingModule } from './failure-tracking/failure-tracking.module';

function buildMongoUri(): string {
  return process.env.MONGODB_URI || '';
}

function buildInsightsMongoUri(): string {
  return process.env.INSIGHTS_MONGODB_URI || process.env.MONGODB_URI || '';
}

const mongoProxyOpts = process.env.MONGO_PROXY_PORT
  ? { proxyHost: '127.0.0.1', proxyPort: parseInt(process.env.MONGO_PROXY_PORT, 10) }
  : {};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['../../.env', '.env'],
    }),

    // ── Primary GIP connection (read-only, prod data) ──────────────────────
    MongooseModule.forRoot(buildMongoUri(), {
      dbName: process.env.MONGODB_DB_NAME || 'gip-prod',
      lazyConnection: true,
      ...mongoProxyOpts,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    }),

    // ── Insights connection (read-write, separate DB, no GIP interference) ─
    MongooseModule.forRoot(buildInsightsMongoUri(), {
      connectionName: 'insights',
      dbName: process.env.INSIGHTS_MONGODB_DB || 'gip-insights',
      lazyConnection: true,
      ...mongoProxyOpts,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    }),

    // This is an internal, authenticated dashboard whose enterprise list page
    // intentionally fires one metrics request per visible row in parallel
    // (see EnterpriseTable) — a single page load can easily burst 50-100+
    // requests. 120/60s was tuned for a "one request per user action" API,
    // not this fan-out pattern, and (until trust proxy was enabled in
    // main.ts) was shared by ALL users since every request arrives from the
    // gip-web container's IP. Raised to give real headroom while still
    // catching runaway loops/bugs.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 600 }]),
    DatabaseModule,
    EnterprisesModule,
    DipJobsModule,
    TraceModule,
    SyncGapModule,
    HealthModule,
    FailureTrackingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
