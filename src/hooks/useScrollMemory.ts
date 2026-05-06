import { useEffect, useRef } from "react";
import { useScrollMemoryStore } from "@/store/scrollMemory";

/**
 * Attach scroll-position memory to a `scroll-y-only` container.
 * Pass the ref + a stable route key (typically the current route
 * name + any sub-id like crewId). On mount → restore the saved
 * position. On scroll → throttle-save back to the store.
 *
 * Usage :
 *
 *   const scrollRef = useRef<HTMLDivElement | null>(null);
 *   useScrollMemory(scrollRef, "library");
 *   return <div ref={scrollRef} className="scroll-y-only ...">…</div>;
 *
 * The hook handles both directions :
 *   - Mount : reads the saved position once the children have
 *     painted (a single rAF tick is enough — content size is
 *     committed by then).
 *   - Scroll : listens to the container's scroll event and writes
 *     back at most once per 80 ms (throttle, not debounce — last
 *     position wins, no risk of losing the final one on unmount).
 *   - Unmount : final flush of the latest scrollTop so the next
 *     mount has the freshest value (the throttled handler may
 *     have lagged behind the user's last move by ~80 ms otherwise).
 */
export function useScrollMemory(
  ref: React.RefObject<HTMLElement | null>,
  routeKey: string,
): void {
  const setPosition = useScrollMemoryStore((s) => s.set);
  const getPosition = useScrollMemoryStore((s) => s.get);
  // Hold the latest scrollTop in a ref so the unmount cleanup can
  // flush it without depending on the throttled state.
  const latestRef = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Restore previous position. Wait one rAF tick so React has
    // committed the children — otherwise scrollTop has nothing to
    // scroll into.
    const saved = getPosition(routeKey);
    if (saved > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = saved;
        latestRef.current = saved;
      });
    }

    let throttleTimer: number | null = null;
    const onScroll = () => {
      latestRef.current = el.scrollTop;
      if (throttleTimer !== null) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        setPosition(routeKey, latestRef.current);
      }, 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
      }
      // Final flush so the very last position (which the throttle
      // may not have committed) is persisted before the route
      // unmounts.
      setPosition(routeKey, latestRef.current);
    };
  }, [ref, routeKey, getPosition, setPosition]);
}
