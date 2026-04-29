import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { getFirebase } from "@/firebase/config";
import { recordPlaytime } from "@/firebase/playtime";
import { pushHeartbeat, type CurrentActivity } from "@/firebase/presence";
import { watchFavorites } from "@/firebase/favorites";
import { useFavoritesStore } from "@/store/favorites";
import { logger, installGlobalLoggerHandlers } from "@/lib/logger";
import { watchAllUsers, type UserPresence as UserPresenceT } from "@/firebase/presence";
import { watchPlaytime, type PlaytimeEntry } from "@/firebase/playtime";
import { watchConversationsFor } from "@/firebase/messaging";
import { watchModules } from "@/firebase/modules";
import { watchAchievements, recordUnlock } from "@/firebase/achievements";
import { ACHIEVEMENTS, isUnlocked, type AchievementContext } from "@/lib/achievements";
import { pushAchievementToast, AchievementUnlockToastHost } from "@/components/achievements/AchievementUnlockToast";
import { InvitationPopupHost } from "@/components/invitations/InvitationPopup";
import { LiveActivityToastHost } from "@/components/presence/LiveActivityToastHost";
import type { Conversation as ConversationT } from "@/types/messaging";
import type { LauncherModule } from "@/types/module";
import type { ModuleExitEvent, ModuleLaunchEvent } from "@/lib/modules";

// Install window.error / window.unhandledrejection / console.error capture
// eagerly at module load so even errors during initial mount get logged.
installGlobalLoggerHandlers();
logger.info("App boot", { source: "App" });

function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      // Bind logger identity so subsequent logs ship with uid + display name
      // attached. Buffered anonymous logs from before login get backfilled.
      logger.setUser(u?.uid ?? null, u?.displayName ?? null, u?.photoURL ?? null);
      if (u) {
        logger.action("Login", { source: "App", metadata: { uid: u.uid } });
      } else {
        logger.action("Logout", { source: "App" });
      }
    });
    return () => unsubscribe();
  }, [setUser, setLoading]);

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

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const promise = listen<ModuleExitEvent>("module-exited", (event) => {
      const { moduleId, durationMs } = event.payload;
      if (durationMs <= 0) return;
      recordPlaytime(uid, moduleId, durationMs).catch((err) =>
        console.warn("[playtime] write failed:", err),
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
  const [allModules, setAllModules] = useState<LauncherModule[]>([]);
  const [playtime, setPlaytime] = useState<PlaytimeEntry[]>([]);
  const [conversations, setConversations] = useState<ConversationT[]>([]);
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  // Tracks whether the Firestore listener has delivered its first snapshot.
  // Until then, `unlockedSet` is empty and we MUST NOT evaluate achievements,
  // otherwise every already-unlocked achievement gets toasted on each boot.
  const [unlockedSetPrimed, setUnlockedSetPrimed] = useState(false);
  const [allUsers, setAllUsers] = useState<UserPresenceT[]>([]);
  // Session-level guard against re-toasting an achievement multiple times.
  // The Firestore-derived `unlockedSet` should already prevent this, but if
  // the snapshot listener is delayed (e.g. rules issue, network blip), the
  // effect fires multiple times before the unlock doc is read back. This
  // ref ensures each achievement is announced at most once per app session,
  // regardless of Firestore state.
  const toastedThisSession = useRef<Set<string>>(new Set());

  useEffect(() => watchModules(setAllModules), []);
  useEffect(() => watchAllUsers(setAllUsers), []);
  useEffect(() => {
    if (!user) return;
    return watchPlaytime(user.uid, setPlaytime);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    return watchConversationsFor(user.uid, setConversations);
  }, [user]);
  useEffect(() => {
    if (!user) {
      setUnlockedSetPrimed(false);
      return;
    }
    setUnlockedSetPrimed(false);
    return watchAchievements(user.uid, (list) => {
      setUnlockedSet(new Set(list.map((u) => u.id)));
      setUnlockedSetPrimed(true);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Hard gate: don't even *consider* toasting achievements before we know
    // which ones are already unlocked in Firestore. Otherwise the catalog
    // gets re-toasted on every launch.
    if (!unlockedSetPrimed) return;
    // Build context fresh from the latest snapshots
    const distinctChatPartners = new Set(
      conversations.flatMap((c) => c.participants.filter((p) => p && p !== user.uid)),
    ).size;
    const onlineUsersCount = allUsers.filter((u) => {
      if (!u.lastSeen) return false;
      return Date.now() - u.lastSeen < 60_000;
    }).length;
    const totalLaunches = playtime.reduce((s, p) => s + p.totalLaunches, 0);
    const ctx: AchievementContext = {
      modules: allModules,
      installedCount: 0, // not tracked server-side; using playtime-based proxy
      playtime,
      conversations,
      distinctChatPartners,
      onlineUsersCount,
      // Total messages sent — approximated as 1 per "I have a lastMessage I authored"
      // (real counter would require a sentCount field on Conversation; left as
      // a TODO for a future refactor). For now this gives 0/1 per conversation.
      totalMessagesSent: conversations.filter(
        (c) => c.lastMessage?.senderUid === user.uid,
      ).length,
      totalLaunches,
    };
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
        pushAchievementToast(ach.id);
        logger.action(`Achievement débloqué : ${ach.title}`, {
          source: "App.achievements",
          metadata: { achievementId: ach.id, tier: ach.tier },
        });
      }
    }
  }, [user, allModules, allUsers, playtime, conversations, unlockedSet, unlockedSetPrimed]);

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
      <AppShell />
      <AchievementUnlockToastHost />
      <InvitationPopupHost />
      <LiveActivityToastHost />
    </>
  );
}

export default App;
