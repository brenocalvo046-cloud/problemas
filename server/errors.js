// Erro "esperado" de regra de jogo. A mensagem é enviada ao cliente.
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
