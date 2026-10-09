import { h } from '../utils/dom.js';

const host = () => document.getElementById('toasts');

/** Aviso temporário. kind: info | good | warn | bad */
export function toast(message, { kind = 'info', ms = 3200 } = {}) {
  const root = host();
  if (!root) return;
  while (root.children.length >= 3) root.firstChild.remove();
  const el = h('div.toast', { class: `toast--${kind}` }, h('span.toast__dot'), h('span', message));
  root.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }, ms);
}
