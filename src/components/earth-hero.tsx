"use client";
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

// Apple-style scroll scene: the section is several screens tall, the stage
// sticks to the viewport, and scroll progress (0 → 1) is written to the CSS
// variable --p, which drives every transform in globals.css (.earth-hero).
export function EarthHero({ greeting }: { greeting: string }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = section.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect(), stage = el.firstElementChild as HTMLElement;
      const travel = rect.height - stage.offsetHeight;
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      const p = travel > 0 ? Math.min(1, Math.max(0, (top - rect.top) / travel)) : 0;
      el.style.setProperty('--p', p.toFixed(4));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);

  return <section ref={section} className="earth-hero" aria-label="Welcome">
    <div className="earth-stage">
      <div className="earth-greeting"><h1>{greeting}</h1><p>Welcome to Wolf of Claude Street.</p></div>
      <div className="earth-glow" aria-hidden="true" />
      <div className="earth-globe"><Image src="/earth.jpg" alt="Planet Earth seen from space" width={1280} height={1281} preload sizes="(max-width: 860px) 90vw, 640px" /></div>
      <p className="earth-caption">Small change.<br />Big world.</p>
      <span className="earth-hint" aria-hidden="true">Scroll<ChevronDown size={18} /></span>
    </div>
  </section>;
}
