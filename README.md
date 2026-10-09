# PROBLEMAS

Duelo multiplayer em tempo real: cada jogador cria uma **senha secreta de 12 caracteres** (A–Z e 0–9) e, em turnos, tenta descobrir a do adversário. A cada tentativa o servidor devolve uma cor por caractere:

| Cor | Significado |
|---|---|
| 🟩 verde | caractere certo na posição certa |
| 🟧 laranja | existe na senha, mas em outra posição |
| 🟥 vermelho | não existe na senha |

Repetições seguem a regra do Wordle: cada caractere da senha só "paga" uma vez (se a senha tem um `A`, só um `A` da tentativa pode ficar verde/laranja).

## Rodar localmente

```bash
npm install
npm start          # http://localhost:3000
npm test           # 16 testes (regras + servidor real com WebSocket)
```

Requer Node 18+. Para testar de verdade, abra o jogo em **duas abas/navegadores/dispositivos**: crie a sala em um e entre com o código (ou o link `?sala=CODIGO`) no outro. Cada aba mantém a própria sessão, então duas abas do mesmo navegador funcionam como dois jogadores.

## Estrutura

```
server/                    backend multiplayer (Node + ws), sem banco de dados
  index.js                 HTTP estático + cabeçalhos de segurança (CSP) + /healthz
  GameServer.js            WebSocket: validação de mensagens, rate limit, reconexão
  Room.js                  máquina de estados da sala (TODA a lógica e os segredos)
  RoomManager.js           códigos únicos, limpeza de salas ociosas
  rules.js                 regras puras (normalizar, avaliar cores, estatísticas)
  rateLimiter.js, config.js, errors.js
client/                    frontend (JS modular, sem build)
  index.html, css/         cenário + notebook, componentes, telas
  js/main.js               conexão, roteador de telas, ações
  js/store.js              estado centralizado
  js/screens/              Landing, Lobby, Setup, Game, Result
  js/components/           Keyboard, Tiles, TitleBar, Toast, Banner
  js/audio.js, fx.js, scene.js   sons (WebAudio), confete, cidade na janela
test/                      testes automatizados
```

O estado das partidas vive **em memória**: salas são efêmeras, então não há banco de dados (nada que precise persistir).

## Segurança (o que o servidor garante)

- A senha de cada jogador fica **só na memória do servidor**. O cliente do adversário nunca a recebe; ela só é revelada a ambos quando a partida termina. Há um teste que inspeciona todo byte recebido para provar isso.
- A comparação tentativa × senha acontece **somente no servidor**. Turno, fase, sala, jogador e formato da tentativa/senha são revalidados a cada mensagem; o cliente não consegue pular turno, trocar a senha depois de confirmada nem forjar resultado.
- Anti-spam: limite de mensagens por conexão, intervalo mínimo entre tentativas, limite de salas criadas/entradas por IP, bloqueio temporário após muitos códigos errados (anti força-bruta) e limite de conexões por IP. Mensagens são limitadas a 2 KB.
- Verificação de `Origin` no WebSocket (mesmo host, ou a lista `ALLOWED_ORIGINS`), CSP restritiva (`script-src 'self'`, sem estilos inline), proteção contra path traversal.
- Sessão por token aleatório (144 bits), guardado só na aba do jogador. Reconexão automática; quem cai tem 2 min para voltar antes de perder por W.O.

## Deploy

O jogo precisa de um servidor Node **com conexões WebSocket persistentes**. Serve Render, Railway, Fly.io, um VPS ou Docker. **Não funciona em hospedagens serverless/estáticas** (Vercel, Netlify, GitHub Pages).

- **Render:** *New → Blueprint* apontando para o repositório (usa o `render.yaml`).
- **Docker:** `docker build -t problemas . && docker run -p 3000:3000 problemas`
- **Qualquer PaaS:** build `npm install --omit=dev`, start `npm start`, health check `/healthz`.

> ⚠️ **Atrás de proxy (praticamente toda hospedagem), defina `TRUST_PROXY=1`.** Sem isso todos os jogadores parecem ter o mesmo IP e os limites anti-spam passam a valer para todos juntos. O `Dockerfile` e o `render.yaml` já definem isso. Se houver mais de um proxy (ex.: Cloudflare + hospedagem), ajuste `PROXY_HOPS`.

| Variável | Padrão | Função |
|---|---|---|
| `PORT` | 3000 | porta HTTP/WebSocket |
| `TRUST_PROXY` | 0 | lê o IP real de `X-Forwarded-For` |
| `PROXY_HOPS` | 1 | nº de proxies confiáveis à frente |
| `ALLOWED_ORIGINS` | (mesmo host) | origens extras permitidas no WebSocket |
| `RECONNECT_GRACE_MS` | 120000 | tempo para o jogador reconectar antes do W.O. |
| `WAITING_GRACE_MS` | 900000 | tempo que o criador pode ficar fora da sala vazia |
| `MAX_ROOMS`, `MAX_CONNECTIONS_PER_IP` | 5000, 20 | limites de capacidade |

## Limitações conhecidas

- **Uma instância só.** As salas estão na memória do processo; para escalar horizontalmente seria preciso mover o estado para Redis e usar afinidade de sessão. Reiniciar o servidor encerra as partidas em andamento.
- Sem contas/ranking: só apelido. É fácil acrescentar um banco depois (ex.: placar), pois a lógica está isolada em `Room.js`.
- Sem fontes ou imagens externas (tudo é CSS/canvas/WebAudio), então funciona offline na rede local. Se quiser uma fonte própria para o título, adicione-a em `client/css/base.css` (`--font`).
