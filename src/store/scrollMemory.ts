import { create } from "zustand";

/**
 * Per-route scroll position memory.
 *
 * When the user navigates between pages and comes back, the
 * previous scroll position is restored instead of starting at the
 * top. This is specifically useful for :
 *
 *   - Long Communauté list — user scrolls to find a friend, clicks
 *     their name to open the profile, comes back → reposition where
 *     they left off
 *   - Library / Achievements / Crews / Settings — same pattern
 *
 * Implemented via a Zustand store keyed by the route key (the same
 * string AppShell uses as the React key for the route element).
 * Pages opt in via the `<ScrollMemoryContainer>` component or the
 * `useScrollMemory(routeKey)` hook.
 *
 * Limit : single scroll context per route. Pages with multiple
 * scroll panes (e.g. CrewsPage with channels list + messages) only
 * memorise the main one. That's fine for now ; can be extended to
 * a Map<routeKey, Map<paneId, position>> if needed later.
 */
type ScrollState = {
  positions: Record<string, number>;
  set: (key: string, position: number) => void;
  get: (key: string) => number;
};

export const useScrollMemoryStore = create<ScrollState>((set, get) => ({
  positions: {},
  set: (key, position) =>
    set((state) => ({ positions: { ...state.positions, [key]: position } })),
  get: (key) => get().positions[key] ?? 0,
}));
