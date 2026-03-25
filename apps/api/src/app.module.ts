import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { EnterprisesModule } from './enterprises/enterprises.module';
import { DipJobsModule } from './dip-jobs/dip-jobs.module';
import { TraceModule } from './trace/trace.module';
import { SyncGapModule } from './sync-gap/sync-gap.module';
import { HealthModule } from './health/health.module';

function buildMongoUri(): string {
  const raw = process.env.MONGODB_URI || '';
  const proxyPort = process.env.MONGO_PROXY_PORT;

  if (!proxyPort) {
    // No proxy — use raw URI as-is (direct connection; may fail if IP not whitelisted)
    console.log('[AppModule] MongoDB: direct connection (no SOCKS5 proxy configured)');
    return raw;
  }

  // Keep the original mongodb+srv:// URI; driver handles SRV + TLS normally.
  // The proxy options are passed separately in the options object below.
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
      // Don't block NestJS startup waiting for MongoDB — connect on first use
      lazyConnection: true,
      // If SOCKS5 proxy is up, route all Atlas traffic through it
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
})
export class AppModule {}
