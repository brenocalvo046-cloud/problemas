// Limitadores simples em memória (suficientes para 1 instância).

/** Janela deslizante por chave (ex.: IP). */
export class SlidingWindow {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }
  #prune(key, now) {
    const list = this.hits.get(key);
    if (!list) return [];
    const fresh = list.filter((t) => now - t < this.windowMs);
    if (fresh.length) this.hits.set(key, fresh);
    else this.hits.delete(key);
    return fresh;
  }
  /** Ainda há "crédito" para esta chave? (não registra) */
  check(key, now = Date.now()) {
    return this.#prune(key, now).length < this.limit;
  }
  /** Registra uma ocorrência. Retorna false se passou do limite. */
  hit(key, now = Date.now()) {
    const list = this.#prune(key, now);
    if (list.length >= this.limit) return false;
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
  sweep(now = Date.now()) {
    for (const key of [...this.hits.keys()]) this.#prune(key, now);
  }
}

/** Balde de fichas para limitar mensagens por conexão. */
export class TokenBucket {
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.last = Date.now();
  }
  take(now = Date.now()) {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
