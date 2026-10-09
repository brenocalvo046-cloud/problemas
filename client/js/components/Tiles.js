import { h } from '../utils/dom.js';
import { countMarks } from '../utils/rules.js';

/** Fileira de 12 blocos. Serve para digitar (senha/tentativa) e para exibir resultados. */
export function createTileRow({ size = 'lg', length = 12, label = '' } = {}) {
  const tiles = Array.from({ length }, (_, i) =>
    h('div.tile', { style: { '--i': i } }, h('span.tile__ch')));
  const el = h(`div.tilerow.tilerow--${size}`, { role: 'group', 'aria-label': label }, tiles);
  let value = '';

  return {
    el,
    tiles,
    setValue(next = '', { mask = false, cursor = false } = {}) {
      next = next.toUpperCase();
      tiles.forEach((t, i) => {
        const ch = next[i] || '';
        const had = !!value[i];
        t.firstChild.textContent = ch ? (mask ? '•' : ch) : '';
        t.classList.toggle('is-filled', !!ch);
        t.classList.toggle('is-cursor', cursor && i === next.length && next.length < length);
        if (ch && !had) {
          t.classList.remove('pop');
          void t.offsetWidth;
          t.classList.add('pop');
        }
      });
      value = next;
    },
    setMarks(marks, { animate = false, baseDelay = 0 } = {}) {
      tiles.forEach((t, i) => {
        t.dataset.mark = marks[i];
        t.classList.remove('is-flip', 'is-marked', 'is-cursor');
        if (animate) {
          t.style.setProperty('--base', `${baseDelay}ms`);
          void t.offsetWidth;
          t.classList.add('is-flip');
        } else t.classList.add('is-marked');
      });
    },
    shake() {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    },
  };
}

/** Linha do histórico: nº da tentativa + 12 blocos coloridos + resumo. */
export function createGuessRow({ guess, marks, n, size = 'lg', animate = false }) {
  const row = createTileRow({ size, label: `Tentativa ${n}` });
  row.setValue(guess);
  row.setMarks(marks, { animate });
  const g = countMarks(marks, 'G');
  const o = countMarks(marks, 'O');
  const el = h('div.grow', { class: animate ? 'is-new' : '' },
    h('span.grow__n', String(n).padStart(2, '0')),
    row.el,
    h('span.grow__score', h('b.g', { class: g ? '' : 'is-zero' }, g), h('b.o', { class: o ? '' : 'is-zero' }, o)));
  return { el, row };
}
