import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { SshTunnelService } from './ssh-tunnel.service';

@Injectable()
export class MysqlTenantService implements OnModuleDestroy {
  private readonly logger = new Logger(MysqlTenantService.name);
  private pools = new Map<string, mysql.Pool>();

  constructor(
    private readonly config: ConfigService,
    private readonly tunnel: SshTunnelService,
  ) {}

  async onModuleDestroy() {
    for (const [db, pool] of this.pools) {
      await pool.end();
      this.logger.log(`Closed MySQL pool for db: ${db}`);
    }
  }

  private async getPool(dbName: string): Promise<mysql.Pool> {
    if (this.pools.has(dbName)) {
      return this.pools.get(dbName);
    }

    await this.tunnel.waitForReady();

    const mysqlConfig = this.config.get('mysql');
    const pool = mysql.createPool({
      host: '127.0.0.1',
      port: this.tunnel.localPort,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 15000,
      // MySQL stores timestamps in IST (UTC+5:30). This tells mysql2 to format
      // JS Date objects as IST strings so BETWEEN comparisons are correct.
      timezone: '+05:30',
    });

    this.pools.set(dbName, pool);
    this.logger.log(`Created MySQL pool for db: ${dbName}`);
    return pool;
  }

  async query<T = any>(dbName: string, sql: string, params: any[] = []): Promise<T[]> {
    const pool = await this.getPool(dbName);
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
  }

  async queryOne<T = any>(dbName: string, sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(dbName, sql, params);
    return rows[0] ?? null;
  }

  getMasterDb(): string {
    return this.config.get<string>('mysql.masterDb');
  }
}
