import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { createTileRow } from '../components/Tiles.js';
import { confetti } from '../fx.js';

const REASONS = {
  guessed: (won, opp) => (won ? `Você descobriu a senha de ${opp}!` : `${opp} descobriu a sua senha.`),
  left: (won, opp) => `${opp} saiu da partida.`,
  disconnect: (won, opp) => `${opp} perdeu a conexão (vitória por W.O.).`,
};

function countUp(node, to) {
  const t0 = performance.now();
  const dur = 700;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    node.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/** Tela final: vitória/derrota, senhas reveladas e estatísticas. */
export function createResult({ store, actions, audio }) {
  const g = store.get().game;
  const r = g.result;
  const won = r.youWon;
  const oppNick = r.opponentNick || 'O adversário';

  // marca "G" = senha descoberta (verde) · "N" = apenas revelada (neutra)
  const reveal = (label, secret, discovered, delay) => {
    const row = createTileRow({ size: 'md', label });
    row.setValue(secret || '');
    if (secret) row.setMarks((discovered ? 'G' : 'N').repeat(secret.length), { animate: true, baseDelay: delay });
    return h('div.reveal', h('small', label), row.el);
  };

  const num = (v) => { const n = h('span.num', '0'); setTimeout(() => countUp(n, v), 450); return n; };
  const stat = (label, cls, a, b) => h('tr', { class: cls }, h('th', h('i.sw', { class: cls }), label), h('td', num(a)), h('td', num(b)));
  const sy = r.stats.you || { attempts: 0, green: 0, orange: 0, red: 0 };
  const so = r.stats.opponent || { attempts: 0, green: 0, orange: 0, red: 0 };

  const primary = h('button.btn.btn--primary.btn--xl', { type: 'button', onClick: () => actions.rematch() });
  const hint = h('p.result__hint', { role: 'status' });

  const el = h('section.view.result', { 'data-outcome': won ? 'win' : 'lose' },
    h('div.result__glow'),
    h('div.result__body',
      h('p.eyebrow', won ? 'MISSÃO CUMPRIDA' : 'ACESSO NEGADO'),
      h('h2.result__title', { 'data-text': won ? 'VOCÊ VENCEU' : 'VOCÊ PERDEU' }, won ? 'VOCÊ VENCEU' : 'VOCÊ PERDEU'),
      h('p.result__reason', (REASONS[r.reason] || REASONS.guessed)(won, oppNick)),
      h('div.result__cols',
        h('div.panel.result__reveal',
          h('div.panel__head', h('span', 'SENHAS REVELADAS')),
          reveal(`Senha de ${oppNick}`, r.secrets.opponent, won && r.reason === 'guessed', 200),
          reveal('Sua senha', r.secrets.you, !won && r.reason === 'guessed', 500)),
        h('div.panel.result__stats',
          h('div.panel__head', h('span', 'ESTATÍSTICAS')),
          h('table.stats',
            h('thead', h('tr', h('th'), h('th', 'VOCÊ'), h('th', oppNick.slice(0, 10)))),
            h('tbody',
              h('tr.t', h('th', h('i.sw.t'), 'Tentativas'), h('td', num(sy.attempts)), h('td', num(so.attempts))),
              stat('Verdes', 'g', sy.green, so.green),
              stat('Laranjas', 'o', sy.orange, so.orange),
              stat('Vermelhos', 'r', sy.red, so.red))))),
      h('div.result__actions',
        primary,
        h('button.btn.btn--ghost.btn--xl', { type: 'button', onClick: () => actions.backToRoom() }, icon('door', 20), 'VOLTAR À SALA')),
      hint));

  // O elemento ainda não está no DOM aqui; o canvas precisa medir o tamanho real.
  let stopFx = null;
  const fxTimer = setTimeout(() => { if (won) stopFx = confetti(el); }, 250);
  setTimeout(() => audio.play(won ? 'win' : 'lose'), 150);

  return {
    el,
    update(s) {
      const gg = s.game;
      if (!gg?.result) return;
      const opp = gg.opponent;
      primary.replaceChildren(icon('replay', 20), gg.you.rematch ? 'AGUARDANDO ADVERSÁRIO…' : opp ? 'JOGAR NOVAMENTE' : 'ABRIR SALA');
      primary.classList.toggle('is-waiting', gg.you.rematch);
      hint.textContent = !opp ? 'O adversário saiu. “Abrir sala” deixa a sala livre para outro jogador.'
        : gg.you.rematch ? `Esperando ${opp.nick} aceitar a revanche…`
          : opp.rematch ? `${opp.nick} quer jogar novamente!` : '';
    },
    destroy() { clearTimeout(fxTimer); stopFx?.(); },
  };
}
