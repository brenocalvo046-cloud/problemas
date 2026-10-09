import crypto from 'node:crypto';
import config from './config.js';
import { CODE_ALPHABET } from './rules.js';
import { Room } from './Room.js';
import { GameError } from './errors.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref?.();
  }

  #newCode() {
    for (let tries = 0; tries < 50; tries++) {
      let code = '';
      for (let i = 0; i < config.codeLength; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new GameError('SERVER_BUSY', 'Não foi possível criar a sala agora.');
  }

  create() {
    if (this.rooms.size >= config.maxRooms) throw new GameError('SERVER_BUSY', 'Servidor lotado. Tente novamente em instantes.');
    const code = this.#newCode();
    const room = new Room(code, { onClose: (c) => this.rooms.delete(c) });
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get(code) || null; }

  sweep(now = Date.now()) {
    for (const room of [...this.rooms.values()]) if (room.isIdle(now)) room.close();
  }

  close() {
    clearInterval(this.sweeper);
    for (const room of [...this.rooms.values()]) room.close();
  }
}
