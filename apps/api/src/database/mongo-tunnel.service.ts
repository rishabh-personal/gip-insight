import { Injectable } from '@nestjs/common';

/**
 * Thin wrapper — the actual SOCKS5 proxy is created in main.ts before NestJS
 * starts. This service just exposes the proxy port for the health controller.
 */
@Injectable()
export class MongoTunnelService {
  get proxyPort(): number | null {
    const p = process.env.MONGO_PROXY_PORT;
    return p ? parseInt(p, 10) : null;
  }
}
