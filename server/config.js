// Configuração central. Tudo pode ser ajustado por variáveis de ambiente.
const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const config = {
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  // Atrás de proxy/CDN (Render, Railway, Fly, Nginx…) use TRUST_PROXY=1
  // para enxergar o IP real do jogador (X-Forwarded-For).
  trustProxy: process.env.TRUST_PROXY === '1',
  // Quantos proxies confiáveis existem à frente do servidor (1 = só o da hospedagem).
  proxyHops: int(process.env.PROXY_HOPS, 1),

  // Lista separada por vírgula (ex.: https://problemas.exemplo.com).
  // Vazio = aceita apenas conexões do mesmo host da página.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  passwordLength: 12,
  codeLength: 6,
  maxNickLength: 16,

  maxConnectionsPerIp: int(process.env.MAX_CONNECTIONS_PER_IP, 20),
  maxRooms: int(process.env.MAX_ROOMS, 5000),

  // Tempo que um jogador desconectado tem para voltar antes de perder por W.O.
  graceMs: int(process.env.RECONNECT_GRACE_MS, 120_000),
  // Na fase "aguardando jogador" o criador pode sair para compartilhar o link.
  waitingGraceMs: int(process.env.WAITING_GRACE_MS, 900_000),
  idleRoomMs: int(process.env.IDLE_ROOM_MS, 600_000),

  minGuessIntervalMs: 250,
  heartbeatMs: 25_000,
};

export default config;
