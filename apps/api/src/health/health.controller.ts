import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SshTunnelService } from '../database/ssh-tunnel.service';
import { MongoTunnelService } from '../database/mongo-tunnel.service';

@Controller('api/health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly sshTunnel: SshTunnelService,
    private readonly mongoTunnel: MongoTunnelService,
  ) {}

  @Get()
  check() {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      mongodb: {
        state: states[this.mongoConnection.readyState] ?? 'unknown',
        readyState: this.mongoConnection.readyState,
        proxyPort: this.mongoTunnel.proxyPort,
        uri: (process.env.MONGODB_URI || '').replace(/:([^:@]+)@/, ':***@'),
      },
      mysql: {
        tunnelLocalPort: this.sshTunnel.localPort,
      },
    };
  }
}
