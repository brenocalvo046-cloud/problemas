// Sons sintetizados com WebAudio (sem arquivos). Sutis e opcionais.
const KEY = 'problemas.sound';
let ctx = null;
let enabled = localStorage.getItem(KEY) !== '0';
const MASTER = 0.15;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ f = 440, f2 = null, t = 0, d = 0.08, type = 'sine', v = 1 }) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + t;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(MASTER * v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + d + 0.03);
}

const SOUNDS = {
  key: () => tone({ f: 640, f2: 480, d: 0.045, type: 'square', v: 0.3 }),
  back: () => tone({ f: 360, f2: 250, d: 0.05, type: 'square', v: 0.25 }),
  send: () => tone({ f: 420, f2: 860, d: 0.13, type: 'triangle', v: 0.8 }),
  hit: (t = 0, v = 1) => tone({ f: 880, d: 0.12, t, type: 'sine', v: 0.9 * v }),
  near: (t = 0, v = 1) => tone({ f: 560, d: 0.1, t, type: 'triangle', v: 0.7 * v }),
  miss: (t = 0, v = 1) => tone({ f: 190, f2: 140, d: 0.09, t, type: 'sawtooth', v: 0.18 * v }),
  turn: () => { tone({ f: 660, d: 0.1 }); tone({ f: 990, d: 0.15, t: 0.09 }); },
  join: () => { tone({ f: 520, d: 0.1 }); tone({ f: 780, d: 0.12, t: 0.1 }); tone({ f: 1040, d: 0.18, t: 0.2 }); },
  error: () => tone({ f: 210, f2: 120, d: 0.18, type: 'sawtooth', v: 0.4 }),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f, t: i * 0.11, d: 0.24, type: 'triangle' })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ f, t: i * 0.16, d: 0.3, type: 'sawtooth', v: 0.4 })),
};

export const audio = {
  get enabled() { return enabled; },
  setEnabled(v) {
    enabled = !!v;
    localStorage.setItem(KEY, enabled ? '1' : '0');
    if (enabled) { ac(); SOUNDS.key(); }
  },
  play(name, ...args) { SOUNDS[name]?.(...args); },
  /** Um "tique" por casa, sincronizado com a virada dos blocos. */
  reveal(marks, { volume = 1, step = 48, base = 0 } = {}) {
    [...marks].forEach((m, i) => {
      const fn = m === 'G' ? SOUNDS.hit : m === 'O' ? SOUNDS.near : SOUNDS.miss;
      fn((base + i * step + 230) / 1000, volume);
    });
  },
};
