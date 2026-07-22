import { useEffect, useRef } from "react";

// Ambient atmosphere echoing the KiteAI platform: a teal particle-network canvas,
// a slowly drifting grid, and soft radial glows. Rendered FIXED behind all content
// with pointer-events:none, so it adds depth without touching the leaderboard's
// card/grid colors (those are opaque and float above it). Dependency-free 2D
// canvas; paused when the tab is hidden; disabled for prefers-reduced-motion.
export default function AmbientBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const context = el.getContext("2d");
    if (!context) return;
    // Aliased to fresh consts so their inferred type is non-null inside the closures.
    const cv = el;
    const ctx = context;

    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    let raf = 0;
    const TEAL = "0,245,212";
    const LINK = 130;

    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // density scales with viewport area, capped so big screens stay cheap
      const count = Math.min(80, Math.round((w * h) / 20000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.5 + 0.5,
      }));
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${TEAL},.5)`;
        ctx.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(${TEAL},${0.1 * (1 - d / LINK)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(tick);
    }

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* soft teal radial glows */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 640px at 50% -12%, rgba(0,245,212,.10), transparent 60%)," +
            "radial-gradient(760px 460px at 88% 4%, rgba(0,245,212,.06), transparent 55%)",
        }}
      />
      {/* slowly drifting grid */}
      <div className="lb-ambient-grid absolute -inset-0.5" />
      {/* teal particle network */}
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />

      <style>{`
        .lb-ambient-grid {
          opacity: .4;
          background-image:
            linear-gradient(rgba(0,245,212,.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,245,212,.045) 1px, transparent 1px);
          background-size: 48px 48px;
          -webkit-mask-image: radial-gradient(circle at 50% 0%, #000 0%, transparent 75%);
          mask-image: radial-gradient(circle at 50% 0%, #000 0%, transparent 75%);
          animation: lbGridDrift 32s linear infinite;
        }
        @keyframes lbGridDrift { to { background-position: 48px 48px, 48px 48px; } }
        @media (prefers-reduced-motion: reduce) { .lb-ambient-grid { animation: none; } }
      `}</style>
    </div>
  );
}
