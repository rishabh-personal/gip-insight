import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env before anything else
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function bootstrap() {
  const { setupMysqlTunnel, setupMongoSocks5Proxy } = await import('./database/tunnel-bootstrap');

  const sshConfig = {
    host:     process.env.SSH_HOST     || 'jh.ginesys.one',
    port:     parseInt(process.env.SSH_PORT || '22', 10),
    username: process.env.SSH_USERNAME || 'azureuser',
    keyPath:  process.env.SSH_KEY_PATH || '/Users/rishabhshukla/.ssh/rishabh-macbook',
  };

  // ── 1. MySQL tunnel ──────────────────────────────────────────────────────
  try {
    const mysqlPort = await setupMysqlTunnel(
      sshConfig,
      process.env.MYSQL_HOST || '172.16.15.4',
      parseInt(process.env.MYSQL_PORT || '3306', 10),
    );
    process.env.MYSQL_TUNNEL_PORT = String(mysqlPort);
    console.log(`[Bootstrap] MySQL tunnel ready on port ${mysqlPort}`);
  } catch (e) {
    console.warn(`[Bootstrap] MySQL tunnel failed: ${(e as Error).message}`);
    console.warn('[Bootstrap] MySQL queries will fail but app will still start.');
  }

  // ── 2. MongoDB SOCKS5 proxy ──────────────────────────────────────────────
  try {
    const mongoProxyPort = await setupMongoSocks5Proxy(sshConfig);
    process.env.MONGO_PROXY_PORT = String(mongoProxyPort);
    console.log(`[Bootstrap] MongoDB SOCKS5 proxy ready on port ${mongoProxyPort}`);
  } catch (e) {
    console.warn(`[Bootstrap] MongoDB SOCKS5 proxy failed: ${(e as Error).message}`);
    console.warn('[Bootstrap] Attempting direct MongoDB connection (may fail if IP not whitelisted).');
  }

  // ── 3. Start NestJS (tunnels are ready, env vars set) ────────────────────
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { ValidationPipe } = await import('@nestjs/common');
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
  const { ResponseInterceptor } = await import('./common/interceptors/response.interceptor');
  const { ExpressAdapter } = await import('@nestjs/platform-express');

  const app = await NestFactory.create(AppModule, new ExpressAdapter(), { bufferLogs: true });
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }));
  app.useGlobalInterceptors(new ResponseInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GIP Insight API')
    .setDescription('Dashboard API for GIP ↔ Zwing sync monitoring')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = parseInt(process.env.API_PORT || '3001', 10);

  // Retry binding — in watch mode the old process may still hold the port for a few seconds
  let bound = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await app.listen(port);
      bound = true;
      break;
    } catch (e: any) {
      if (e.code === 'EADDRINUSE' && attempt < 10) {
        console.warn(`[Bootstrap] Port ${port} busy (attempt ${attempt}/10), retrying in 2s…`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw e;
      }
    }
  }

  if (bound) {
    console.log(`\n🚀 GIP Insight API  →  http://localhost:${port}`);
    console.log(`📚 Swagger docs     →  http://localhost:${port}/api/docs`);
    console.log(`❤️  Health check    →  http://localhost:${port}/api/health\n`);
  }
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});
