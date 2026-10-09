import { h } from '../utils/dom.js';

export function createSplash() {
  const el = h('section.view.splash',
    h('div.spinner'),
    h('p', 'Conectando à sala…'));
  return { el };
}
