import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/** Barra de título estilo janela de sistema: marca, sala, som e sair. */
export function createTitleBar({ store, audio, actions, toast }) {
  const root = document.getElementById('titlebar');

  const conn = h('span.conn', { title: 'Conexão com o servidor' }, h('i'), h('span.conn__txt'));
  const codeBtn = h('button.chip.chip--code', {
    type: 'button', title: 'Copiar código da sala',
    onClick: () => actions.copyCode(),
  });
  const soundBtn = h('button.iconbtn', {
    type: 'button',
    onClick: () => { audio.setEnabled(!audio.enabled); paintSound(); },
  });
  const leaveBtn = h('button.iconbtn.iconbtn--danger', {
    type: 'button', title: 'Sair da sala', 'aria-label': 'Sair da sala',
    onClick: () => actions.confirmLeave(),
  }, icon('exit', 18));

  function paintSound() {
    soundBtn.replaceChildren(icon(audio.enabled ? 'soundOn' : 'soundOff', 18));
    soundBtn.title = audio.enabled ? 'Desativar sons' : 'Ativar sons';
    soundBtn.setAttribute('aria-label', soundBtn.title);
    soundBtn.setAttribute('aria-pressed', String(audio.enabled));
  }

  root.append(
    h('div.titlebar__dots', h('i'), h('i'), h('i')),
    h('div.titlebar__brand', h('b', 'PROBLEMAS'), h('span', '// terminal')),
    h('div.titlebar__right', conn, codeBtn, soundBtn, leaveBtn),
  );
  paintSound();

  function update(s) {
    const code = s.session?.code;
    codeBtn.hidden = !code;
    leaveBtn.hidden = !code;
    if (code) codeBtn.replaceChildren(h('span', 'SALA'), h('b', code), icon('copy', 14));
    const online = s.conn === 'open';
    conn.dataset.state = online ? 'on' : s.conn === 'replaced' ? 'off' : 'wait';
    conn.querySelector('.conn__txt').textContent = online ? 'online' : s.conn === 'replaced' ? 'em outra aba' : 'reconectando…';
  }

  return { update };
}
