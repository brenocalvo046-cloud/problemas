// Confete de vitória em canvas (partículas neon).
export function confetti(host, { duration = 3600 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = host.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#3be8ff', '#22c983', '#ffa31a', '#ffffff', '#8af3ff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: rect.width * (0.2 + Math.random() * 0.6),
    y: rect.height * 0.35,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 11 - 3,
    w: 4 + Math.random() * 6,
    h: 3 + Math.random() * 5,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
  }));

  const start = performance.now();
  let raf = 0;
  (function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, rect.width, rect.height);
    const fade = Math.max(0, 1 - Math.max(0, elapsed - duration + 700) / 700);
    for (const p of parts) {
      p.vy += 0.28; p.vx *= 0.995; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c;
      ctx.shadowBlur = 8;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed < duration) raf = requestAnimationFrame(frame);
    else canvas.remove();
  })(start);

  return () => { cancelAnimationFrame(raf); canvas.remove(); };
}
