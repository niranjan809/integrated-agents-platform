import { useInView } from "../lib/useInView";

/** Fades + slides content up once it scrolls into view (the theme's "masked
 *  reveal" / "staggered entrance" motion cues). One-shot — doesn't re-fire on
 *  scroll-back, so revisiting a scrolled-past list doesn't flicker. `delay`
 *  (ms) staggers siblings, e.g. `delay={i * 40}` in a `.map()`. */
export default function Reveal({
  children,
  delay = 0,
  className = "",
}) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref}
      className={`${inView ? "animate-fade-in-up" : "opacity-0"} ${className}`}
      style={inView && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
