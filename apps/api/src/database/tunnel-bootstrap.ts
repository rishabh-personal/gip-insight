/**
 * Standalone tunnel setup — called from main.ts BEFORE NestFactory.create().
 * No NestJS DI, no async factories, no race conditions.
 */
import { Client } from 'ssh2';
import * as net from 'net';
import * as fs from 'fs';
import { promises as dns } from 'dns';

interface SshConfig {
  host: string;
  port: number;
  username: string;
  keyPath: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function findFreePort(start = 10000): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(start, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on('error', () => findFreePort(start + 1).then(resolve));
  });
}

function readKey(keyPath: string): Buffer {
  try {
    return fs.readFileSync(keyPath);
  } catch (e) {
    throw new Error(`Cannot read SSH private key at "${keyPath}": ${(e as Error).message}\nMake sure the path is correct and permissions are 600.`);
  }
}

// ─── MySQL tunnel (simple TCP port-forward) ───────────────────────────────────

export async function setupMysqlTunnel(
  sshConfig: SshConfig,
  mysqlHost: string,
  mysqlPort: number,
  preferredLocalPort = 13306,
): Promise<number> {
  const privateKey = readKey(sshConfig.keyPath);
  const localPort = await findFreePort(preferredLocalPort);

  return new Promise<number>((resolve, reject) => {
    const server = net.createServer((client) => {
      const ssh = new Client();
      ssh.on('ready', () => {
        ssh.forwardOut('127.0.0.1', 0, mysqlHost, mysqlPort, (err, stream) => {
          if (err) { client.destroy(); ssh.end(); return; }
          client.pipe(stream).pipe(client);
          client.on('close', () => ssh.end());
          stream.on('close', () => client.destroy());
        });
      });
      ssh.on('error', () => client.destroy());
      ssh.connect({ host: sshConfig.host, port: sshConfig.port, username: sshConfig.username, privateKey, readyTimeout: 10000 });
    });

    server.listen(localPort, '127.0.0.1', () => {
      console.log(`[Tunnel] MySQL  127.0.0.1:${localPort} → ${mysqlHost}:${mysqlPort} via ${sshConfig.host}`);
      resolve(localPort);
    });
    server.on('error', reject);
  });
}

// ─── MongoDB SOCKS5 proxy ─────────────────────────────────────────────────────

export async function setupMongoSocks5Proxy(
  sshConfig: SshConfig,
  preferredLocalPort = 1081,
): Promise<number> {
  const privateKey = readKey(sshConfig.keyPath);
  const localPort = await findFreePort(preferredLocalPort);

  return new Promise<number>((resolve, reject) => {
    const server = net.createServer((client) => {
      handleSocks5Connection(client, sshConfig, privateKey);
    });

    server.listen(localPort, '127.0.0.1', () => {
      console.log(`[Tunnel] MongoDB SOCKS5 proxy on 127.0.0.1:${localPort} (via ${sshConfig.host})`);
      resolve(localPort);
    });
    server.on('error', reject);
  });
}

function handleSocks5Connection(
  client: net.Socket,
  sshConfig: { host: string; port: number; username: string },
  privateKey: Buffer,
) {
  let state: 'greeting' | 'request' = 'greeting';
  let buf = Buffer.alloc(0);

  client.on('error', () => client.destroy());

  client.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    if (state === 'greeting') {
      if (buf.length < 2) return;
      const nmethods = buf[1];
      if (buf.length < 2 + nmethods) return;
      client.write(Buffer.from([0x05, 0x00])); // no-auth
      buf = Buffer.alloc(0);
      state = 'request';
      return;
    }

    if (state === 'request') {
      if (buf.length < 4) return;
      const atype = buf[3];
      let host = '';
      let port = 0;
      let consumed = 0;

      if (atype === 0x01) {           // IPv4
        if (buf.length < 10) return;
        host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
        port = buf.readUInt16BE(8);
        consumed = 10;
      } else if (atype === 0x03) {    // domain
        if (buf.length < 5) return;
        const hl = buf[4];
        if (buf.length < 5 + hl + 2) return;
        host = buf.slice(5, 5 + hl).toString('utf8');
        port = buf.readUInt16BE(5 + hl);
        consumed = 5 + hl + 2;
      } else if (atype === 0x04) {    // IPv6
        if (buf.length < 22) return;
        const parts: string[] = [];
        for (let i = 0; i < 8; i++) parts.push(buf.readUInt16BE(4 + i * 2).toString(16));
        host = parts.join(':');
        port = buf.readUInt16BE(20);
        consumed = 22;
      } else {
        client.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        client.destroy(); return;
      }

      if (buf[1] !== 0x01) { // only CONNECT
        client.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        client.destroy(); return;
      }

      const leftover = buf.slice(consumed);
      buf = Buffer.alloc(0);
      client.removeAllListeners('data');

      openSshForward(host, port, sshConfig, privateKey, client, leftover);
    }
  });
}

function openSshForward(
  remoteHost: string, remotePort: number,
  sshConfig: { host: string; port: number; username: string },
  privateKey: Buffer,
  client: net.Socket,
  leftover: Buffer,
) {
  const ssh = new Client();
  const die = () => { try { ssh.end(); } catch {} try { client.destroy(); } catch {} };

  ssh.on('error', () => {
    client.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    die();
  });

  ssh.on('ready', () => {
    ssh.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (err, stream) => {
      if (err) {
        client.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        die(); return;
      }
      client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      if (leftover.length) stream.write(leftover);
      stream.pipe(client); client.pipe(stream);
      stream.on('close', die); client.on('close', die);
      stream.on('error', die); client.on('error', die);
    });
  });

  ssh.connect({
    host: sshConfig.host, port: sshConfig.port,
    username: sshConfig.username, privateKey,
    readyTimeout: 15000,
  });
}
