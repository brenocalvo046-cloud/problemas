// Desenha a cidade noturna vista pela janela (canvas, determinística).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAYERS = [
  { color: '#0c3a52', minH: 0.34, maxH: 0.62, minW: 26, maxW: 70, lit: 0.18, cell: [3, 5, 6, 9], alpha: 0.9, haze: 0.22 },
  { color: '#082638', minH: 0.26, maxH: 0.58, minW: 34, maxW: 92, lit: 0.34, cell: [4, 6, 8, 11], alpha: 1, haze: 0.14 },
  { color: '#040f1a', minH: 0.16, maxH: 0.46, minW: 44, maxW: 120, lit: 0.46, cell: [5, 7, 10, 14], alpha: 1, haze: 0 },
];
const LIT = ['#ffd98a', '#ffe9b8', '#8cefff', '#c4f1ff', '#ffbf6a'];

export function initScene(canvas) {
  const ctx = canvas.getContext('2d');

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = rng(20260607);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#020611');
    sky.addColorStop(0.42, '#06223a');
    sky.addColorStop(0.78, '#0d4a63');
    sky.addColorStop(1, '#17707f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 150; i++) {
      const s = rnd() * 1.3 + 0.3;
      ctx.fillStyle = `rgba(200,235,255,${0.2 + rnd() * 0.6})`;
      ctx.fillRect(rnd() * w, rnd() * h * 0.5, s, s);
    }

    const mx = w * 0.82, my = h * 0.2, mr = Math.max(14, Math.min(w, h) * 0.04);
    const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 7);
    glow.addColorStop(0, 'rgba(150,235,255,.30)');
    glow.addColorStop(1, 'rgba(150,235,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
    ctx.fillStyle = '#e4f8ff';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(8,38,62,.85)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.35, my - mr * 0.1, mr * 0.92, 0, Math.PI * 2); ctx.fill();

    LAYERS.forEach((L, li) => {
      ctx.globalAlpha = L.alpha;
      let x = -20;
      while (x < w + 20) {
        const bw = L.minW + rnd() * (L.maxW - L.minW);
        const bh = h * (L.minH + rnd() * (L.maxH - L.minH));
        const top = h - bh;
        ctx.fillStyle = L.color;
        ctx.fillRect(x, top, bw, bh);

        if (rnd() < 0.35) { // antena / casa de máquinas
          ctx.fillRect(x + bw * 0.4, top - 6 - rnd() * 8, bw * 0.2, 8);
          if (rnd() < 0.5) {
            const ax = x + bw * 0.5;
            ctx.fillRect(ax - 0.5, top - 28, 1, 22);
            ctx.fillStyle = 'rgba(255,70,80,.9)';
            ctx.fillRect(ax - 1.5, top - 30, 3, 3);
          }
        }

        const [cw, ch, gx, gy] = L.cell;
        for (let wy = top + 8; wy < h - 6; wy += gy) {
          for (let wx = x + 5; wx < x + bw - cw - 2; wx += gx) {
            if (rnd() < L.lit) {
              ctx.fillStyle = LIT[(rnd() * LIT.length) | 0];
              ctx.globalAlpha = L.alpha * (0.35 + rnd() * 0.65);
              ctx.fillRect(wx, wy, cw, ch);
            }
          }
        }
        ctx.globalAlpha = L.alpha;

        if (li === 2 && rnd() < 0.09) { // letreiro neon
          ctx.save();
          ctx.shadowColor = '#3be8ff';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#7df3ff';
          ctx.fillRect(x + bw - 7, top + 14 + rnd() * 20, 2.5, 26 + rnd() * 30);
          ctx.restore();
        }
        x += bw + rnd() * 6;
      }
      ctx.globalAlpha = 1;
      if (L.haze) {
        const hz = ctx.createLinearGradient(0, h * 0.35, 0, h);
        hz.addColorStop(0, 'rgba(20,104,124,0)');
        hz.addColorStop(1, `rgba(24,120,140,${L.haze})`);
        ctx.fillStyle = hz;
        ctx.fillRect(0, h * 0.35, w, h * 0.65);
      }
    });

    const floor = ctx.createLinearGradient(0, h * 0.8, 0, h);
    floor.addColorStop(0, 'rgba(2,8,14,0)');
    floor.addColorStop(1, 'rgba(2,8,14,.65)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
  }

  let timer = 0;
  new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 120); }).observe(canvas);
  draw();
}
