import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/** Sala: código, presença dos jogadores, "aguardando jogador" e revanche. */
export function createLobby({ store, actions }) {
  const codeBox = h('div.codebox', { 'aria-label': 'Código da sala' });
  const copyCode = h('button.btn.btn--ghost', { type: 'button', onClick: () => actions.copyCode() }, icon('copy'), 'COPIAR CÓDIGO');
  const copyLink = h('button.btn.btn--ghost', { type: 'button', onClick: () => actions.copyLink() }, icon('link'), 'COPIAR LINK');
  const shareBtn = navigator.share
    ? h('button.btn.btn--ghost', { type: 'button', onClick: () => actions.share() }, icon('share'), 'COMPARTILHAR')
    : null;

  const youName = h('b'); const oppName = h('b');
  const youCard = h('div.seat.seat--you',
    h('div.seat__avatar', icon('check', 22)),
    h('div.seat__txt', h('small', 'VOCÊ'), youName, h('span.seat__st', h('i'), 'online')));
  const oppCard = h('div.seat.seat--opp');
  const status = h('p.lobby__status', { role: 'status' });
  const primary = h('button.btn.btn--primary.btn--xl', { type: 'button', onClick: () => actions.rematch() });
  const resultBtn = h('button.btn.btn--ghost', { type: 'button', onClick: () => actions.backToResult() }, 'VER RESULTADO');
  const leaveBtn = h('button.btn.btn--ghost.btn--danger', { type: 'button', onClick: () => actions.confirmLeave() }, icon('exit'), 'SAIR DA SALA');
  const actionsRow = h('div.lobby__actions');

  const el = h('section.view.lobby',
    h('div.lobby__card.panel',
      h('p.eyebrow', 'SALA PRIVADA'),
      codeBox,
      h('div.lobby__share', copyCode, copyLink, shareBtn),
      h('div.seats', youCard, h('span.vs', 'VS'), oppCard),
      status,
      actionsRow));

  let codeShown = '';
  let oppShown = null;

  return {
    el,
    update(s) {
      const g = s.game;
      if (!g) return;
      if (g.code !== codeShown) {
        codeShown = g.code;
        codeBox.replaceChildren(...[...g.code].map((ch, i) => h('span.codebox__ch', { style: { '--i': i } }, ch)));
      }
      youName.textContent = g.you.nick;

      const opp = g.opponent;
      const key = opp ? `${opp.nick}|${opp.connected}` : 'empty';
      if (key !== oppShown) {
        const joined = oppShown === 'empty' && opp;
        oppShown = key;
        oppName.textContent = opp?.nick || '';
        oppCard.className = `seat seat--opp ${opp ? 'is-filled' : 'is-empty'} ${joined ? 'is-joining' : ''}`;
        oppCard.replaceChildren(opp
          ? h('div.seat__avatar', icon('check', 22))
          : h('div.seat__avatar', h('span.radar')),
        h('div.seat__txt',
          h('small', 'ADVERSÁRIO'),
          opp ? h('b', opp.nick) : h('b.dim', 'Aguardando jogador…'),
          opp ? h('span.seat__st', { class: opp.connected ? '' : 'is-off' }, h('i'), opp.connected ? 'online' : 'desconectado')
            : h('span.seat__st.is-wait', h('i'), 'compartilhe o código')));
      }

      actionsRow.replaceChildren();
      status.classList.toggle('is-good', g.phase === 'setup');
      if (g.phase === 'waiting') {
        status.textContent = 'Envie o código ou o link para um amigo. A partida começa assim que ele entrar.';
      } else if (g.phase === 'setup') {
        status.textContent = `${opp?.nick || 'Adversário'} entrou! Preparando a partida…`;
      } else if (g.phase === 'finished') {
        if (!opp) status.textContent = 'O adversário saiu. Você pode abrir a sala para outro jogador.';
        else if (g.you.rematch) status.textContent = `Aguardando ${opp.nick} aceitar a revanche…`;
        else if (opp.rematch) status.textContent = `${opp.nick} quer jogar novamente!`;
        else status.textContent = 'Partida encerrada. Jogue de novo na mesma sala.';
        primary.replaceChildren(icon('replay', 20), g.you.rematch ? 'CANCELAR REVANCHE' : opp ? 'JOGAR NOVAMENTE' : 'ABRIR SALA');
        primary.classList.toggle('is-waiting', g.you.rematch);
        actionsRow.append(primary, resultBtn);
      }
      actionsRow.append(leaveBtn);
    },
  };
}
