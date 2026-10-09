// Testes de integração: servidor real + clientes WebSocket reais.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createApp } from '../server/index.js';

let app;
before(async () => { app = await createApp({ port: 0, host: '127.0.0.1' }); });
after(async () => { await app.close(); });

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
  const c = { ws, raw: [], msgs: [], waiters: [] };
  ws.on('message', (data) => {
    const text = data.toString();
    const msg = JSON.parse(text);
    c.raw.push(text);
    c.msgs.push(msg);
    c.waiters = c.waiters.filter((w) => !w(msg));
  });
  c.open = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.next = (pred, ms = 2000) => new Promise((resolve, reject) => {
    const hit = c.msgs.find(pred);
    if (hit) return resolve(hit);
    const t = setTimeout(() => reject(new Error('timeout esperando mensagem')), ms);
    c.waiters.push((m) => { if (pred(m)) { clearTimeout(t); resolve(m); return true; } return false; });
  });
  // espera até o estado do cliente satisfazer pred (olha o estado atual primeiro)
  c.nextState = (pred, ms = 2000) => new Promise((resolve, reject) => {
    const cur = c.lastState();
    if (cur && pred(cur)) return resolve(cur);
    const t = setTimeout(() => reject(new Error('timeout esperando state')), ms);
    c.waiters.push((m) => {
      if (m.t === 'state' && pred(m.game)) { clearTimeout(t); resolve(m.game); return true; }
      return false;
    });
  });
  c.lastState = () => [...c.msgs].reverse().find((m) => m.t === 'state')?.game;
  c.close = () => ws.close();
  return c;
}

async function startRoom() {
  const a = client(); const b = client();
  await Promise.all([a.open, b.open]);
  a.send({ t: 'create', nick: 'Ana' });
  const sa = await a.next((m) => m.t === 'session');
  b.send({ t: 'join', code: sa.code.toLowerCase(), nick: 'Bruno' });
  await b.next((m) => m.t === 'session');
  await a.nextState((g) => g.phase === 'setup');
  return { a, b, code: sa.code, tokenA: sa.token };
}

const SECRET_A = 'ALFA12345678';
const SECRET_B = 'BRAVO9876543';

async function playUntilReady(a, b) {
  a.send({ t: 'setSecret', secret: SECRET_A.toLowerCase() }); // minúsculas devem ser aceitas
  b.send({ t: 'setSecret', secret: SECRET_B });
  const ga = await a.nextState((g) => g.phase === 'playing');
  const gb = await b.nextState((g) => g.phase === 'playing');
  return { ga, gb };
}

test('sala: criar, entrar, presença e fase de senha', async () => {
  const { a, b } = await startRoom();
  const ga = a.lastState(); const gb = b.lastState();
  assert.equal(ga.phase, 'setup');
  assert.equal(ga.opponent.nick, 'Bruno');
  assert.equal(gb.opponent.nick, 'Ana');
  a.close(); b.close();
});

test('sala inexistente, sala cheia e comando inválido', async () => {
  const { a, b, code } = await startRoom();
  const c = client(); await c.open;
  c.send({ t: 'join', code: 'ZZZZZZ', nick: 'X' });
  assert.equal((await c.next((m) => m.t === 'error')).code, 'ROOM_NOT_FOUND');
  c.send({ t: 'join', code, nick: 'Intruso' });
  assert.equal((await c.next((m) => m.t === 'error' && m.code === 'ROOM_FULL')).code, 'ROOM_FULL');
  c.send({ t: 'guess', guess: 'AAAAAAAAAAAA' });
  assert.equal((await c.next((m) => m.t === 'error' && m.code === 'NOT_IN_ROOM')).code, 'NOT_IN_ROOM');
  c.send({ t: 'hackear' });
  assert.equal((await c.next((m) => m.t === 'error' && m.code === 'BAD_MESSAGE')).code, 'BAD_MESSAGE');
  [a, b, c].forEach((x) => x.close());
});

test('senha: valida tamanho/caracteres e não deixa trocar depois de confirmar', async () => {
  const { a, b } = await startRoom();
  for (const bad of ['curta', 'abc123def45!', 'abc123def4567', 'ßabc123def45', 12345]) {
    a.send({ t: 'setSecret', secret: bad });
    const e = await a.next((m) => m.t === 'error' && m.ref === 'setSecret' && !m.seen && (m.seen = true));
    assert.equal(e.code, 'INVALID_PASSWORD');
  }
  a.send({ t: 'setSecret', secret: SECRET_A });
  await a.nextState((g) => g.you.secretSet);
  a.send({ t: 'setSecret', secret: 'OUTRA1234567' });
  assert.equal((await a.next((m) => m.code === 'ALREADY_SET')).code, 'ALREADY_SET');
  assert.equal(b.lastState().opponent.secretSet, true, 'adversário vê só que a senha foi definida');
  a.close(); b.close();
});

test('partida: turnos, validação no servidor e senha NUNCA vaza ao adversário', async () => {
  const { a, b } = await startRoom();
  const { ga, gb } = await playUntilReady(a, b);
  assert.ok(['you', 'opponent'].includes(ga.turn));
  assert.notEqual(ga.turn, gb.turn);

  const first = ga.turn === 'you' ? { c: a, other: b, secretOther: SECRET_B } : { c: b, other: a, secretOther: SECRET_A };
  const second = first.c === a ? { c: b } : { c: a };

  // quem não é da vez não pode jogar
  second.c.send({ t: 'guess', guess: 'ZZZZZZZZZZZZ' });
  assert.equal((await second.c.next((m) => m.code === 'NOT_YOUR_TURN')).code, 'NOT_YOUR_TURN');

  // tentativa inválida não gasta a vez
  first.c.send({ t: 'guess', guess: 'CURTA' });
  assert.equal((await first.c.next((m) => m.code === 'INVALID_GUESS')).code, 'INVALID_GUESS');

  // tentativa válida errada: servidor devolve as cores e passa a vez
  first.c.send({ t: 'guess', guess: 'ZZZZZZZZZZZZ' });
  const g1 = await first.c.nextState((g) => g.myGuesses.length === 1);
  assert.equal(g1.myGuesses[0].marks, 'RRRRRRRRRRRR');
  assert.equal(g1.turn, 'opponent');
  const g2 = await second.c.nextState((g) => g.oppGuesses.length === 1);
  assert.equal(g2.turn, 'you', 'o adversário vê a tentativa e o turno em tempo real');

  // nenhum byte recebido por ninguém contém a senha do outro (só a própria)
  for (const text of a.raw) assert.ok(!text.includes(SECRET_B), 'A recebeu a senha de B');
  for (const text of b.raw) assert.ok(!text.includes(SECRET_A), 'B recebeu a senha de A');
  a.close(); b.close();
});

test('vitória: revela senhas só no fim, com estatísticas, e permite revanche', async () => {
  const { a, b } = await startRoom();
  const { ga } = await playUntilReady(a, b);
  const w = ga.turn === 'you' ? { c: a, l: b, target: SECRET_B } : { c: b, l: a, target: SECRET_A };

  w.c.send({ t: 'guess', guess: 'ZZZZZZZZZZZZ' });
  await w.l.nextState((g) => g.turn === 'you');
  w.l.send({ t: 'guess', guess: 'YYYYYYYYYYYY' });
  await w.c.nextState((g) => g.turn === 'you');
  w.c.send({ t: 'guess', guess: w.target.toLowerCase() }); // rápido demais (<250 ms)
  assert.equal((await w.c.next((m) => m.code === 'TOO_FAST')).code, 'TOO_FAST');
  await new Promise((r) => setTimeout(r, 300));
  w.c.send({ t: 'guess', guess: w.target.toLowerCase() });

  const gw = await w.c.nextState((g) => g.phase === 'finished');
  const gl = await w.l.nextState((g) => g.phase === 'finished');
  assert.equal(gw.result.youWon, true);
  assert.equal(gl.result.youWon, false);
  assert.equal(gw.result.reason, 'guessed');
  assert.equal(gw.result.secrets.opponent, w.target);
  assert.equal(gl.result.secrets.you, w.target);
  assert.equal(gw.result.stats.you.attempts, 2);
  assert.equal(gw.result.stats.you.green, 12);
  assert.equal(gw.result.stats.you.red, 12);
  assert.equal(gw.result.stats.opponent.attempts, 1);

  // não pode jogar depois do fim
  w.l.send({ t: 'guess', guess: 'YYYYYYYYYYYY' });
  assert.equal((await w.l.next((m) => m.code === 'BAD_PHASE')).code, 'BAD_PHASE');

  // revanche exige os dois
  w.c.send({ t: 'rematch' });
  const mid = await w.l.nextState((g) => g.opponent.rematch);
  assert.equal(mid.phase, 'finished');
  w.l.send({ t: 'rematch' });
  const g = await w.c.nextState((g) => g.phase === 'setup');
  assert.equal(g.you.secretSet, false);
  assert.equal(g.myGuesses.length, 0);
  assert.equal(g.result, null);
  a.close(); b.close();
});

test('reconexão: resume devolve o estado, inclusive a própria senha', async () => {
  const { a, b, code, tokenA } = await startRoom();
  await playUntilReady(a, b);
  a.close();
  const gb = await b.nextState((g) => g.opponent.connected === false);
  assert.ok(gb.opponent.reconnectIn > 0);

  const a2 = client(); await a2.open;
  a2.send({ t: 'resume', code, token: tokenA });
  const g = await a2.nextState((s) => s.phase === 'playing');
  assert.equal(g.you.secret, SECRET_A);
  await b.nextState((s) => s.opponent.connected === true);

  const bad = client(); await bad.open;
  bad.send({ t: 'resume', code, token: 'token-falso' });
  assert.equal((await bad.next((m) => m.t === 'error')).code, 'SESSION_INVALID');
  [a2, b, bad].forEach((x) => x.close());
});

test('sair no meio da partida dá a vitória ao adversário (e revela a senha)', async () => {
  const { a, b } = await startRoom();
  await playUntilReady(a, b);
  a.send({ t: 'leave' });
  await a.next((m) => m.t === 'left');
  const g = await b.nextState((s) => s.phase === 'finished');
  assert.equal(g.result.youWon, true);
  assert.equal(g.result.reason, 'left');
  assert.equal(g.opponent, null);
  b.send({ t: 'rematch' });
  assert.equal((await b.nextState((s) => s.phase === 'waiting')).phase, 'waiting');
  a.close(); b.close();
});

test('spam de mensagens é limitado', async () => {
  const c = client(); await c.open;
  for (let i = 0; i < 80; i++) c.send({ t: 'ping' });
  const err = await c.next((m) => m.t === 'error' && m.code === 'RATE_LIMIT');
  assert.equal(err.code, 'RATE_LIMIT');
  c.close();
});

test('HTTP: serve o cliente, bloqueia path traversal e envia CSP', async () => {
  const base = `http://127.0.0.1:${app.port}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const res = await fetch(`${base}/`);
  assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
  const t = await fetch(`${base}/..%2F..%2Fserver%2Fconfig.js`);
  assert.notEqual(t.status, 200);
  assert.equal((await fetch(`${base}/server/config.js`)).status, 404);
});

test('atrás de proxy: IP vem do final do X-Forwarded-For (não dá para forjar à esquerda)', async () => {
  const { default: config } = await import('../server/config.js');
  const before = config.trustProxy;
  config.trustProxy = true;
  try {
    const create = async (xff) => {
      const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { headers: { 'x-forwarded-for': xff } });
      await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
      const reply = new Promise((res) => ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'session' || m.t === 'error') res(m); }));
      ws.send(JSON.stringify({ t: 'create', nick: 'X' }));
      const m = await reply;
      ws.close();
      return m;
    };
    // mesmo "IP real" (proxy viu 203.0.113.7), cliente forja o início da lista: continua limitado
    let last;
    for (let i = 0; i < 10; i++) last = await create(`forjado-${i}, 203.0.113.7`);
    assert.equal(last.code, 'RATE_LIMIT');
    // outro cliente real (outro IP visto pelo proxy) não é afetado
    assert.equal((await create('198.51.100.9')).t, 'session');
  } finally {
    config.trustProxy = before;
  }
});
