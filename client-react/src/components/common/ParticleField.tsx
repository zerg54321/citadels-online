import { useEffect, useRef } from 'react';

// Gold particle flow field for the home hero. Rising, twinkling embers rendered
// on a single canvas so the motion stays smooth (one rAF loop, no DOM churn)
// while evoking a mysterious, candle-lit citadel atmosphere over the black-gold
// gradient. Particle density scales with the stage area; DPR-aware for crisp
// dots on retina/iPad panels. Honors prefers-reduced-motion by rendering a
// static field instead of animating.
interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  a: number; // base alpha
  tw: number; // twinkle phase
  tws: number; // twinkle speed
  glow: boolean;
}

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let w = 0;
    let h = 0;
    let particles: Particle[] = [];

    const createParticle = (initial: boolean): Particle => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 12,
      r: 0.6 + Math.random() * 1.9,
      vy: -(0.12 + Math.random() * 0.42),
      vx: (Math.random() - 0.5) * 0.18,
      a: 0.14 + Math.random() * 0.5,
      tw: Math.random() * Math.PI * 2,
      tws: 0.008 + Math.random() * 0.02,
      glow: Math.random() > 0.82,
    });

    const spawn = () => {
      const count = Math.min(130, Math.max(42, Math.round((w * h) / 11000)));
      particles = Array.from({ length: count }, () => createParticle(true));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawn();
    };

    const draw = (animate: boolean) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (animate) {
          p.y += p.vy;
          p.x += p.vx;
          p.tw += p.tws;
          if (p.y < -12 || p.x < -12 || p.x > w + 12) {
            particles[i] = createParticle(false);
            continue;
          }
        }
        const alpha = p.a * (0.55 + 0.45 * Math.sin(p.tw));
        const color = p.glow ? '240, 215, 123' : '212, 175, 55';
        ctx.shadowBlur = p.glow ? 9 : 0;
        ctx.shadowColor = `rgba(${color}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    const tick = () => {
      draw(true);
      raf = requestAnimationFrame(tick);
    };

    resize();
    // Paint one static frame immediately so the field is visible before the
    // first rAF tick (also covers background tabs where rAF is throttled).
    draw(false);
    if (!reduced) {
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="home-particles" aria-hidden />;
}
