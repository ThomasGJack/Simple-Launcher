import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Wifi, X } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import {
  watchAllUsers,
  statusFromLastSeen,
  type UserPresence,
} from "@/firebase/presence";
import { useUIStore } from "@/store/ui";
import { sounds } from "@/lib/sounds";

/**
 * Steam-like live activity feed. Listens to the global presence stream
 * and pushes a toast in the bottom-right whenever a friend:
 *   1. transitions from offline → online (just opened the launcher)
 *   2. starts playing a game (currentActivity null → set, or moduleId change)
 *
 * Throttled per-user (max 1 toast per friend per 30s) so a flapping
 * connection doesn't spam. Self-events are ignored. Boot snapshot is
 * skipped so opening the launcher doesn't immediately announce "X is
 * online" for everyone already there.
 */

type Toast = {
  id: string;
  uid: string;
  kind: "online" | "playing";
  userName: string;
  userAvatar: string | null;
  detail: string | null;
};

const THROTTLE_MS = 30_000;
const TOAST_DURATION_MS = 5500;

export function LiveActivityToastHost() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Last known state per uid — used to detect transitions. Populated
   *  with the first snapshot so the boot doesn't trigger a flood. */
  const lastState = useRef<Map<string, { online: boolean; moduleId: string | null }>>(new Map());
  /** Last toast time per uid — throttle key. */
  const lastToastAt = useRef<Map<string, number>>(new Map());
  /** Did we receive the very first snapshot yet? */
  const primed = useRef(false);

  useEffect(() => {
    return watchAllUsers((users) => {
      handleSnapshot(users, me?.uid ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.uid]);

  const handleSnapshot = (users: UserPresence[], myUid: string | null) => {
    const newToasts: Toast[] = [];
    const now = Date.now();

    for (const u of users) {
      if (u.uid === myUid) continue;
      const status = statusFromLastSeen(u.lastSeen);
      const isOnline = status === "online";
      const moduleId = u.currentActivity?.moduleId ?? null;
      const prev = lastState.current.get(u.uid);

      if (primed.current && prev) {
        const wasThrottled = (lastToastAt.current.get(u.uid) ?? 0) > now - THROTTLE_MS;
        // Honor the user's privacy settings — if they hid their activity,
        // don't broadcast their state changes either.
        const showActivity = u.privacy?.showActivity !== false;

        if (showActivity && !wasThrottled) {
          // Transition: offline/idle → online
          if (isOnline && !prev.online) {
            newToasts.push({
              id: `${u.uid}-online-${now}`,
              uid: u.uid,
              kind: "online",
              userName: u.displayName ?? "Quelqu'un",
              userAvatar: u.avatarUrl,
              detail: null,
            });
            lastToastAt.current.set(u.uid, now);
          }
          // Transition: started playing (or switched game)
          else if (moduleId && moduleId !== prev.moduleId) {
            newToasts.push({
              id: `${u.uid}-playing-${now}`,
              uid: u.uid,
              kind: "playing",
              userName: u.displayName ?? "Quelqu'un",
              userAvatar: u.avatarUrl,
              detail: u.currentActivity?.moduleName ?? "un jeu",
            });
            lastToastAt.current.set(u.uid, now);
          }
        }
      }

      lastState.current.set(u.uid, { online: isOnline, moduleId });
    }

    if (!primed.current) {
      primed.current = true;
      return;
    }

    if (newToasts.length > 0) {
      // Only emit a sound for the first toast of a batch (avoids cacophony).
      sounds.notification();
      setToasts((prev) => [...newToasts, ...prev].slice(0, 3));
    }
  };

  const dismiss = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // Auto-dismiss timers
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), TOAST_DURATION_MS),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [toasts]);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            layout
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            whileHover={{ y: -2 }}
            onClick={() => {
              dismiss(t.id);
              navigate({ name: "user-profile", uid: t.uid });
            }}
            className="no-drag pointer-events-auto flex w-72 items-center gap-3 rounded-2xl glass-strong p-3 text-left ring-1 ring-emerald-400/20 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="relative shrink-0">
              {t.userAvatar ? (
                <img
                  src={t.userAvatar}
                  alt=""
                  className="size-10 rounded-xl object-cover ring-1 ring-white/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="grid size-10 place-items-center rounded-xl bg-bg-elevated text-sm uppercase">
                  {t.userName.slice(0, 1)}
                </div>
              )}
              <div
                className={
                  "absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full ring-2 ring-bg-base " +
                  (t.kind === "playing" ? "bg-accent text-bg-base" : "bg-emerald-400 text-bg-base")
                }
              >
                {t.kind === "playing" ? (
                  <Play className="size-2.5 fill-current" strokeWidth={0} />
                ) : (
                  <Wifi className="size-2.5" strokeWidth={3} />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs uppercase tracking-wider text-emerald-300">
                {t.kind === "playing" ? "Lance un jeu" : "En ligne"}
              </div>
              <div className="truncate text-sm font-semibold text-fg-primary">
                {t.userName}
              </div>
              {t.detail && (
                <div className="truncate text-xs text-fg-muted">{t.detail}</div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
            >
              <X className="size-3.5" />
            </button>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
