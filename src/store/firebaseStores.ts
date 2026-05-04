/**
 * Centralised Zustand stores wrapping the live Firestore watchers that
 * are subscribed to from many places in the app. Without these, several
 * components would each call `watchAllUsers` / `watchModules` / etc. and
 * pay for N redundant subscriptions on the same query.
 *
 * Pattern (per store):
 *
 *  1. A Zustand store holds the latest snapshot data.
 *  2. A module-level ref-count tracks how many React components are
 *     consuming the data right now.
 *  3. The first consumer to mount triggers `watchX(...)`. The last one
 *     to unmount stops it. State is reset to its initial empty shape on
 *     stop so re-mounts don't briefly show stale data.
 *  4. The exposed hook `useX()` does the ref-counting + `useEffect` for
 *     callers — they just call `const items = useModules()` and forget.
 *
 * This collapses 4-8 redundant Firestore listeners (see App.tsx, Sidebar,
 * HomePage, FriendsOnlineStrip, LiveActivityToastHost, etc.) down to
 * exactly one per query — saving ~75% of the launcher's idle Firestore
 * bandwidth and removing a chunk of duplicated re-render work.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { watchAllUsers, type UserPresence } from "@/firebase/presence";
import { watchModules } from "@/firebase/modules";
import { watchConversationsFor } from "@/firebase/messaging";
import { watchPlaytime, type PlaytimeEntry } from "@/firebase/playtime";
import { watchAchievements, type UnlockedAchievement } from "@/firebase/achievements";
import { watchNotifications, type AppNotification } from "@/firebase/notifications";
import { watchLaunchDays, type LaunchDay } from "@/firebase/launchDays";
import { loadCachedModules, saveCachedModules } from "@/lib/offlineCache";
import type { LauncherModule } from "@/types/module";
import type { Conversation } from "@/types/messaging";

// ─── Helper: ref-counted single-key store (no per-uid keying) ──────────

function makeSharedStore<T>(
  initial: T,
  watch: (cb: (data: T) => void) => () => void,
  options: { initiallyPrimed?: boolean } = {},
) {
  // `primed` flips to true after the first snapshot fires. Lets consumers
  // distinguish "loading" from "loaded but empty" without needing their
  // own state. Reset to false when the watcher stops.
  //
  // `initiallyPrimed` lets a caller hot-seed `data` from a synchronous
  // source (e.g. localStorage at boot) and skip the loading state — used
  // by the modules store to render the offline-cached library before
  // Firestore even gets a chance to respond.
  const useStore = create<{ data: T; primed: boolean }>(() => ({
    data: initial,
    primed: !!options.initiallyPrimed,
  }));
  let unsubscribe: (() => void) | null = null;
  let refCount = 0;

  const start = () => {
    refCount++;
    if (refCount > 1) return;
    unsubscribe = watch((data) => useStore.setState({ data, primed: true }));
  };
  const stop = () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      unsubscribe?.();
      unsubscribe = null;
      useStore.setState({ data: initial, primed: false });
    }
  };

  return {
    useData(): T {
      useEffect(() => {
        start();
        return stop;
      }, []);
      return useStore((s) => s.data);
    },
    usePrimed(): boolean {
      return useStore((s) => s.primed);
    },
  };
}

// ─── Helper: ref-counted per-uid store ────────────────────────────────

function makePerUidStore<T>(
  initial: T,
  watch: (uid: string, cb: (data: T) => void) => () => void,
) {
  // `primed` flips to true once the first onSnapshot has fired for the
  // given uid. Consumers (e.g. App.tsx achievement toaster) need to
  // distinguish "no data yet" from "data loaded, just empty" to avoid
  // re-toasting unlocks on every boot.
  const useStore = create<{
    byUid: Record<string, T>;
    primed: Record<string, boolean>;
  }>(() => ({ byUid: {}, primed: {} }));
  // Per-uid ref-counts so we can stop a watcher the moment its last
  // consumer unmounts, without affecting other uids.
  const subs: Record<string, { unsubscribe: () => void; refCount: number }> = {};

  const start = (uid: string) => {
    if (!uid) return;
    let entry = subs[uid];
    if (!entry) {
      entry = { unsubscribe: () => {}, refCount: 0 };
      subs[uid] = entry;
      entry.unsubscribe = watch(uid, (data) => {
        useStore.setState((s) => ({
          byUid: { ...s.byUid, [uid]: data },
          primed: { ...s.primed, [uid]: true },
        }));
      });
    }
    entry.refCount++;
  };
  const stop = (uid: string) => {
    const entry = subs[uid];
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      entry.unsubscribe();
      delete subs[uid];
      useStore.setState((s) => {
        const nextData = { ...s.byUid };
        delete nextData[uid];
        const nextPrimed = { ...s.primed };
        delete nextPrimed[uid];
        return { byUid: nextData, primed: nextPrimed };
      });
    }
  };

  return {
    useData(uid: string | null | undefined): T {
      useEffect(() => {
        if (!uid) return;
        start(uid);
        return () => stop(uid);
      }, [uid]);
      return useStore((s) => (uid ? s.byUid[uid] ?? initial : initial));
    },
    usePrimed(uid: string | null | undefined): boolean {
      return useStore((s) => (uid ? !!s.primed[uid] : false));
    },
  };
}

// ─── Stores: one per Firestore query ──────────────────────────────────

const usersStore = makeSharedStore<UserPresence[]>([], (cb) => watchAllUsers(cb));
/** All launcher users (community page, presence, friends online, etc.). */
export const useUsers = usersStore.useData;
/** True once the first users snapshot has fired. */
export const useUsersPrimed = usersStore.usePrimed;

// Modules: hot-seed the store with the last cached snapshot at module-
// load time so the offline boot path renders the user's library
// immediately, without waiting for the (potentially never-firing)
// Firestore listener. The real listener overrides this once it fires.
const cachedModulesAtBoot = loadCachedModules();
const modulesStore = makeSharedStore<LauncherModule[]>(
  cachedModulesAtBoot,
  (cb) =>
    watchModules((data) => {
      // Persist every fresh snapshot so the next offline boot has the
      // most recent server state to fall back on.
      saveCachedModules(data);
      cb(data);
    }),
  { initiallyPrimed: cachedModulesAtBoot.length > 0 },
);
/** Live list of every published module. */
export const useModules = modulesStore.useData;
/** True once the first modules snapshot has fired. */
export const useModulesPrimed = modulesStore.usePrimed;

const conversationsStore = makePerUidStore<Conversation[]>([], (uid, cb) =>
  watchConversationsFor(uid, cb),
);
/** 1-on-1 conversations the given user participates in. Pass `me.uid`. */
export const useConversations = conversationsStore.useData;

const playtimeStore = makePerUidStore<PlaytimeEntry[]>([], (uid, cb) => watchPlaytime(uid, cb));
/** Per-module playtime for a specific user. */
export const usePlaytime = playtimeStore.useData;

const achievementsStore = makePerUidStore<UnlockedAchievement[]>([], (uid, cb) =>
  watchAchievements(uid, cb),
);
/** Achievements unlocked by a specific user. */
export const useAchievements = achievementsStore.useData;
/** True once the first achievements snapshot has been received for `uid`.
 *  Used by the achievement-toast logic to avoid re-announcing every
 *  already-unlocked achievement at boot, before Firestore has replied. */
export const useAchievementsPrimed = achievementsStore.usePrimed;

const notificationsStore = makePerUidStore<AppNotification[]>([], (uid, cb) =>
  watchNotifications(uid, cb),
);
/** All notifications for a specific user, newest first, capped at 50. */
export const useNotifications = notificationsStore.useData;

const launchDaysStore = makePerUidStore<LaunchDay[]>([], (uid, cb) =>
  watchLaunchDays(uid, cb),
);
/** Daily launch / playtime aggregates for a user. Drives the streak +
 *  weekend-warrior achievements. */
export const useLaunchDays = launchDaysStore.useData;
