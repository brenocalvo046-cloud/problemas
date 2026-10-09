import { h, blurAfterPointerClick } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { createTileRow } from '../components/Tiles.js';
import { createKeyboard } from '../components/Keyboard.js';
import { createDisconnectBanner } from '../components/Banner.js';
import { PASSWORD_LENGTH, isAlnum, cleanInput, randomPassword } from '../utils/rules.js';

/** Cada jogador cria a própria senha secreta (12 caracteres, A-Z e 0-9). */
export function createSetup({ store, actions, audio, toast }) {
  const g0 = store.get().game;
  const st = {
    typed: g0.you.secret || '',
    locked: !!g0.you.secretSet,
    masked: !!g0.you.secretSet,
    pending: false,
    lastErr: store.get().errorTick,
    msgTimer: 0,
  };

  const slots = createTileRow({ size: 'xl', label: 'Sua senha secreta' });
  const count = h('span.setup__count');
  const msg = h('p.setup__msg', { role: 'status' });
  const title = h('h2.setup__title');
  const sub = h('p.setup__sub');
  const oppChip = h('div.chip.chip--status', h('i'), h('span'));
  const banner = createDisconnectBanner();

  const kb = createKeyboard({ enterLabel: 'OK', onKey: handleKey });
  const eyeBtn = h('button.iconbtn', { type: 'button', onClick: () => { st.masked = !st.masked; paint(); } });
  const diceBtn = h('button.btn.btn--ghost', { type: 'button', onClick: () => { st.typed = randomPassword(); audio.play('key'); paint(); } }, icon('dice'), 'ALEATÓRIA');
  const confirmBtn = h('button.btn.btn--primary.btn--xl', { type: 'button', onClick: confirm }, icon('lock', 20), 'CONFIRMAR SENHA');

  const el = h('section.view.setup',
    h('div.setup__top', oppChip, banner.el),
    h('div.setup__card.panel',
      title, sub,
      h('div.setup__slots', slots.el, h('div.setup__meta', count, eyeBtn)),
      msg,
      h('div.setup__kb', kb.el),
      h('div.setup__actions', diceBtn, confirmBtn)));

  blurAfterPointerClick(el);

  function flash(text, bad = true) {
    msg.textContent = text;
    msg.classList.toggle('is-bad', bad);
    clearTimeout(st.msgTimer);
    st.msgTimer = setTimeout(paint, 1800);
  }

  function handleKey(k) {
    if (st.locked || st.pending) return;
    if (k === 'BACK') { st.typed = st.typed.slice(0, -1); audio.play('back'); }
    else if (k === 'ENTER') { confirm(); return; }
    else if (st.typed.length < PASSWORD_LENGTH) { st.typed += k; audio.play('key'); }
    paint();
  }

  function confirm() {
    if (st.locked || st.pending) return;
    if (st.typed.length !== PASSWORD_LENGTH) {
      slots.shake(); audio.play('error');
      flash(`Faltam ${PASSWORD_LENGTH - st.typed.length} caracteres para completar a senha.`);
      return;
    }
    st.pending = true;
    audio.play('send');
    actions.setSecret(st.typed);
    paint();
  }

  function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Backspace') { e.preventDefault(); kb.press('BACK'); handleKey('BACK'); }
    else if (e.key === 'Enter') { if (tag === 'BUTTON') return; // foco por Tab: o próprio botão trata o Enter
      e.preventDefault(); kb.press('ENTER'); handleKey('ENTER'); }
    else if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault();
      if (isAlnum(e.key)) { const k = e.key.toUpperCase(); kb.press(k); handleKey(k); }
      else if (!st.locked) { audio.play('error'); flash('Use apenas letras (A–Z) e números (0–9).'); }
    }
  }
  function onPaste(e) {
    if (st.locked || st.pending || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    const raw = e.clipboardData?.getData('text') || '';
    const clean = cleanInput(raw);
    st.typed = (st.typed + clean).slice(0, PASSWORD_LENGTH);
    if (clean.length !== raw.trim().length) flash('Caracteres inválidos foram ignorados.');
    paint();
  }
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('paste', onPaste);

  function paint() {
    slots.setValue(st.typed, { mask: st.masked, cursor: !st.locked });
    count.textContent = `${st.typed.length}/${PASSWORD_LENGTH}`;
    const n = st.typed.length;
    if (st.locked) { msg.textContent = 'Senha confirmada e travada. Ninguém além de você a conhece.'; msg.className = 'setup__msg is-good'; }
    else if (n === PASSWORD_LENGTH) { msg.textContent = 'Senha válida. Confirme para travar.'; msg.className = 'setup__msg is-good'; }
    else if (n === 0) { msg.textContent = 'Use letras (A–Z) e números (0–9). Exatamente 12 caracteres.'; msg.className = 'setup__msg'; }
    else { msg.textContent = `Faltam ${PASSWORD_LENGTH - n} caracteres.`; msg.className = 'setup__msg'; }

    title.textContent = st.locked ? 'SENHA TRAVADA' : 'CRIE SUA SENHA SECRETA';
    sub.textContent = st.locked ? 'Aguardando o adversário terminar…' : 'O adversário vai tentar descobri-la. Escolha algo difícil de adivinhar.';
    confirmBtn.disabled = st.locked || st.pending || n !== PASSWORD_LENGTH;
    confirmBtn.classList.toggle('is-done', st.locked);
    confirmBtn.replaceChildren(icon(st.locked ? 'check' : 'lock', 20), st.locked ? 'SENHA CONFIRMADA' : st.pending ? 'ENVIANDO…' : 'CONFIRMAR SENHA');
    diceBtn.disabled = st.locked || st.pending;
    kb.setEnabled(!st.locked && !st.pending);
    eyeBtn.replaceChildren(icon(st.masked ? 'eyeOff' : 'eye', 18));
    eyeBtn.title = st.masked ? 'Mostrar senha' : 'Ocultar senha';
    eyeBtn.setAttribute('aria-label', eyeBtn.title);
  }

  paint();

  return {
    el,
    update(s) {
      const g = s.game;
      if (!g) return;
      if (s.errorTick !== st.lastErr) { st.lastErr = s.errorTick; st.pending = false; paint(); }
      if (g.you.secretSet && !st.locked) {
        st.locked = true; st.pending = false; st.masked = true;
        if (g.you.secret) st.typed = g.you.secret;
        paint();
      }
      const opp = g.opponent;
      const chipState = !opp ? 'wait' : !opp.connected ? 'off' : opp.secretSet ? 'ready' : 'wait';
      oppChip.dataset.state = chipState;
      oppChip.querySelector('span').textContent = !opp ? 'Adversário saiu'
        : !opp.connected ? `${opp.nick} desconectado`
          : opp.secretSet ? `${opp.nick} já definiu a senha` : `${opp.nick} está criando a senha…`;
      banner.update(g);
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('paste', onPaste);
      clearTimeout(st.msgTimer);
      banner.destroy();
    },
  };
}
