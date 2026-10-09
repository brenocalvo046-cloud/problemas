// Mini helper para criar DOM sem framework.
//   h('div.card#id', { class:'x', onClick: fn, style:{'--i':1} }, 'texto', outroNo)
export function h(spec, props = null, ...children) {
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  const [, tag = '', rest = ''] = /^([\w-]*)(.*)$/.exec(spec);
  const el = document.createElement(tag || 'div');
  for (const part of rest.match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv); // CSSOM: permitido pela CSP
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

export function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function restartAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // força reflow para reiniciar a animação
  el.classList.add(cls);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Depois de um clique de mouse/toque, tira o foco do botão. Assim o Enter do teclado
 * físico continua valendo para o jogo (e não "re-clica" o último botão tocado).
 * Quem navega por Tab (click com detail 0) mantém o foco normalmente.
 */
export function blurAfterPointerClick(root) {
  root.addEventListener('click', (e) => {
    if (e.detail > 0) e.target.closest?.('button')?.blur();
  });
}
