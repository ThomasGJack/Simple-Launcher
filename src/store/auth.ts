import { create } from "zustand";
import type { User } from "firebase/auth";

/**
 * Auth store, with a minimal "offline mode" extension.
 *
 * In offline mode the launcher renders using a `CachedUser` shape read
 * from localStorage rather than a real Firebase `User`. Components that
 * only need uid / displayName / photoURL should treat both shapes
 * uniformly — the `OfflineUser` adapter below mimics the relevant
 * `User` properties as a duck-typed object.
 *
 * `mode` tells consumers whether they should disable network-only
 * actions (write to Firestore, install modules, send messages, …).
 *  - "online"  → real Firebase user, all writes allowed.
 *  - "offline" → cached snapshot, only local actions (launch installed
 *               games, browse cached library) should work.
 *  - "anon"    → no user at all, app should redirect to login.
 */
export type AuthMode = "online" | "offline" | "anon";

type AuthState = {
  user: User | null;
  mode: AuthMode;
  loading: boolean;
  setUser: (user: User | null) => void;
  setOfflineUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  mode: "anon",
  loading: true,
  setUser: (user) =>
    set({ user, mode: user ? "online" : "anon", loading: false }),
  setOfflineUser: (user) =>
    set({ user, mode: user ? "offline" : "anon", loading: false }),
  setLoading: (loading) => set({ loading }),
}));
