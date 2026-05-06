import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { useUIStore } from "@/store/ui";
import { getFirebase } from "@/firebase/config";
import { recordPlaytime } from "@/firebase/playtime";
import { recordLaunchDay } from "@/firebase/launchDays";
import { ensureMasterMemberships } from "@/firebase/crews";
import { pushHeartbeat, type CurrentActivity } from "@/firebase/presence";
import { watchFavorites } from "@/firebase/favorites";
import { useFavoritesStore } from "@/store/favorites";
import { logger, installGlobalLoggerHandlers } from "@/lib/logger";
import {
  useUsers,
  useModules,
  useConversations,
  usePlaytime,
  useAchievements,
  useAchievementsPrimed,
} from "@/store/firebaseStores";
import { recordUnlock } from "@/firebase/achievements";
import {
  bumpTotalUsersOnce,
  incrementAchievementCount,
} from "@/firebase/achievementStats";
import { recordNotification } from "@/firebase/notifications";
import { notify } from "@/lib/notifications";
import {
  ACHIEVEMENTS,
  computeProgress,
  isUnlocked,
  progressPercent,
  type Achievement,
  type AchievementContext,
} from "@/lib/achievements";
import { achievementFlags } from "@/lib/achievementFlags";
import { buildAchievementContext } from "@/lib/achievementContext";
import { watchUserShortcuts } from "@/firebase/shortcuts";
import { useLaunchDays } from "@/store/firebaseStores";
import {
  pushAchievementToast,
  pushMilestoneToast,
  AchievementUnlockToastHost,
} from "@/components/achievements/AchievementUnlockToast";
import { InvitationPopupHost } from "@/components/invitations/InvitationPopup";
import { LiveActivityToastHost } from "@/components/presence/LiveActivityToastHost";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import {
  cachedUserAsFirebaseUser,
  firebaseUserAsCached,
  loadCachedUser,
  saveCachedUser,
} from "@/lib/offlineCache";
import { useOnlineStore } from "@/lib/online";
import type { ModuleExitEvent, ModuleLaunchEvent } from "@/lib/modules";

// Install window.error / window.unhandledrejection capture eagerly at
// module load so even errors during initial mount get logged. Boot log
// is deferred until the launcher version is known so the file name
// (`YYYY-MM-DD_HH-MM_v<version>_<sid>.log`) reflects the real version
// instead of the "dev" fallback.
installGlobalLoggerHandlers();
// Snapshot the launch hour right at module load so the time-of-day
// achievements (night-owl, early-bird) read a stable value for the
// duration of the session — Date.getHours() at evaluate-time would
// silently change if the user kept the app open across midnight.
achievementFlags.setBootHour(new Date().getHours());
void (async () => {
  try {
    const v = await getVersion();
    logger.setLauncherVersion(v);
  } catch {
    /* offline / non-tauri — keep the "dev" fallback */
  }
  logger.info("App boot", { source: "App" });
})();

function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setOfflineUser = useAuthStore((s) => s.setOfflineUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const mode = useAuthStore((s) => s.mode);
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);

  // ─── Auth bootstrap with offline fallback ──────────────────────────
  //
  // Firebase's `onAuthStateChanged` fires immediately with the locally
  // persisted user when the app boots, even when offline — but ONLY if
  // the persistence layer manages to hydrate. On a cold offline boot
  // with a corrupt or missing IndexedDB / localStorage, the callback
  // can hang for the full network timeout (~30 s) before resolving to
  // null. That's the "white page" the user sees.
  //
  // To fix: race the real listener against a 4-second wall clock that
  // falls back to whatever we cached in `offline.user.v1` from the
  // previous successful login. If the listener ever fires later (e.g.
  // network comes back mid-session), it overwrites the cached snapshot
  // and switches the store back to "online" mode.
  useEffect(() => {
    const fb = getFirebase();
    if (!fb) {
      setLoading(false);
      return;
    }
    let resolvedByListener = false;
    const unsubscribe = onAuthStateChanged(fb.auth, (u) => {
      resolvedByListener = true;
      setUser(u);
      if (u) {
        // Persist a slim snapshot so the next offline boot still
        // renders without waiting on Firebase to come back.
        saveCachedUser(firebaseUserAsCached(u));
        // Bump the global "totalUsers" counter once per uid per boot —
        // feeds the rarity % shown next to each achievement.
        bumpTotalUsersOnce(u.uid).catch(() => {});
        // Ensure the user is a member of every master crew (currently
        // just "Simple Games"). Idempotent: setDoc(merge) is a no-op
        // if the membership already exists.
        ensureMasterMemberships(
          u.uid,
          u.displayName ?? null,
          u.photoURL ?? null,
        ).catch((err) =>
          console.warn("[crews] master memberships ensure failed:", err),
        );
      } else {
        // Logout / no user → clear the cache so we don't show stale
        // identity on the next launch.
        saveCachedUser(null);
      }
      logger.setUser(u?.uid ?? null, u?.displayName ?? null, u?.photoURL ?? null);
      if (u) {
        logger.action("Login", { source: "App", metadata: { uid: u.uid } });
      } else {
        logger.action("Logout", { source: "App" });
      }
    });

    // 4 s fallback — short enough that a slow boot still feels snappy,
    // long enough that a normal warm IndexedDB hydrate (~50–500 ms)
    // beats it. Only kicks in when the listener hasn't fired yet AND
    // we have something cached AND we're actually offline.
    const timer = setTimeout(() => {
      if (resolvedByListener) return;
      const cached = loadCachedUser();
      const online = useOnlineStore.getState().online;
      if (cached && !online) {
        logger.warn(
          "Auth listener slow + offline — falling back to cached user",
          { source: "App.boot", metadata: { uid: cached.uid } },
        );
        // Stamp the local "used offline" achievement flag so lone-wolf
        // unlocks on the next eval pass.
        achievementFlags.markOfflineUsed();
        setOfflineUser(cachedUserAsFirebaseUser(cached));
      } else {
        // No cache to fall back on — let the user land on the login
        // page rather than spin forever.
        setLoading(false);
      }
    }, 4_000);

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [setUser, setOfflineUser, setLoading]);

  // Log every page navigation as an action — gives the admin a breadcrumb
  // trail of what the user did before any bug was reported.
  useEffect(() => {
    logger.action(`Navigation: ${route.name}`, {
      source: "App",
      metadata:
        route.name === "module"
          ? { moduleId: route.moduleId }
          : route.name === "messages"
            ? { conversationId: route.conversationId }
            : undefined,
    });
  }, [route]);

  // Listen for "tray-reopen" — fired by Rust when the user brought the
  // window back from the system tray (left-click, "Ouvrir" menu item,
  // or single-instance forwarder). Drives the #39 "Discret" achievement
  // which requires having closed-to-tray then come back.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("tray-reopen", () => {
      achievementFlags.markTrayDiscovered();
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Listen for tray-icon menu navigation events emitted from Rust.
  // The tray menu has shortcuts ("Communauté", "Messages", "Bibliothèque")
  // that fire a `tray-navigate` event with the route name; we forward
  // those into the UI store.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ route: string; payload?: string }>("tray-navigate", (event) => {
      const target = event.payload.route;
      switch (target) {
        case "community":
          navigate({ name: "community" });
          break;
        case "messages":
          navigate({ name: "messages" });
          break;
        case "library":
          navigate({ name: "library" });
          break;
        case "home":
          navigate({ name: "home" });
          break;
      }
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, [navigate]);

  useEffect(() => {
    if (loading) return;
    if (!user && route.name !== "login") {
      navigate({ name: "login" });
    } else if (user && route.name === "login") {
      navigate({ name: "home" });
    }
  }, [loading, user, route, navigate]);

  // ─── Mount the offline-mode banner host once auth is settled. The
  // banner reads `useOnline()` itself; this block just makes sure it's
  // rendered above the AppShell and remains visible even when auth is
  // still loading. Hidden when the route is "login" so we don't double
  // up the offline messaging there.
  const showOfflineBanner = mode !== "anon" && route.name !== "login";

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const promise = listen<ModuleExitEvent>("module-exited", (event) => {
      const { moduleId, durationMs } = event.payload;
      if (durationMs <= 0) return;
      recordPlaytime(uid, moduleId, durationMs).catch((err) =>
        console.warn("[playtime] write failed:", err),
      );
      // Mirror the launch into the per-day aggregate doc — drives the
      // streak + weekend-warrior achievements.
      recordLaunchDay(uid, durationMs).catch((err) =>
        console.warn("[launchDays] write failed:", err),
      );
    });
    return () => {
      promise.then((u) => u()).catch(() => {});
    };
  }, [user]);

  const setFavorites = useFavoritesStore((s) => s.setFavorites);
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    return watchFavorites(user.uid, setFavorites);
  }, [user, setFavorites]);

  const currentActivityRef = useRef<CurrentActivity | null>(null);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    pushHeartbeat(uid, currentActivityRef.current).catch(() => {});
    const interval = setInterval(() => {
      pushHeartbeat(uid, currentActivityRef.current).catch(() => {});
    }, 30_000);

    const launchPromise = listen<ModuleLaunchEvent>("module-launched", (event) => {
      const { moduleId, moduleName, startedAt } = event.payload;
      currentActivityRef.current = { moduleId, moduleName, startedAt };
      pushHeartbeat(uid, currentActivityRef.current).catch(() => {});
      logger.action("Module launched", {
        source: "App.module-launched",
        metadata: { moduleId, moduleName },
      });
    });
    const exitPromise = listen<ModuleExitEvent>("module-exited", (event) => {
      currentActivityRef.current = null;
      pushHeartbeat(uid, null).catch(() => {});
      const { moduleId, moduleName, durationMs } = event.payload;
      logger.action("Module exited", {
        source: "App.module-exited",
        metadata: { moduleId, moduleName, durationMs },
      });
    });

    return () => {
      clearInterval(interval);
      launchPromise.then((u) => u()).catch(() => {});
      exitPromise.then((u) => u()).catch(() => {});
    };
  }, [user]);

  // ─── Achievements unlock detection ──────────────────────────────────
  // Build a live AchievementContext from the user's data and re-evaluate
  // every catalog entry whenever any input changes. New unlocks are
  // persisted to Firestore + toasted to the user. Already-unlocked
  // achievements are skipped (idempotent — the unlock doc is keyed by id).
  //
  // All Firestore listeners go through `@/store/firebaseStores` — that
  // module ref-counts subscriptions so multiple consumers across the app
  // share a single network listener per query.
  const allModules = useModules();
  const allUsers = useUsers();
  const playtime = usePlaytime(user?.uid);
  const conversations = useConversations(user?.uid);
  const launchDays = useLaunchDays(user?.uid);
  const unlockedList = useAchievements(user?.uid);
  const unlockedSetPrimed = useAchievementsPrimed(user?.uid);
  const unlockedSet = useMemo(
    () => new Set(unlockedList.map((u) => u.id)),
    [unlockedList],
  );

  // ─── Native notification detectors ─────────────────────────────
  //
  // Watch the live presence list and fire OS-level toasts when a
  // friend transitions offline → online, or null currentActivity →
  // playing some game. The user controls per-kind opt-in in
  // Settings ; defaults are OFF for these ambient signals (cf.
  // notificationPrefs.ts) so the user has to flip them on.
  //
  // Snapshot-based dedup : we keep the previous status / activity
  // in a ref and compare to the current one. The very first render
  // primes the refs without firing (otherwise every booted user
  // would trigger a notification at app start).
  const lastFriendStatusRef = useRef<Map<string, "online" | "idle" | "offline">>(
    new Map(),
  );
  const lastFriendActivityRef = useRef<Map<string, string | null>>(new Map());
  useEffect(() => {
    if (!user) {
      lastFriendStatusRef.current.clear();
      lastFriendActivityRef.current.clear();
      return;
    }
    const lastStatus = lastFriendStatusRef.current;
    const lastActivity = lastFriendActivityRef.current;
    const isFirstStatus = lastStatus.size === 0;
    const isFirstActivity = lastActivity.size === 0;
    for (const u of allUsers) {
      if (u.uid === user.uid) continue;
      const now = Date.now();
      const seenAgoMs = u.lastSeen ? now - u.lastSeen : Infinity;
      const status =
        seenAgoMs < 60_000
          ? "online"
          : seenAgoMs < 5 * 60_000
            ? "idle"
            : "offline";
      const prev = lastStatus.get(u.uid);
      if (!isFirstStatus && prev !== "online" && status === "online") {
        notify({
          title: u.displayName ?? u.username ?? "Anonyme",
          body: "vient de passer en ligne",
          kind: "friend-online",
          metadata: { uid: u.uid },
        }).catch(() => {});
      }
      lastStatus.set(u.uid, status);

      const curActivity = u.currentActivity?.moduleName ?? null;
      const prevActivity = lastActivity.get(u.uid) ?? null;
      if (!isFirstActivity && prevActivity == null && curActivity != null) {
        notify({
          title: u.displayName ?? u.username ?? "Anonyme",
          body: `joue à ${curActivity}`,
          kind: "friend-launched",
          metadata: { uid: u.uid, moduleName: curActivity },
        }).catch(() => {});
      }
      lastActivity.set(u.uid, curActivity);
    }
  }, [allUsers, user]);

  // Track shortcut count locally for the shortcut-master achievement.
  // Subscribed at App-level so the value is fresh in the unlock loop.
  const [shortcutCount, setShortcutCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    return watchUserShortcuts(user.uid, (s) => setShortcutCount(s.length));
  }, [user]);
  // Session-level guard against re-toasting an achievement multiple times.
  // The Firestore-derived `unlockedSet` should already prevent this, but if
  // the snapshot listener is delayed (e.g. rules issue, network blip), the
  // effect fires multiple times before the unlock doc is read back. This
  // ref ensures each achievement is announced at most once per app session,
  // regardless of Firestore state.
  const toastedThisSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    // Hard gate: don't even *consider* toasting achievements before we know
    // which ones are already unlocked in Firestore. Otherwise the catalog
    // gets re-toasted on every launch.
    if (!unlockedSetPrimed) return;
    // Build context fresh from the latest snapshots, via the shared
    // helper so the gallery + home chip see identical numbers. Any
    // throw here would prevent the unlock loop from running but is
    // *not* fatal — we just skip this evaluation pass.
    let ctx: AchievementContext;
    try {
      const myProfile = allUsers.find((u) => u.uid === user.uid) ?? null;
      ctx = buildAchievementContext({
        me: user,
        modules: allModules,
        allUsers,
        playtime,
        conversations,
        launchDays,
        myProfile,
        shortcutCount,
      });
    } catch (err) {
      logger.error(
        `Achievement context build failed: ${err instanceof Error ? err.message : String(err)}`,
        { source: "App.achievements" },
      );
      return;
    }
    // Detect newly-unlocked achievements. Two layers of dedup:
    //   1. `unlockedSet` reflects the Firestore-persisted state — once a
    //      record exists, the effect skips it forever.
    //   2. `toastedThisSession` is a session-local fallback that prevents
    //      the toast from firing repeatedly while the Firestore round-trip
    //      is still in flight (or if rules are denying writes silently —
    //      the user reported this exact loop).
    for (const ach of ACHIEVEMENTS) {
      if (unlockedSet.has(ach.id)) continue;
      if (toastedThisSession.current.has(ach.id)) continue;
      if (isUnlocked(ach.id, ctx)) {
        toastedThisSession.current.add(ach.id);
        recordUnlock(user.uid, ach.id).catch((err) => {
          logger.error(
            `Achievement record failed (rules?): ${err instanceof Error ? err.message : String(err)}`,
            { source: "App.achievements", metadata: { achievementId: ach.id } },
          );
        });
        // Bump the global rarity counter for this badge. Best-effort
        // and idempotent at the Firestore level (atomic increment).
        incrementAchievementCount(ach.id).catch(() => {});
        // Mirror the unlock into the notifications subcollection so it
        // shows up in the bell panel for later reference (the toast is
        // ephemeral). Best-effort — failure here doesn't break the
        // unlock itself.
        recordNotification(user.uid, {
          kind: "achievement",
          title: `Achievement débloqué : ${ach.title}`,
          description: ach.description,
          link: "profile",
          meta: { achievementId: ach.id, tier: ach.tier },
        }).catch((err) => {
          console.warn("[notifications] achievement notif failed:", err);
        });
        pushAchievementToast(ach.id);
        // Native Windows notification — fires only when the launcher
        // is not focused (skipIfFocused default true). The user
        // controls per-kind opt-in via Settings → Notifications.
        notify({
          title: `🏆 ${ach.title}`,
          body: ach.description,
          kind: "achievement",
          metadata: { achievementId: ach.id, tier: ach.tier },
        }).catch(() => {});
        logger.action(`Achievement débloqué : ${ach.title}`, {
          source: "App.achievements",
          metadata: { achievementId: ach.id, tier: ach.tier },
        });
      } else {
        // Not yet unlocked — emit a "you're getting close" milestone
        // toast when crossing 75 % / 90 % progress, exactly once per
        // (achievement, tier) combo. Stored in localStorage rather than
        // Firestore because it's purely UX nudging, not a persistent
        // record.
        maybeMilestoneToast(ach, ctx);
      }
    }
  }, [
    user,
    allModules,
    allUsers,
    playtime,
    conversations,
    launchDays,
    shortcutCount,
    unlockedSet,
    unlockedSetPrimed,
  ]);

  // ─── Apparence : push the user's accent + animations prefs onto the
  // root element so every component that reads via CSS vars / data-attr
  // honors them. Re-applied any time the settings store changes.
  const accentColor = useSettingsStore((s) => s.accentColor);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  useEffect(() => {
    const root = document.documentElement;
    if (accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      root.style.setProperty("--color-accent", accentColor);
      // Mirrors the index.css definitions : accent-soft = accent + alpha
      // 0x33 (~20 %), accent-glow = accent + alpha 0x80 (~50 %). Same
      // shorthand the original CSS uses, just via JS so the alpha
      // channel works on hex.
      root.style.setProperty("--color-accent-soft", `${accentColor}33`);
      root.style.setProperty("--color-accent-glow", `${accentColor}80`);
    } else {
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--color-accent-soft");
      root.style.removeProperty("--color-accent-glow");
    }
  }, [accentColor]);

  useEffect(() => {
    const root = document.documentElement;
    if (animationsEnabled) {
      root.removeAttribute("data-reduced-motion");
    } else {
      root.setAttribute("data-reduced-motion", "true");
    }
  }, [animationsEnabled]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          <span className="text-xs uppercase tracking-[0.25em] text-fg-muted">Chargement</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {showOfflineBanner && <OfflineBanner />}
      <AppShell />
      {/* Each top-level host is wrapped in its own ErrorBoundary so a
          crash in one (e.g. a malformed Firestore snapshot) doesn't kill
          the whole tree and turn the launcher into a black screen. */}
      <ErrorBoundary scope="achievements-toast"><AchievementUnlockToastHost /></ErrorBoundary>
      <ErrorBoundary scope="invitation-popup"><InvitationPopupHost /></ErrorBoundary>
      <ErrorBoundary scope="live-activity-toast"><LiveActivityToastHost /></ErrorBoundary>
    </>
  );
}

/**
 * Fires a milestone toast ("you're 75 % / 90 % of the way there") for an
 * achievement that has a numeric progress track. Each (id, tier) combo
 * is rate-limited via localStorage so the user never sees the same nudge
 * twice. Boolean / time-based achievements have no progress and skip
 * silently.
 */
function maybeMilestoneToast(ach: Achievement, ctx: AchievementContext): void {
  const progress = computeProgress(ach.id, ctx);
  if (!progress) return;
  const pct = progressPercent(progress);
  if (pct < 75) return;
  // Pick the highest tier we've crossed for this evaluation. The order
  // matters — 90 % wins over 75 %.
  const tier = pct >= 90 ? 90 : 75;
  const key = `ach.milestone.${ach.id}.${tier}`;
  try {
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
  } catch {
    // Storage disabled — fall back to in-memory dedup. The toast queue
    // itself dedupes by id so worst case is one extra nudge per session.
  }
  pushMilestoneToast(ach.id, pct);
}

export default App;
