import { useEffect, useRef, useState } from "react";

/** Fires once, the first time the element scrolls into view — used to
 *  trigger a one-shot entrance animation rather than re-animating every
 *  time a data-dense list scrolls in and out of the viewport. */
export function useInView() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If IntersectionObserver isn't available for some reason, just show
    // the content immediately rather than leaving it invisible forever.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, inView];
}
