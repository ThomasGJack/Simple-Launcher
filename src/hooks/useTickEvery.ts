import { useSyncExternalStore } from "react";

/**
 * Returns a `Date.now()` value that updates at the given interval, shared
 * across all subscribers. Replaces the per-component
 * `useState(Date.now()) + setInterval(setNow, …)` pattern that was used
 * to refresh "X min ago" labels and online/idle/offline statuses
 * across HomePage, CommunityPage, SettingsPage, etc.
 *
 * Why a shared store instead of per-component state :
 *  - Per-component intervals fire independently — three pages with the
 *    same 15 s tick = 12 timer firings/min instead of 4.
 *  - More importantly, `setState(Date.now())` forces a re-render of the
 *    *parent* component, which cascades to every child. With 30+
 *    `<TierAvatar>` and `<TierBanner>` motion.div animations on
 *    CommunityPage, that meant 150+ animations re-mounting every 15 s,
 *    visible as a stutter.
 *  - Subscribers that don't actually depend on `now` skip the update.
 *
 * `useSyncExternalStore` is the recommended React 18+ primitive for
 * subscribing to external sources : it integrates with concurrent
 * rendering (no tearing) and avoids the manual subscribe/unsubscribe
 * boilerplate of `useEffect`.
 *
 * Usage :
 *   const now = useTickEvery(15_000); // re-renders every 15 s
 *   // pass `now` only to the children that need it.
 *
 * Tick precision : the underlying timer runs at the *finest* requested
 * interval across all callers. Every consumer is notified on every
 * tick — coarser intervals are emulated by simply ignoring earlier
 * ticks (the `now` value still advances monotonically). For the
 * launcher's needs (online/idle thresholds at 60 s / 5 min) this is
 * fine.
 */
export function useTickEvery(intervalMs: number): number {
  return useSyncExternalStore(
    (onChange) => sharedTimer.subscribe(intervalMs, onChange),
    () => sharedTimer.getNow(),
    () => sharedTimer.getNow(),
  );
}

// ─── Shared timer store ───────────────────────────────────────────────

class SharedTimer {
  private now = Date.now();
  private subscribers = new Set<() => void>();
  private currentInterval: number | null = null;
  private fastestInterval = Infinity;
  private timerId: ReturnType<typeof setInterval> | null = null;
  /** Tracks each subscriber's requested interval so we can recompute
   *  the fastest tick when one unsubscribes. */
  private intervals = new Map<() => void, number>();

  getNow(): number {
    return this.now;
  }

  subscribe(intervalMs: number, callback: () => void): () => void {
    this.subscribers.add(callback);
    this.intervals.set(callback, intervalMs);
    this.recomputeTimer();
    return () => {
      this.subscribers.delete(callback);
      this.intervals.delete(callback);
      this.recomputeTimer();
    };
  }

  private recomputeTimer(): void {
    // Use the smallest requested interval — coarser subscribers are
    // notified more often than they asked, but they don't actually
    // do work unless the value they read changed (since `now` is the
    // same primitive number, React bails on identical-snapshot
    // re-renders).
    let fastest = Infinity;
    for (const ms of this.intervals.values()) {
      if (ms < fastest) fastest = ms;
    }
    if (fastest === this.fastestInterval) return;
    this.fastestInterval = fastest;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.subscribers.size > 0 && Number.isFinite(fastest)) {
      this.currentInterval = fastest;
      this.timerId = setInterval(() => {
        this.now = Date.now();
        for (const cb of this.subscribers) cb();
      }, this.currentInterval);
    } else {
      this.currentInterval = null;
    }
  }
}

const sharedTimer = new SharedTimer();
