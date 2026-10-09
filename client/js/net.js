// Cliente WebSocket com reconexão automática (backoff) e heartbeat.
export function createNet({ onOpen, onClose, onMessage }) {
  let ws = null;
  let tries = 0;
  let retryTimer = null;
  let pingTimer = null;
  let stopped = false;

  const url = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;

  function connect() {
    clearTimeout(retryTimer);
    if (stopped || (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))) return;
    ws = new WebSocket(url());
    ws.onopen = () => {
      tries = 0;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ t: 'ping' }), 20_000);
      onOpen();
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      onMessage(msg);
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      ws = null;
      onClose();
      if (stopped) return;
      const delay = Math.min(8000, 400 * 2 ** tries++) + Math.random() * 300;
      retryTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => {};
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  // Ao voltar para a aba / voltar a rede, reconecta na hora.
  const wake = () => { if (!stopped && (!ws || ws.readyState === WebSocket.CLOSED)) { tries = 0; connect(); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  window.addEventListener('online', wake);

  return {
    connect,
    send,
    stop() { stopped = true; clearTimeout(retryTimer); ws?.close(); },
    resume() { stopped = false; tries = 0; connect(); },
  };
}
