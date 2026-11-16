"use client";
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

// Scroll scene: the section is several screens tall and its stage sticks to the
// viewport. Scroll progress p (0 → 1) drives everything: one big coin spins and
// drops away, then a rain of coins grows heavier the further you scroll.
// Scrolling back up reverses it, because every position is a function of p.

type Coin = { x: number; z: number; offset: number; speed: number; spin: number; spinRate: number; sway: number };

function seeded(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const COINS: Coin[] = (() => {
  const rand = seeded(42);
  return Array.from({ length: 110 }, () => ({ x: rand(), z: .35 + rand() * .65, offset: rand(), speed: .8 + rand() * .9, spin: rand() * Math.PI * 2, spinRate: 3 + rand() * 9, sway: (rand() - .5) * .04 }))
    .sort((a, b) => a.z - b.z);
})();
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

// Pre-render one coin face and one rim so each frame is just drawImage calls.
function makeSprites(size: number) {
  const face = document.createElement('canvas'), rim = document.createElement('canvas');
  face.width = face.height = rim.width = rim.height = size;
  const c = size / 2, r = size / 2 - 1;
  const f = face.getContext('2d')!;
  const g = f.createRadialGradient(c * .7, c * .6, r * .1, c, c, r);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(.45, '#f8c740'); g.addColorStop(1, '#c98a12');
  f.fillStyle = g; f.beginPath(); f.arc(c, c, r, 0, Math.PI * 2); f.fill();
  f.strokeStyle = '#a86d08'; f.lineWidth = size * .035; f.beginPath(); f.arc(c, c, r * .8, 0, Math.PI * 2); f.stroke();
  f.fillStyle = '#9a6206'; f.font = `700 ${size * .52}px Inter, system-ui, sans-serif`; f.textAlign = 'center'; f.textBaseline = 'middle'; f.fillText('¢', c, c + size * .03);
  f.fillStyle = '#ffffff55'; f.beginPath(); f.ellipse(c * .72, c * .62, r * .32, r * .14, -.6, 0, Math.PI * 2); f.fill();
  const e = rim.getContext('2d')!;
  e.fillStyle = '#9a6206'; e.beginPath(); e.arc(c, c, r, 0, Math.PI * 2); e.fill();
  return { face, rim };
}

export function CoinHero({ greeting }: { greeting: string }) {
  const section = useRef<HTMLElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = section.current, cv = canvas.current, ctx = cv?.getContext('2d');
    if (!el || !cv || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { face, rim } = makeSprites(160);
    let w = 0, h = 0, frame = 0, visible = true, p = 0;

    const coin = (x: number, y: number, r: number, spin: number, alpha: number) => {
      const squash = Math.cos(spin), sx = Math.max(.06, Math.abs(squash)), thick = r * .14 * Math.sqrt(1 - sx * sx);
      ctx.globalAlpha = alpha;
      ctx.drawImage(rim, x - r * sx + thick, y - r, r * 2 * sx, r * 2);
      ctx.drawImage(face, x - r * sx, y - r, r * 2 * sx, r * 2);
    };
    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      const unit = Math.min(w, h), t = reduced ? 0 : time / 1000;
      // Rain: more coins appear as p grows; each falls at its own speed.
      const reveal = clamp((p - .08) / .55) * COINS.length;
      COINS.forEach((c, i) => {
        const alpha = clamp((reveal - i) / 6) * (.45 + .55 * c.z);
        if (alpha <= 0) return;
        const fall = ((c.offset + p * c.speed * 2.4) % 1.3) - .15;
        const r = unit * (.018 + .045 * c.z);
        coin(c.x * w + Math.sin(t * .8 + c.offset * 9) * c.sway * w, fall * h, r, c.spin + p * c.spinRate + t * .6, alpha);
      });
      // Hero coin: spins gently, then tumbles down and out as the rain starts.
      const drop = clamp((p - .1) / .4);
      const heroAlpha = 1 - clamp((p - .35) / .2);
      if (heroAlpha > 0) coin(w / 2, h * .62 + drop * drop * h * .8, unit * .17 * (1 - drop * .3), t * 1.1 + p * 16, heroAlpha);
      ctx.globalAlpha = 1;
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const progress = () => {
      const rect = el.getBoundingClientRect(), stage = el.firstElementChild as HTMLElement;
      const travel = rect.height - stage.offsetHeight, top = parseFloat(getComputedStyle(stage).top) || 0;
      p = travel > 0 ? clamp((top - rect.top) / travel) : 0;
      el.style.setProperty('--p', p.toFixed(4));
    };
    const loop = (time: number) => { progress(); draw(time); frame = visible ? requestAnimationFrame(loop) : 0; };

    resize(); progress();
    if (reduced) { p = .6; el.style.setProperty('--p', '.6'); draw(0); }
    else frame = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { resize(); if (reduced) draw(0); }); ro.observe(cv);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible && !frame && !reduced) frame = requestAnimationFrame(loop); });
    io.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); io.disconnect(); };
  }, []);

  return <section ref={section} className="coin-hero" aria-label="Welcome">
    <div className="coin-stage">
      <canvas ref={canvas} className="coin-canvas" aria-hidden="true" />
      <div className="coin-greeting"><h1>{greeting}</h1><p>Welcome to Upcent.</p></div>
      <div className="coin-caption"><h2>Every cent counts.</h2><p>Round up each purchase and watch the spare change pile up.</p></div>
      <span className="coin-hint" aria-hidden="true">Scroll<ChevronDown size={18} /></span>
    </div>
  </section>;
}
