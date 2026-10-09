// Máquina de estados de uma sala. Toda a lógica (e todos os segredos) vivem aqui,
// no servidor. A camada de rede só chama estes métodos e entrega os "views".
import crypto from 'node:crypto';
import config from './config.js';
import { GameError } from './errors.js';
import { evaluate, normalizeSecret, tally, PASSWORD_LENGTH } from './rules.js';

const newToken = () => crypto.randomBytes(18).toString('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Fases: waiting → setup → playing → finished → (setup | waiting)
 */
export class Room {
  constructor(code, { onClose } = {}) {
    this.code = code;
    this.onClose = onClose;
    this.phase = 'waiting';
    this.players = [null, null];
    this.turn = null; // slot (0|1) de quem joga
    this.result = null;
    this.round = 0;
    this.closed = false;
    this.lastActivity = Date.now();
  }

  // ───────────── utilidades
  touch() { this.lastActivity = Date.now(); }
  other(p) { return this.players[1 - p.slot]; }
  get present() { return this.players.filter(Boolean); }

  findByToken(token) {
    if (typeof token !== 'string' || token.length > 64) return null;
    return this.players.find((p) => p && safeEqual(p.token, token)) || null;
  }

  isIdle(now = Date.now()) {
    if (!this.present.length) return true;
    if (this.present.some((p) => p.connected)) return false;
    const limit = this.phase === 'waiting' ? config.waitingGraceMs : config.idleRoomMs;
    return now - this.lastActivity > limit + 5_000;
  }

  // ───────────── membros
  addPlayer(nick) {
    const slot = this.players.indexOf(null);
    if (slot === -1) throw new GameError('ROOM_FULL', 'Esta sala já está cheia.');
    if (this.phase !== 'waiting') throw new GameError('ROOM_BUSY', 'A sala não está aceitando jogadores agora.');
    const p = {
      slot, token: newToken(), nick,
      conn: null, connected: false,
      secret: null, guesses: [], rematch: false,
      graceTimer: null, graceUntil: 0, lastGuessAt: 0,
    };
    this.players[slot] = p;
    this.touch();
    if (!this.players.includes(null)) this.#startSetup();
    return p;
  }

  attach(p, conn) {
    if (p.conn && p.conn !== conn) p.conn.replaced?.();
    p.conn = conn;
    p.connected = true;
    this.#clearGrace(p);
    this.touch();
  }

  detach(p, conn) {
    if (p.conn !== conn) return;
    p.conn = null;
    p.connected = false;
    const ms = this.phase === 'waiting' ? config.waitingGraceMs : config.graceMs;
    p.graceUntil = Date.now() + ms;
    p.graceTimer = setTimeout(() => this.#expire(p), ms);
    p.graceTimer.unref?.();
    this.touch();
    this.broadcast();
  }

  leave(p) {
    if (this.closed || this.players[p.slot] !== p) return;
    this.#clearGrace(p);
    const opp = this.other(p);
    if (this.phase === 'playing' && opp) this.#finish(opp.slot, 'left');
    this.players[p.slot] = null;
    p.conn = null;
    if (this.phase === 'setup') this.#resetToWaiting();
    if (this.phase === 'finished' && opp) opp.rematch = false;
    this.touch();
    if (!this.present.length) return this.close();
    this.broadcast();
  }

  #expire(p) {
    p.graceTimer = null;
    if (this.closed || this.players[p.slot] !== p) return;
    const opp = this.other(p);
    if (this.phase === 'playing' && opp) {
      p.graceUntil = 0;
      this.#finish(opp.slot, 'disconnect'); // W.O.
      this.broadcast();
    } else {
      this.leave(p);
    }
  }

  #clearGrace(p) {
    if (p.graceTimer) clearTimeout(p.graceTimer);
    p.graceTimer = null;
    p.graceUntil = 0;
  }

  // ───────────── ações de jogo
  setSecret(p, raw) {
    if (this.phase !== 'setup') throw new GameError('BAD_PHASE', 'Agora não é possível definir a senha.');
    if (p.secret) throw new GameError('ALREADY_SET', 'Você já confirmou a sua senha.');
    const secret = normalizeSecret(raw);
    if (!secret) {
      throw new GameError('INVALID_PASSWORD', `A senha precisa ter exatamente ${PASSWORD_LENGTH} caracteres (apenas letras e números).`);
    }
    p.secret = secret;
    this.touch();
    const opp = this.other(p);
    if (opp?.secret) this.#startPlaying();
    this.broadcast();
  }

  guess(p, raw) {
    if (this.phase !== 'playing') throw new GameError('BAD_PHASE', 'A partida não está em andamento.');
    if (this.turn !== p.slot) throw new GameError('NOT_YOUR_TURN', 'Ainda não é a sua vez.');
    const now = Date.now();
    if (now - p.lastGuessAt < config.minGuessIntervalMs) throw new GameError('TOO_FAST', 'Calma! Tentativas rápidas demais.');
    const guess = normalizeSecret(raw);
    if (!guess) throw new GameError('INVALID_GUESS', `A tentativa precisa ter exatamente ${PASSWORD_LENGTH} caracteres (letras e números).`);
    const opp = this.other(p);
    if (!opp?.secret) throw new GameError('BAD_PHASE', 'Adversário indisponível.');

    p.lastGuessAt = now;
    const marks = evaluate(guess, opp.secret); // a comparação só acontece aqui, no servidor
    p.guesses.push({ guess, marks });
    if (guess === opp.secret) this.#finish(p.slot, 'guessed');
    else this.turn = opp.slot;
    this.touch();
    this.broadcast();
  }

  rematch(p, on = true) {
    if (this.phase !== 'finished') throw new GameError('BAD_PHASE', 'A partida ainda não terminou.');
    const opp = this.other(p);
    if (!opp) { // adversário já saiu: volta a aguardar alguém entrar
      this.#resetToWaiting();
      this.broadcast();
      return;
    }
    p.rematch = on !== false;
    if (p.rematch && opp.rematch) this.#startSetup();
    this.touch();
    this.broadcast();
  }

  // ───────────── transições
  #resetGame() {
    this.turn = null;
    this.result = null;
    for (const p of this.present) {
      p.secret = null; p.guesses = []; p.rematch = false; p.lastGuessAt = 0;
    }
  }
  #startSetup() { this.#resetGame(); this.phase = 'setup'; this.round += 1; }
  #resetToWaiting() { this.#resetGame(); this.phase = 'waiting'; }
  #startPlaying() { this.phase = 'playing'; this.turn = crypto.randomInt(0, 2); }

  #finish(winnerSlot, reason) {
    this.phase = 'finished';
    this.turn = null;
    this.result = {
      winner: winnerSlot,
      reason, // guessed | left | disconnect
      secrets: this.players.map((p) => p?.secret ?? null),
      stats: this.players.map((p) => (p ? tally(p.guesses) : null)),
      nicks: this.players.map((p) => p?.nick ?? null),
    };
    for (const p of this.present) p.rematch = false;
  }

  // ───────────── saída para os clientes
  /** Estado visível para UM jogador. A senha do adversário só sai após o fim. */
  view(me) {
    const opp = this.other(me);
    const r = this.result;
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      you: { nick: me.nick, secretSet: !!me.secret, secret: me.secret, rematch: me.rematch },
      opponent: opp ? {
        nick: opp.nick,
        connected: opp.connected,
        secretSet: !!opp.secret,
        rematch: opp.rematch,
        reconnectIn: !opp.connected && opp.graceUntil ? Math.max(0, opp.graceUntil - Date.now()) : null,
      } : null,
      turn: this.phase === 'playing' ? (this.turn === me.slot ? 'you' : 'opponent') : null,
      myGuesses: me.guesses.map(({ guess, marks }) => ({ guess, marks })),
      oppGuesses: opp ? opp.guesses.map(({ guess, marks }) => ({ guess, marks })) : [],
      result: this.phase === 'finished' && r ? {
        youWon: r.winner === me.slot,
        reason: r.reason,
        opponentNick: r.nicks[1 - me.slot],
        secrets: { you: r.secrets[me.slot], opponent: r.secrets[1 - me.slot] },
        stats: { you: r.stats[me.slot], opponent: r.stats[1 - me.slot] },
      } : null,
    };
  }

  broadcast() {
    if (this.closed) return;
    for (const p of this.present) p.conn?.send({ t: 'state', game: this.view(p) });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.players) if (p) this.#clearGrace(p);
    this.onClose?.(this.code);
  }
}
