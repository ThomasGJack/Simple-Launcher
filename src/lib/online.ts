import { create } from "zustand";

/**
 * Online state tracking — combines `navigator.onLine` (instantaneous,
 * tells us if a network interface exists) with a periodic reachability
 * probe (tells us if real internet works, since `onLine` returns true on
 * captive portals / VPNs disconnected from the public net).
 *
 * Components consume `useOnline()` for boolean reactivity, or
 * `getOnline()` for one-shot reads inside non-React code.
 *
 * The launcher uses this to:
 *  - Show an offline banner at the top of the shell.
 *  - Skip Firebase listeners that would hang otherwise.
 *  - Re-seed Zustand stores from localStorage when offline at boot.
 *  - Disable network-only buttons (login, install, news refresh).
 */

type OnlineState = {
  online: boolean;
  /** When the most recent transition happened (epoch ms). */
  changedAtMs: number;
  setOnline: (online: boolean) => void;
};

export const useOnlineStore = create<OnlineState>((set) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  changedAtMs: Date.now(),
  setOnline: (online) =>
    set((s) => (s.online === online ? s : { online, changedAtMs: Date.now() })),
}));

/** Hook that returns the current `online` boolean and triggers re-renders. */
export const useOnline = () => useOnlineStore((s) => s.online);

/** One-shot read for non-React contexts. */
export const getOnline = () => useOnlineStore.getState().online;

/**
 * Wire the browser's online/offline events into the store, and run a
 * cheap reachability probe every 30 s to catch the "wifi connected but
 * no internet" case where `navigator.onLine` lies. Idempotent — calling
 * twice is a no-op (the second call returns immediately).
 *
 * Should be invoked once at app boot from `main.tsx` or `App.tsx`.
 */
let installed = false;
export function installOnlineDetection() {
  if (installed) return;
  installed = true;
  if (typeof window === "undefined") return;

  const set = useOnlineStore.getState().setOnline;

  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));

  // Periodic reachability check. Hits the Google generate_204 endpoint
  // which is ~0 KB, has permissive CORS and is the same probe Chrome
  // uses internally for its connectivity hint. Fail = offline regardless
  // of what `navigator.onLine` says. We don't await the network promise
  // synchronously to avoid blocking the event loop.
  const probe = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set(false);
      return;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4_000);
      await fetch("https://www.gstatic.com/generate_204", {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
        // generate_204 is intentionally CORS-permissive but `no-cors`
        // means we can't read the body — that's fine, we only care that
        // the request completed.
        mode: "no-cors",
      });
      clearTimeout(timer);
      set(true);
    } catch {
      set(false);
    }
  };

  // Initial probe (don't wait for the 30 s tick to converge on the truth).
  void probe();
  setInterval(probe, 30_000);
}
