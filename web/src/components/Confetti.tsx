'use client';

import { useEffect, useRef } from 'react';

let fire: ((durationMs: number) => void) | null = null;

/** Fire the celebration confetti (no-op if the canvas isn't mounted / on server). */
export function fireConfetti(durationMs = 3000): void {
  fire?.(durationMs);
}

const COLORS = ['#2ea043', '#4184e4', '#d47616', '#986ee2', '#ab8a12', '#e5534b'];

interface Piece {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  spin: number; vspin: number; color: string; opacity: number;
}

export function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let pieces: Piece[] = [];
    let active = false;
    let raf = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    fire = (duration: number) => {
      const started = performance.now();
      active = true;
      for (let i = 0; i < 140; i++) {
        pieces.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height * 0.3,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          vx: -1.5 + Math.random() * 3,
          vy: 2 + Math.random() * 3.5,
          spin: Math.random() * 360,
          vspin: -6 + Math.random() * 12,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          opacity: 1,
        });
      }
      const animate = (now: number) => {
        if (!active) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const elapsed = now - started;
        pieces = pieces.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.spin += p.vspin;
          if (elapsed > duration * 0.7) p.opacity -= 0.02;
          if (p.y > canvas.height + 20 || p.opacity <= 0) return false;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.spin * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
          return true;
        });
        if (pieces.length > 0 && elapsed < duration + 3000) raf = requestAnimationFrame(animate);
        else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          active = false;
          pieces = [];
        }
      };
      raf = requestAnimationFrame(animate);
    };

    return () => {
      fire = null;
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }}
    />
  );
}
