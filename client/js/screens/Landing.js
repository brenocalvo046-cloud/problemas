import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { createTileRow } from '../components/Tiles.js';
import { CODE_LENGTH, cleanInput } from '../utils/rules.js';

// Exemplo didático (não é partida): senha SENHASECRETA vs tentativa SEGREDOSENHA.
const DEMO = { secret: 'SENHASECRETA', guess: 'SEGREDOSENHA', marks: 'GGROORROOOOG' };

export function createLanding({ store, actions }) {
  const s0 = store.get();

  const nick = h('input.input', {
    type: 'text', maxlength: 16, placeholder: 'Seu apelido', autocomplete: 'off',
    spellcheck: 'false', 'aria-label': 'Seu apelido', value: s0.nick,
  });
  const err = h('p.form__err', { role: 'alert' });
  const code = h('input.input.input--code', {
    type: 'text', maxlength: CODE_LENGTH, placeholder: 'CÓDIGO', autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Código da sala', value: s0.joinCode,
  });
  const createBtn = h('button.btn.btn--primary.btn--xl', { type: 'button', onClick: () => submit('create') }, 'CRIAR SALA');
  const joinToggle = h('button.btn.btn--ghost.btn--xl', { type: 'button', onClick: () => togglePanel() }, 'ENTRAR EM UMA SALA');
  const goBtn = h('button.btn.btn--primary', { type: 'button', onClick: () => submit('join') }, 'ENTRAR', icon('enter', 18));
  const joinPanel = h('div.joinpanel', { class: s0.joinCode ? 'is-open' : '' },
    h('div.joinpanel__in', code, goBtn));
  const status = h('p.form__status');

  const demoRow = createTileRow({ size: 'md', label: 'Exemplo de tentativa' });
  demoRow.setValue(DEMO.guess);

  function togglePanel(force) {
    const open = force ?? !joinPanel.classList.contains('is-open');
    joinPanel.classList.toggle('is-open', open);
    joinToggle.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => code.focus(), 60);
  }

  function submit(kind) {
    const name = nick.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      err.textContent = 'Escolha um apelido para entrar no jogo.';
      nick.classList.add('is-bad');
      nick.focus();
      return;
    }
    nick.classList.remove('is-bad');
    if (kind === 'create') { err.textContent = ''; actions.createRoom(name); return; }
    const c = cleanInput(code.value);
    if (c.length !== CODE_LENGTH) {
      err.textContent = `O código da sala tem ${CODE_LENGTH} caracteres.`;
      togglePanel(true);
      return;
    }
    err.textContent = '';
    actions.joinRoom(c, name);
  }

  code.addEventListener('input', () => { code.value = cleanInput(code.value); });
  nick.addEventListener('input', () => { err.textContent = ''; nick.classList.remove('is-bad'); });
  nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(joinPanel.classList.contains('is-open') ? 'join' : 'create'); });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit('join'); });

  const legend = (cls, title, text) => h('li', h('i.sw', { class: cls }), h('div', h('b', title), h('span', text)));

  const el = h('section.view.landing',
    h('div.landing__hero',
      h('p.eyebrow', 'DUELO EM TEMPO REAL · 2 JOGADORES'),
      h('h1.logo', { 'aria-label': 'Problemas' }, [...'PROBLEMAS'].map((ch, i) => h('span', { style: { '--i': i } }, ch))),
      h('p.lead', 'Cada jogador cria uma senha secreta de 12 caracteres. Revezem as tentativas e descubra a do adversário antes que ele descubra a sua.'),
      h('div.form',
        h('label.field', h('span', 'APELIDO'), nick),
        err,
        h('div.form__btns', createBtn, joinToggle),
        joinPanel,
        status),
      h('p.fine', 'Sem cadastro · salas privadas · cada jogada é validada pelo servidor')),
    h('aside.landing__how.panel',
      h('div.panel__head', h('span', 'COMO JOGAR'), h('em', 'exemplo')),
      h('p.how__lbl', 'Tentativa de exemplo:'),
      demoRow.el,
      h('ul.legend',
        legend('g', 'VERDE', 'caractere certo na posição certa'),
        legend('o', 'LARANJA', 'existe na senha, mas em outra posição'),
        legend('r', 'VERMELHO', 'não existe na senha')),
      h('p.how__tip', 'Letras A–Z e números 0–9. Só quem acerta primeiro vence.')));

  let demoTimer = 0;
  const playDemo = () => { demoRow.setMarks(DEMO.marks, { animate: true, baseDelay: 0 }); };
  const demoStart = setTimeout(() => { playDemo(); demoTimer = setInterval(playDemo, 6500); }, 700);
  if (s0.joinCode) joinToggle.setAttribute('aria-expanded', 'true');

  return {
    el,
    update(s) {
      const off = s.conn !== 'open' || s.busy;
      createBtn.disabled = off; goBtn.disabled = off; joinToggle.disabled = s.busy;
      status.textContent = s.conn === 'open' ? '' : 'Conectando ao servidor…';
      if (s.joinCode && !code.value) code.value = s.joinCode;
    },
    destroy() { clearTimeout(demoStart); clearInterval(demoTimer); },
  };
}
