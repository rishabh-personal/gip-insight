import { Injectable } from '@nestjs/common';

/**
 * Thin wrapper — the actual SSH tunnel is created in main.ts before NestJS
 * starts. This service just exposes the already-running local port so that
 * MysqlTenantService can read it.
 */
@Injectable()
export class SshTunnelService {
  /** The local port the MySQL tunnel is listening on. */
  get localPort(): number {
    return parseInt(process.env.MYSQL_TUNNEL_PORT || '13306', 10);
  }

  /** No-op — tunnel already running when this service is instantiated. */
  async waitForReady(): Promise<void> {}
}
