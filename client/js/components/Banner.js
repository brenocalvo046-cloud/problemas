import { h } from '../utils/dom.js';

/** Faixa de aviso quando o adversário cai: mostra a contagem até o W.O. */
export function createDisconnectBanner() {
  const time = h('b');
  const el = h('div.banner', { hidden: true, role: 'status' },
    h('span.banner__pulse'), h('span.banner__txt'), time);
  let deadline = 0;
  let timer = 0;

  const tick = () => {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    time.textContent = ` ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  };

  return {
    el,
    update(game) {
      const opp = game?.opponent;
      const show = !!opp && !opp.connected && (game.phase === 'setup' || game.phase === 'playing');
      el.hidden = !show;
      if (!show) { clearInterval(timer); timer = 0; return; }
      el.querySelector('.banner__txt').textContent = game.phase === 'playing'
        ? `${opp.nick} perdeu a conexão. Vitória por W.O. em`
        : `${opp.nick} perdeu a conexão. Aguardando volta por`;
      deadline = Date.now() + (opp.reconnectIn ?? 0);
      tick();
      if (!timer) timer = setInterval(tick, 1000);
    },
    destroy() { clearInterval(timer); },
  };
}
