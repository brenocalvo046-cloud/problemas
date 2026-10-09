import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

const ROWS = [
  [...'1234567890'],
  [...'QWERTYUIOP'],
  [...'ASDFGHJKL'],
  ['ENTER', ...'ZXCVBNM', 'BACK'],
];

/** Teclado virtual 0-9 / A-Z com estado por tecla (verde/laranja/vermelho). */
export function createKeyboard({ onKey, enterLabel = 'ENTER' } = {}) {
  const keys = new Map();

  const makeKey = (k) => {
    const wide = k === 'ENTER' || k === 'BACK';
    const content = k === 'BACK' ? icon('backspace', 20) : k === 'ENTER' ? h('span.key__enter', icon('enter', 16), enterLabel) : k;
    const btn = h('button.key', {
      type: 'button',
      'data-key': k,
      class: wide ? 'key--wide' : '',
      'aria-label': k === 'BACK' ? 'Apagar' : k === 'ENTER' ? enterLabel : k,
    }, content);
    keys.set(k, btn);
    return btn;
  };

  const el = h('div.kb', { role: 'group', 'aria-label': 'Teclado virtual' },
    ROWS.map((row, i) => h(`div.kb__row.kb__row--${i}`, row.map(makeKey))));

  let enabled = true;
  let lastPointer = { key: '', at: 0 };
  const fire = (k) => { if (enabled) onKey?.(k); };

  // pointerdown = resposta imediata ao toque/clique.
  // click sem pointerdown recente = acionamento por teclado (Tab + Enter/Espaço).
  // (Não dá para confiar em event.detail: navegadores diferem. Por isso a deduplicação por tempo.)
  el.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.key');
    if (!btn || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // não rouba o foco do documento
    btn.classList.add('is-down');
    lastPointer = { key: btn.dataset.key, at: performance.now() };
    fire(btn.dataset.key);
  });
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    const dup = lastPointer.key === btn.dataset.key && performance.now() - lastPointer.at < 700;
    if (!dup) fire(btn.dataset.key);
  });
  const release = (e) => e.target.closest?.('.key')?.classList.remove('is-down');
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release, true);
  el.addEventListener('pointercancel', release);

  return {
    el,
    setEnabled(v) { enabled = v; el.classList.toggle('is-disabled', !v); },
    setStatuses(map = {}) {
      for (const [k, btn] of keys) {
        if (map[k]) btn.dataset.status = map[k];
        else delete btn.dataset.status;
      }
    },
    /** Animação para teclas digitadas no teclado físico. */
    press(k) {
      const btn = keys.get(k);
      if (!btn) return;
      btn.classList.add('is-down');
      setTimeout(() => btn.classList.remove('is-down'), 110);
    },
  };
}
