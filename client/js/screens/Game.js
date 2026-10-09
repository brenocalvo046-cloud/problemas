import { h, blurAfterPointerClick } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { createTileRow, createGuessRow } from '../components/Tiles.js';
import { createKeyboard } from '../components/Keyboard.js';
import { createDisconnectBanner } from '../components/Banner.js';
import { PASSWORD_LENGTH, isAlnum, cleanInput, keyStatuses, countMarks } from '../utils/rules.js';

const best = (guesses) => guesses.reduce((m, { marks }) => Math.max(m, countMarks(marks, 'G')), 0);

/** Tela da partida: HUD, turnos, tentativas, painel do adversário e teclado. */
export function createGame({ store, actions, audio, toast }) {
  const st = {
    typed: '', pending: false, pendingTimer: 0, showSecret: false,
    mine: 0, opp: 0, seen: false, lastTurn: null, lastErr: store.get().errorTick,
    tab: 'mine', kbTimer: 0, hintTimer: 0,
  };

  // ── HUD
  const youName = h('b'); const youSecret = h('span.secret');
  const youStats = h('small'); const eyeBtn = h('button.iconbtn.iconbtn--sm', { type: 'button', onClick: () => { st.showSecret = !st.showSecret; paintSecret(); } });
  const youCard = h('div.pcard.pcard--you',
    h('div.pcard__top', h('span.dot'), youName),
    h('div.pcard__secret', h('small', 'SUA SENHA'), youSecret, eyeBtn),
    youStats);

  const oppName = h('b'); const oppDot = h('span.dot'); const oppStats = h('small');
  const oppCard = h('div.pcard.pcard--opp',
    h('div.pcard__top', oppDot, oppName),
    h('div.pcard__secret', h('small', 'SENHA DO ADVERSÁRIO'), h('span.secret.is-locked', icon('lock', 13), '••••••••••••')),
    oppStats);

  const turnLabel = h('div.turn__label'); const turnSub = h('div.turn__sub');
  const turn = h('div.turn', turnLabel, turnSub);
  const hud = h('div.hud', youCard, turn, oppCard);
  const banner = createDisconnectBanner();

  // ── tabuleiros
  const mineList = h('div.board__list', { role: 'log', 'aria-label': 'Suas tentativas' });
  const mineEmpty = h('p.board__empty', 'Suas tentativas aparecerão aqui.');
  const mineCount = h('em');
  const input = createTileRow({ size: 'lg', label: 'Sua tentativa atual' });
  const inputNum = h('span.grow__n');
  const sendBtn = h('button.btn.btn--primary.sendbtn', { type: 'button', onClick: trySend, 'aria-label': 'Enviar tentativa' }, icon('send', 18), h('span', 'ENVIAR'));
  const hint = h('p.board__hint', { role: 'status' });

  const mineBoard = h('section.panel.board.board--mine',
    h('div.panel__head', h('span', 'SUAS TENTATIVAS'), mineCount),
    h('div.board__scroll', mineList, mineEmpty),
    h('div.board__input', h('div.grow.grow--input', inputNum, input.el, sendBtn), hint));

  const oppList = h('div.board__list.board__list--sm', { role: 'log', 'aria-label': 'Tentativas do adversário' });
  const oppEmpty = h('p.board__empty', 'As tentativas dele contra a sua senha aparecerão aqui.');
  const oppCount = h('em');
  const oppBoard = h('section.panel.board.board--opp',
    h('div.panel__head', h('span', 'TENTATIVAS DO ADVERSÁRIO'), oppCount),
    h('div.board__scroll', oppList, oppEmpty));

  const tabMine = h('button.tab.is-active', { type: 'button', onClick: () => setTab('mine') }, 'Suas tentativas');
  const tabOpp = h('button.tab', { type: 'button', onClick: () => setTab('opp') }, 'Adversário', h('i.tab__badge'));
  const tabs = h('div.tabs', { role: 'tablist' }, tabMine, tabOpp);
  const main = h('div.game__main', { 'data-tab': 'mine' }, mineBoard, oppBoard);

  const kb = createKeyboard({ enterLabel: 'ENVIAR', onKey: handleKey });
  const el = h('section.view.game', hud, banner.el, tabs, main, h('div.game__kb', kb.el));

  blurAfterPointerClick(el);

  function setTab(t) {
    st.tab = t;
    main.dataset.tab = t;
    tabMine.classList.toggle('is-active', t === 'mine');
    tabOpp.classList.toggle('is-active', t === 'opp');
    if (t === 'opp') tabOpp.classList.remove('has-new');
    scrollEnd();
  }

  // ── lógica de entrada
  const game = () => store.get().game;
  const canType = (g) => g?.phase === 'playing' && !st.pending;

  function handleKey(k) {
    const g = game();
    if (!canType(g)) return;
    if (k === 'BACK') { st.typed = st.typed.slice(0, -1); audio.play('back'); }
    else if (k === 'ENTER') { trySend(); return; }
    else if (st.typed.length < PASSWORD_LENGTH) { st.typed += k; audio.play('key'); }
    paintInput();
  }

  function flashHint(text) {
    hint.textContent = text; hint.classList.add('is-bad');
    clearTimeout(st.hintTimer);
    st.hintTimer = setTimeout(() => { hint.classList.remove('is-bad'); paintInput(); }, 1800);
  }

  function trySend() {
    const g = game();
    if (g?.phase !== 'playing' || st.pending) return;
    if (g.turn !== 'you') { input.shake(); audio.play('error'); flashHint(`Aguarde a vez de ${g.opponent?.nick || 'seu adversário'}.`); return; }
    if (st.typed.length !== PASSWORD_LENGTH) { input.shake(); audio.play('error'); flashHint(`Faltam ${PASSWORD_LENGTH - st.typed.length} caracteres.`); return; }
    st.pending = true;
    audio.play('send');
    actions.guess(st.typed);
    clearTimeout(st.pendingTimer);
    st.pendingTimer = setTimeout(releasePending, 4000);
    paintInput();
  }

  function releasePending() { clearTimeout(st.pendingTimer); st.pending = false; paintInput(); }

  function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Backspace') { e.preventDefault(); kb.press('BACK'); handleKey('BACK'); }
    else if (e.key === 'Enter') { if (tag === 'BUTTON') return; // foco por Tab: o próprio botão trata o Enter
      e.preventDefault(); kb.press('ENTER'); handleKey('ENTER'); }
    else if (e.key.length === 1 && isAlnum(e.key)) { e.preventDefault(); const k = e.key.toUpperCase(); kb.press(k); handleKey(k); }
  }
  function onPaste(e) {
    const g = game();
    if (!canType(g) || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    st.typed = (st.typed + cleanInput(e.clipboardData?.getData('text') || '')).slice(0, PASSWORD_LENGTH);
    paintInput();
  }
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('paste', onPaste);

  // ── pintura
  function paintSecret() {
    const g = game();
    const secret = g?.you.secret || '';
    youSecret.textContent = st.showSecret ? secret : '••••••••••••';
    youSecret.classList.toggle('is-shown', st.showSecret);
    eyeBtn.replaceChildren(icon(st.showSecret ? 'eye' : 'eyeOff', 15));
    eyeBtn.title = st.showSecret ? 'Ocultar minha senha' : 'Mostrar minha senha';
    eyeBtn.setAttribute('aria-label', eyeBtn.title);
  }

  function paintInput() {
    const g = game();
    if (!g) return;
    const playing = g.phase === 'playing';
    input.setValue(st.typed, { cursor: canType(g) });
    inputNum.textContent = String(g.myGuesses.length + 1).padStart(2, '0');
    sendBtn.disabled = !(playing && g.turn === 'you' && st.typed.length === PASSWORD_LENGTH && !st.pending);
    kb.setEnabled(canType(g));
    mineBoard.classList.toggle('is-waiting', playing && g.turn !== 'you');
    if (hint.classList.contains('is-bad')) return;
    hint.textContent = !playing ? 'Partida encerrada.'
      : st.pending ? 'Enviando…'
        : g.turn === 'you' ? (st.typed.length === PASSWORD_LENGTH ? 'Pronto! Envie sua tentativa.' : `Digite ${PASSWORD_LENGTH} caracteres · ${st.typed.length}/${PASSWORD_LENGTH}`)
          : `Vez de ${g.opponent?.nick || 'seu adversário'}. Você já pode ir digitando.`;
  }

  function paintTurn(g) {
    const playing = g.phase === 'playing';
    const oppNick = g.opponent?.nick || g.result?.opponentNick || 'Adversário';
    turn.dataset.state = playing ? g.turn : 'idle';
    turnLabel.textContent = playing ? (g.turn === 'you' ? 'SUA VEZ' : `VEZ DE ${oppNick.toUpperCase()}`) : 'FIM DE JOGO';
    turnSub.textContent = playing
      ? `Tentativa nº ${(g.turn === 'you' ? g.myGuesses.length : g.oppGuesses.length) + 1}`
      : 'Revelando resultado…';
    if (playing && st.lastTurn !== g.turn) {
      turn.classList.remove('flash'); void turn.offsetWidth; turn.classList.add('flash');
    }
    st.lastTurn = playing ? g.turn : st.lastTurn;
  }

  function scrollEnd() {
    requestAnimationFrame(() => {
      for (const list of [mineList, oppList]) {
        const sc = list.parentElement;
        sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
      }
    });
  }

  function syncRows(g) {
    if (g.myGuesses.length < st.mine || g.oppGuesses.length < st.opp) {
      mineList.replaceChildren(); oppList.replaceChildren(); st.mine = 0; st.opp = 0; st.seen = false;
    }
    const fresh = st.seen;

    for (let i = st.mine; i < g.myGuesses.length; i++) {
      const gr = g.myGuesses[i];
      mineList.append(createGuessRow({ guess: gr.guess, marks: gr.marks, n: i + 1, size: 'lg', animate: fresh }).el);
      if (fresh) {
        audio.reveal(gr.marks);
        st.typed = '';
        releasePending();
        clearTimeout(st.kbTimer);
        st.kbTimer = setTimeout(() => kb.setStatuses(keyStatuses(game()?.myGuesses || [])), 950);
      }
    }
    for (let i = st.opp; i < g.oppGuesses.length; i++) {
      const gr = g.oppGuesses[i];
      oppList.append(createGuessRow({ guess: gr.guess, marks: gr.marks, n: i + 1, size: 'sm', animate: fresh }).el);
      if (fresh) {
        audio.reveal(gr.marks, { volume: 0.45 });
        if (st.tab !== 'opp') tabOpp.classList.add('has-new');
      }
    }
    const grew = g.myGuesses.length !== st.mine || g.oppGuesses.length !== st.opp;
    st.mine = g.myGuesses.length; st.opp = g.oppGuesses.length;
    if (!st.seen) { kb.setStatuses(keyStatuses(g.myGuesses)); st.seen = true; }
    mineEmpty.hidden = st.mine > 0; oppEmpty.hidden = st.opp > 0;
    mineCount.textContent = `${st.mine}`; oppCount.textContent = `${st.opp}`;
    if (grew) scrollEnd();
  }

  paintSecret();

  return {
    el,
    update(s) {
      const g = s.game;
      if (!g) return;
      if (s.errorTick !== st.lastErr) { st.lastErr = s.errorTick; releasePending(); }
      const opp = g.opponent;
      youName.textContent = `${g.you.nick} (você)`;
      oppName.textContent = opp?.nick || g.result?.opponentNick || 'Adversário';
      oppDot.dataset.on = opp?.connected ? '1' : '0';
      youStats.textContent = `${g.myGuesses.length} tentativas · melhor: ${best(g.myGuesses)}/12 verdes`;
      oppStats.textContent = `${g.oppGuesses.length} tentativas · melhor: ${best(g.oppGuesses)}/12 verdes`;
      paintSecret();
      paintTurn(g);
      syncRows(g);
      paintInput();
      banner.update(g);
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('paste', onPaste);
      clearTimeout(st.pendingTimer); clearTimeout(st.kbTimer); clearTimeout(st.hintTimer);
      banner.destroy();
    },
  };
}
