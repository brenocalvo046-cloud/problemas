// Orquestração: conexão, estado global, roteamento de telas e ações.
import { createStore } from './store.js';
import { createNet } from './net.js';
import { audio } from './audio.js';
import { initScene } from './scene.js';
import { h } from './utils/dom.js';
import { icon } from './utils/icons.js';
import { CODE_LENGTH, cleanInput } from './utils/rules.js';
import { toast } from './components/Toast.js';
import { createTitleBar } from './components/TitleBar.js';
import { createSplash } from './screens/Splash.js';
import { createLanding } from './screens/Landing.js';
import { createLobby } from './screens/Lobby.js';
import { createSetup } from './screens/Setup.js';
import { createGame } from './screens/Game.js';
import { createResult } from './screens/Result.js';

const NICK_KEY = 'problemas.nick';
const SESSION_KEY = 'problemas.session';

// ── sessão (por aba) e link ?sala=CODIGO
const loadSession = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return s?.code && s?.token ? s : null;
  } catch { return null; }
};
const saveSession = (s) => {
  try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch { /* modo privado */ }
};

const urlCode = cleanInput(new URLSearchParams(location.search).get('sala') || '').slice(0, CODE_LENGTH);
let session = loadSession();
if (session && urlCode && session.code !== urlCode) { session = null; saveSession(null); }

const store = createStore({
  conn: 'connecting',
  session,
  nick: localStorage.getItem(NICK_KEY) || '',
  joinCode: session ? '' : urlCode,
  game: null,
  busy: false,
  errorTick: 0,
  ui: { view: 'result' }, // 'result' | 'room' (quando a partida acabou)
});

// ── rede
const net = createNet({
  onOpen() {
    store.set({ conn: 'open' });
    const s = store.get().session;
    if (s) net.send({ t: 'resume', code: s.code, token: s.token });
  },
  onClose() { if (store.get().conn !== 'replaced') store.set({ conn: 'closed' }); },
  onMessage(msg) {
    switch (msg.t) {
      case 'session': {
        const s = { code: msg.code, token: msg.token };
        saveSession(s);
        store.set({ session: s, busy: false, joinCode: '' });
        history.replaceState(null, '', `/?sala=${msg.code}`);
        break;
      }
      case 'state': onState(msg.game); break;
      case 'left': dropSession(); break;
      case 'replaced': net.stop(); store.set({ conn: 'replaced' }); break;
      case 'error': onError(msg); break;
      default: break;
    }
  },
});

function dropSession() {
  saveSession(null);
  history.replaceState(null, '', '/');
  store.set((s) => ({ ...s, session: null, game: null, busy: false, joinCode: '', ui: { view: 'result' } }));
}

function onError(msg) {
  audio.play('error');
  toast(msg.message || 'Algo deu errado.', { kind: 'bad' });
  if (msg.code === 'SESSION_INVALID') dropSession();
  store.set((s) => ({ ...s, busy: false, errorTick: s.errorTick + 1 }));
}

function onState(next) {
  const prev = store.get().game;
  effects(prev, next);
  store.set((s) => ({
    ...s,
    game: next,
    busy: false,
    ui: prev && prev.phase !== next.phase ? { view: 'result' } : s.ui,
  }));
}

/** Avisos e sons a partir da diferença entre dois estados. */
function effects(prev, next) {
  if (!prev) return; // primeiro estado (entrada ou reconexão): sem efeitos
  const po = prev.opponent; const no = next.opponent;
  if (!po && no) { audio.play('join'); toast(`${no.nick} entrou na sala`, { kind: 'good' }); }
  else if (po && !no) toast(`${po.nick} saiu da sala`, { kind: 'warn' });
  else if (po && no) {
    if (po.connected && !no.connected) toast(`${no.nick} perdeu a conexão`, { kind: 'warn' });
    if (!po.connected && no.connected) toast(`${no.nick} voltou`, { kind: 'good' });
    if (next.phase === 'setup' && !po.secretSet && no.secretSet) toast(`${no.nick} já definiu a senha`);
    if (next.phase === 'finished' && !po.rematch && no.rematch) toast(`${no.nick} quer jogar novamente`);
  }
  if (prev.phase === 'setup' && next.phase === 'playing') {
    toast('Partida iniciada!', { kind: 'good' });
    if (next.turn === 'you') audio.play('turn');
  } else if (prev.phase === 'playing' && next.phase === 'playing' && prev.turn !== 'you' && next.turn === 'you') {
    setTimeout(() => audio.play('turn'), 1000); // depois da revelação das cores
  }
}

// ── utilidades de ação
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback abaixo */ }
  const ta = h('textarea', { readonly: true });
  ta.style.setProperty('position', 'fixed'); ta.style.setProperty('opacity', '0');
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
  return ok;
}

const roomLink = () => `${location.origin}/?sala=${store.get().session?.code || ''}`;

function send(msg) {
  const ok = net.send(msg);
  if (!ok) { toast('Sem conexão com o servidor. Tentando reconectar…', { kind: 'warn' }); store.set({ busy: false }); }
  return ok;
}

const cleanNick = (n) => n.replace(/\s+/g, ' ').trim().slice(0, 16);

const actions = {
  createRoom(nick) {
    nick = cleanNick(nick);
    localStorage.setItem(NICK_KEY, nick);
    store.set({ nick, busy: true });
    send({ t: 'create', nick });
  },
  joinRoom(code, nick) {
    nick = cleanNick(nick);
    localStorage.setItem(NICK_KEY, nick);
    store.set({ nick, busy: true });
    send({ t: 'join', code, nick });
  },
  setSecret: (secret) => send({ t: 'setSecret', secret }),
  guess: (guess) => send({ t: 'guess', guess }),
  rematch() { send({ t: 'rematch', on: !store.get().game?.you.rematch }); },
  backToRoom: () => store.set((s) => ({ ...s, ui: { view: 'room' } })),
  backToResult: () => store.set((s) => ({ ...s, ui: { view: 'result' } })),
  async copyCode() {
    const code = store.get().session?.code;
    if (code && await copyText(code)) toast('Código copiado!', { kind: 'good', ms: 1800 });
  },
  async copyLink() {
    if (await copyText(roomLink())) toast('Link da sala copiado!', { kind: 'good', ms: 1800 });
  },
  async share() {
    try { await navigator.share({ title: 'PROBLEMAS', text: 'Venha jogar PROBLEMAS comigo!', url: roomLink() }); } catch { /* cancelado */ }
  },
  confirmLeave() {
    const playing = store.get().game?.phase === 'playing';
    openDialog({
      title: 'Sair da sala?',
      text: playing ? 'A partida está em andamento. Se você sair, perde por W.O.' : 'Você volta para a tela inicial.',
      buttons: [
        { label: 'CONTINUAR', kind: 'ghost' },
        { label: 'SAIR', kind: 'danger', onClick: () => { send({ t: 'leave' }); } },
      ],
    });
  },
};

// ── diálogos (sobre a tela do notebook)
const overlay = document.getElementById('overlay');
function closeDialog() { overlay.replaceChildren(); overlay.classList.remove('is-open'); }
function openDialog({ title, text, buttons }) {
  const dlg = h('div.dialog', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
    h('h3', title), h('p', text),
    h('div.dialog__btns', buttons.map((b) => h('button.btn', {
      type: 'button', class: `btn--${b.kind === 'danger' ? 'danger' : 'ghost'}`,
      onClick: () => { closeDialog(); b.onClick?.(); },
    }, b.label))));
  overlay.replaceChildren(h('div.dialog__backdrop', dlg));
  overlay.classList.add('is-open');
  dlg.querySelector('button')?.focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeDialog(); });

// ── roteador de telas
const viewport = document.getElementById('viewport');
const ctx = { store, actions, audio, toast };
const FACTORIES = {
  splash: createSplash, landing: createLanding, lobby: createLobby,
  setup: createSetup, game: createGame, result: createResult,
};
// Pausas para o jogador ver o que aconteceu antes de trocar de tela.
const HOLD = { 'lobby>setup': 1900, 'game>result': 1800 };

let current = { name: null, inst: null };
let holdTimer = 0;
let holdTarget = null;

function targetScreen(s) {
  const g = s.game;
  if (!g) return s.session ? 'splash' : 'landing';
  switch (g.phase) {
    case 'waiting': return 'lobby';
    case 'setup': return 'setup';
    case 'playing': return 'game';
    case 'finished': return s.ui.view === 'room' || !g.result ? 'lobby' : 'result';
    default: return 'landing';
  }
}

function mount(name) {
  current.inst?.destroy?.();
  const inst = FACTORIES[name](ctx);
  inst.el.classList.add('view-enter');
  viewport.replaceChildren(inst.el);
  current = { name, inst };
  viewport.scrollTop = 0;
}

function route(s) {
  const target = targetScreen(s);
  if (target !== current.name) {
    const delay = HOLD[`${current.name}>${target}`];
    if (delay) {
      if (holdTarget !== target) {
        holdTarget = target;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          holdTarget = null;
          const t = targetScreen(store.get());
          if (t !== current.name) { mount(t); current.inst.update?.(store.get()); }
        }, delay);
      }
    } else {
      clearTimeout(holdTimer); holdTarget = null;
      mount(target);
    }
  } else {
    clearTimeout(holdTimer); holdTarget = null;
  }
  current.inst?.update?.(s);
}

// ── sessão aberta em outro lugar
function paintReplaced(s) {
  if (s.conn !== 'replaced') { if (overlay.dataset.kind === 'replaced') { closeDialog(); delete overlay.dataset.kind; } return; }
  overlay.dataset.kind = 'replaced';
  overlay.replaceChildren(h('div.dialog__backdrop', h('div.dialog',
    h('h3', 'Sessão aberta em outro lugar'),
    h('p', 'Esta sala foi aberta em outra aba ou dispositivo. Só uma conexão por jogador é permitida.'),
    h('div.dialog__btns', h('button.btn.btn--primary', {
      type: 'button',
      onClick: () => { closeDialog(); delete overlay.dataset.kind; store.set({ conn: 'connecting' }); net.resume(); },
    }, icon('replay', 18), 'USAR ESTA ABA')))));
  overlay.classList.add('is-open');
}

const titlebar = createTitleBar({ store, audio, actions, toast });
store.subscribe((s) => { titlebar.update(s); route(s); paintReplaced(s); });
titlebar.update(store.get());
route(store.get());

initScene(document.getElementById('city'));
net.connect();
