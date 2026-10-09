// Camada de rede (WebSocket). Valida mensagens, aplica limites e delega à Room.
import { WebSocketServer } from 'ws';
import config from './config.js';
import { GameError } from './errors.js';
import { normalizeCode, sanitizeNick } from './rules.js';
import { SlidingWindow, TokenBucket } from './rateLimiter.js';

const OPEN = 1;

function safeSend(ws, obj) {
  if (ws.readyState !== OPEN) return;
  if (ws.bufferedAmount > 1_000_000) { ws.terminate(); return; }
  ws.send(JSON.stringify(obj));
}

function clientIp(req) {
  if (config.trustProxy) {
    // Cada proxy confiável ACRESCENTA o IP que viu ao final do X-Forwarded-For.
    // Os valores à esquerda podem ter sido forjados pelo cliente, então contamos da direita.
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) {
      const parts = xff.split(',').map((x) => x.trim()).filter(Boolean);
      const ip = parts[Math.max(0, parts.length - config.proxyHops)];
      if (ip) return ip;
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

export function attachGameServer(httpServer, rooms) {
  const createLimit = new SlidingWindow(8, 60_000);     // salas criadas / min / IP
  const joinLimit = new SlidingWindow(30, 60_000);      // entradas / min / IP
  const joinFailLimit = new SlidingWindow(10, 60_000);  // códigos errados / min / IP (anti força-bruta)
  const connsPerIp = new Map();

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 2048,
    verifyClient: ({ req, origin }, done) => {
      const ip = clientIp(req);
      if ((connsPerIp.get(ip) || 0) >= config.maxConnectionsPerIp) return done(false, 429, 'Too many connections');
      if (!origin) return done(true); // clientes não-navegador (testes)
      try {
        const o = new URL(origin);
        const allowed = config.allowedOrigins.length
          ? config.allowedOrigins.includes(o.origin)
          : o.host === req.headers.host;
        return allowed ? done(true) : done(false, 403, 'Forbidden origin');
      } catch {
        return done(false, 403, 'Bad origin');
      }
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    connsPerIp.set(ip, (connsPerIp.get(ip) || 0) + 1);

    const ctx = { ws, ip, room: null, player: null, strikes: 0, bucket: new TokenBucket(15, 8) };
    ctx.conn = {
      send: (obj) => safeSend(ws, obj),
      replaced: () => { // a mesma sessão foi aberta em outro lugar
        ctx.room = null; ctx.player = null;
        safeSend(ws, { t: 'replaced' });
        ws.close(4001, 'replaced');
      },
    };

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      if (!ctx.bucket.take()) {
        if (++ctx.strikes > 25) ws.close(1008, 'rate limit');
        return safeSend(ws, { t: 'error', code: 'RATE_LIMIT', message: 'Devagar! Muitas ações em pouco tempo.' });
      }
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { msg = null; }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') {
        return safeSend(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Mensagem inválida.' });
      }
      try {
        handle(ctx, msg);
      } catch (err) {
        if (err instanceof GameError) safeSend(ws, { t: 'error', code: err.code, message: err.message, ref: msg.t });
        else {
          console.error('[internal]', err);
          safeSend(ws, { t: 'error', code: 'INTERNAL', message: 'Erro interno do servidor.', ref: msg.t });
        }
      }
    });

    ws.on('close', () => {
      const n = (connsPerIp.get(ip) || 1) - 1;
      if (n <= 0) connsPerIp.delete(ip); else connsPerIp.set(ip, n);
      if (ctx.room && ctx.player) ctx.room.detach(ctx.player, ctx.conn);
    });
    ws.on('error', () => {});
  });

  function bind(ctx, room, player) {
    ctx.room = room;
    ctx.player = player;
    room.attach(player, ctx.conn);
    ctx.conn.send({ t: 'session', code: room.code, token: player.token });
    room.broadcast();
  }

  function handle(ctx, msg) {
    const { ip } = ctx;
    switch (msg.t) {
      case 'ping':
        return ctx.conn.send({ t: 'pong' });

      case 'create': {
        if (ctx.player) throw new GameError('ALREADY_IN_ROOM', 'Você já está em uma sala.');
        if (!createLimit.hit(ip)) throw new GameError('RATE_LIMIT', 'Muitas salas criadas. Aguarde um minuto.');
        const room = rooms.create();
        return bind(ctx, room, room.addPlayer(sanitizeNick(msg.nick)));
      }

      case 'join': {
        if (ctx.player) throw new GameError('ALREADY_IN_ROOM', 'Você já está em uma sala.');
        if (!joinLimit.hit(ip) || !joinFailLimit.check(ip)) {
          throw new GameError('RATE_LIMIT', 'Muitas tentativas de entrada. Aguarde um minuto.');
        }
        const room = rooms.get(normalizeCode(msg.code));
        if (!room) {
          joinFailLimit.hit(ip);
          throw new GameError('ROOM_NOT_FOUND', 'Sala não encontrada. Confira o código.');
        }
        return bind(ctx, room, room.addPlayer(sanitizeNick(msg.nick)));
      }

      case 'resume': {
        if (ctx.player) throw new GameError('ALREADY_IN_ROOM', 'Você já está em uma sala.');
        if (!joinLimit.hit(ip) || !joinFailLimit.check(ip)) throw new GameError('RATE_LIMIT', 'Muitas tentativas. Aguarde um minuto.');
        const room = rooms.get(normalizeCode(msg.code));
        const player = room?.findByToken(msg.token);
        if (!player) {
          joinFailLimit.hit(ip);
          throw new GameError('SESSION_INVALID', 'Sua sessão nesta sala expirou.');
        }
        return bind(ctx, room, player);
      }

      case 'setSecret':
      case 'guess':
      case 'rematch':
      case 'leave': {
        if (!ctx.room || !ctx.player) throw new GameError('NOT_IN_ROOM', 'Você não está em uma sala.');
        const { room, player } = ctx;
        if (msg.t === 'setSecret') room.setSecret(player, msg.secret);
        else if (msg.t === 'guess') room.guess(player, msg.guess);
        else if (msg.t === 'rematch') room.rematch(player, msg.on !== false);
        else {
          room.leave(player);
          ctx.room = null; ctx.player = null;
          ctx.conn.send({ t: 'left' });
        }
        return;
      }

      default:
        throw new GameError('BAD_MESSAGE', 'Comando desconhecido.');
    }
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
    createLimit.sweep(); joinLimit.sweep(); joinFailLimit.sweep();
  }, config.heartbeatMs);
  heartbeat.unref?.();

  return {
    wss,
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
