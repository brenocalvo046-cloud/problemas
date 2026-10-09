// Servidor HTTP (arquivos estáticos do cliente) + WebSocket do jogo.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import config from './config.js';
import { RoomManager } from './RoomManager.js';
import { attachGameServer } from './GameServer.js';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });

  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return send(res, 400, 'Bad Request'); }

  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (pathname.endsWith('/')) pathname += 'index.html';

  let file = path.join(CLIENT_DIR, path.normalize(pathname));
  if (!file.startsWith(CLIENT_DIR + path.sep)) return send(res, 403, 'Forbidden');

  let stat = await fs.promises.stat(file).catch(() => null);
  if (!stat?.isFile()) {
    if (path.extname(pathname)) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });
    file = path.join(CLIENT_DIR, 'index.html'); // fallback
    stat = await fs.promises.stat(file).catch(() => null);
    if (!stat) return send(res, 404, 'Not Found');
  }

  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  const headers = {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    ETag: etag,
    'Content-Length': stat.size,
  };
  if (req.headers['if-none-match'] === etag) return send(res, 304, null, { ETag: etag });
  res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

export function createApp({ port = config.port, host = config.host } = {}) {
  const rooms = new RoomManager();
  const server = http.createServer((req, res) => {
    serveStatic(req, res).catch((err) => {
      console.error('[http]', err);
      if (!res.headersSent) send(res, 500, 'Internal Server Error');
      else res.end();
    });
  });
  const game = attachGameServer(server, rooms);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        server,
        rooms,
        port: server.address().port,
        close: () => new Promise((done) => {
          game.close();
          rooms.close();
          server.close(() => done());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createApp();
  console.log(`PROBLEMAS rodando em http://localhost:${app.port}`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
