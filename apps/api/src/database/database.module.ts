import { Global, Module } from '@nestjs/common';
import { SshTunnelService } from './ssh-tunnel.service';
import { MysqlTenantService } from './mysql-tenant.service';
import { MongoTunnelService } from './mongo-tunnel.service';

@Global()
@Module({
  providers: [SshTunnelService, MysqlTenantService, MongoTunnelService],
  exports: [SshTunnelService, MysqlTenantService, MongoTunnelService],
})
export class DatabaseModule {}
