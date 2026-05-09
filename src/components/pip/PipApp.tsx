import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { onAuthStateChanged } from "firebase/auth";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import {
  Bell,
  Trophy,
  Users,
  X,
  Gamepad2,
  MessageCircle,
  Pin,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getFirebase } from "@/firebase/config";
import {
  watchAllUsers,
  statusFromLastSeen,
  type UserPresence,
} from "@/firebase/presence";
import {
  watchNotifications,
  type AppNotification,
} from "@/firebase/notifications";
import { savePipBounds, loadPipBounds } from "@/lib/pip";
import { cn } from "@/lib/cn";

/**
 * Picture-in-Picture mini-feed.
 *
 * Affichage compact, always-on-top, transparent fond. 3 sections :
 *   1. Amis online (avatars + status dot)
 *   2. Dernières notifications (5 max)
 *   3. Footer drag-region + bouton fermer
 *
 * Persiste la position au resize/drag → relance avec la même position.
 * Le user peut épingler la PiP via le bouton 📌 — quand épinglée, elle
 * stay always-on-top même si l'overlay/main passent au front (default
 * Tauri behavior). Désépingler = peut passer derrière (utile si la PiP
 * gêne la vision du jeu).
 */
export function PipApp() {
  const [me, setMe] = useState<{ uid: string } | null>(null);
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [pinned, setPinned] = useState(true);

  // Auth bridge — pareil que ToastsApp / OverlayApp.
  useEffect(() => {
    const fb = getFirebase();
    if (!fb) return;
    return onAuthStateChanged(fb.auth, (u) => {
      const set = useAuthStore.getState();
      if (u) {
        set.setUser(u);
        setMe({ uid: u.uid });
      } else {
        set.setUser(null);
        setMe(null);
      }
    });
  }, []);

  // Watch all users (pour les amis online) + notifs perso.
  useEffect(() => {
    if (!me) return;
    const unsubUsers = watchAllUsers(setUsers);
    const unsubNotifs = watchNotifications(me.uid, setNotifs, 10);
    return () => {
      unsubUsers();
      unsubNotifs();
    };
  }, [me]);

  // Setup window au boot — restore bounds persistées si dispo.
  const positionedRef = useRef(false);
  useEffect(() => {
    if (positionedRef.current) return;
    positionedRef.current = true;
    void restoreBounds();
  }, []);

  // Persist bounds à chaque resize/drag — debounced 400ms.
  useEffect(() => {
    let timer: number | undefined;
    const win = getCurrentWindow();
    const persist = async () => {
      try {
        const pos = await win.outerPosition();
        const size = await win.innerSize();
        savePipBounds({ x: pos.x, y: pos.y, w: size.width, h: size.height });
      } catch {
        /* silent */
      }
    };
    const queue = () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(persist, 400);
    };
    const unsub1 = win.onMoved(queue);
    const unsub2 = win.onResized(queue);
    return () => {
      void unsub1.then((f) => f());
      void unsub2.then((f) => f());
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Filter friends online (status !== offline) excluding self.
  const onlineFriends = users
    .filter((u) => u.uid !== me?.uid && statusFromLastSeen(u.lastSeen) !== "offline")
    .slice(0, 6);

  const togglePinned = async () => {
    const next = !pinned;
    setPinned(next);
    try {
      await getCurrentWindow().setAlwaysOnTop(next);
    } catch {
      /* silent */
    }
  };

  const closePip = async () => {
    try {
      await getCurrentWindow().hide();
    } catch {
      /* silent */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-bg-soft/95 ring-1 ring-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
    >
      {/* Header drag-region + actions */}
      <header
        data-tauri-drag-region
        className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2"
      >
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
          <Gamepad2 className="size-3.5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1" data-tauri-drag-region>
          <div className="text-[11px] uppercase tracking-[0.2em] text-fg-dim">
            Simple Launcher
          </div>
          <div className="text-sm font-semibold text-fg-primary">PiP</div>
        </div>
        <button
          onClick={togglePinned}
          title={pinned ? "Désépingler (peut passer derrière)" : "Épingler (always-on-top)"}
          className={cn(
            "grid size-7 place-items-center rounded-md text-fg-muted transition",
            pinned ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "hover:bg-white/[0.06]",
          )}
        >
          <Pin className={cn("size-3.5", pinned && "fill-accent")} strokeWidth={2} />
        </button>
        <button
          onClick={closePip}
          title="Fermer"
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      {/* Body — scrollable feed */}
      <div className="info-scroll flex-1 overflow-y-auto p-3 space-y-4">
        {/* Section : amis online */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            <Users className="size-3" />
            Amis en ligne
            <span className="ml-auto rounded-full bg-bg-base/40 px-1.5 py-0.5 font-mono text-[9px] text-fg-muted">
              {onlineFriends.length}
            </span>
          </div>
          {onlineFriends.length === 0 ? (
            <div className="rounded-xl bg-bg-base/30 px-3 py-3 text-center text-[11px] text-fg-dim">
              Personne en ligne pour l'instant.
            </div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {onlineFriends.map((u) => (
                <FriendChip key={u.uid} user={u} />
              ))}
            </ul>
          )}
        </section>

        {/* Section : notifications récentes */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            <Bell className="size-3" />
            Récent
            {notifs.filter((n) => !n.readAtMs).length > 0 && (
              <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 font-mono text-[9px] text-bg-base">
                {notifs.filter((n) => !n.readAtMs).length}
              </span>
            )}
          </div>
          {notifs.length === 0 ? (
            <div className="rounded-xl bg-bg-base/30 px-3 py-3 text-center text-[11px] text-fg-dim">
              Pas de notif récente.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {notifs.slice(0, 5).map((n) => (
                <NotifRow key={n.id} notif={n} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Footer — info subtile */}
      <footer className="border-t border-white/[0.06] px-3 py-1.5 text-center text-[9px] text-fg-dim">
        Drag depuis le header · Toggle dans Settings
      </footer>
    </motion.div>
  );
}

// ─── Tauri window setup ────────────────────────────────────────────────

async function restoreBounds() {
  try {
    const win = getCurrentWindow();
    const persisted = loadPipBounds();
    if (persisted) {
      // Apply persisted x/y/w/h. Ces coords sont en physical pixels
      // (pip_set_bounds Rust côté backend), mais ici on les reapply
      // via les API window typed comme Logical → conversion DPI.
      try {
        const monitor = await currentMonitor();
        const dpi = monitor?.scaleFactor ?? 1;
        await win.setPosition(
          new LogicalPosition(
            Math.round(persisted.x / dpi),
            Math.round(persisted.y / dpi),
          ),
        );
        await win.setSize(
          new LogicalSize(
            Math.round(persisted.w / dpi),
            Math.round(persisted.h / dpi),
          ),
        );
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[pip] restoreBounds failed:", err);
  }
}

// ─── Sub-components ────────────────────────────────────────────────────

function FriendChip({ user }: { user: UserPresence }) {
  const status = statusFromLastSeen(user.lastSeen);
  const dot =
    status === "online"
      ? "bg-emerald-400"
      : status === "idle"
        ? "bg-amber-400"
        : "bg-fg-dim";
  const initial = (user.displayName ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div
      className="relative inline-flex items-center gap-1.5 rounded-full bg-bg-base/40 py-1 pl-1 pr-2.5 ring-1 ring-white/[0.06]"
      title={
        user.currentActivity?.moduleName
          ? `${user.displayName ?? "Anonyme"} · joue à ${user.currentActivity.moduleName}`
          : (user.displayName ?? "Anonyme")
      }
    >
      <div className="relative shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="size-5 rounded-full ring-1 ring-white/10"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid size-5 place-items-center rounded-full bg-accent/20 text-[9px] font-semibold text-accent">
            {initial}
          </div>
        )}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-1 ring-bg-soft",
            dot,
          )}
        />
      </div>
      <span className="max-w-[5rem] truncate text-[11px] text-fg-primary">
        {user.displayName ?? "Anon"}
      </span>
    </div>
  );
}

function NotifRow({ notif }: { notif: AppNotification }) {
  const Icon =
    notif.kind === "achievement"
      ? Trophy
      : notif.kind === "friend"
        ? Users
        : notif.kind === "invitation"
          ? MessageCircle
          : Bell;
  const accent =
    notif.kind === "achievement"
      ? "text-amber-300 ring-amber-400/30 bg-amber-400/[0.08]"
      : notif.kind === "friend"
        ? "text-cyan-300 ring-cyan-400/30 bg-cyan-400/[0.08]"
        : notif.kind === "invitation"
          ? "text-accent ring-accent/30 bg-accent/[0.08]"
          : "text-fg-muted ring-white/[0.06] bg-bg-base/40";
  const unread = !notif.readAtMs;

  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg p-2 ring-1 transition",
        unread ? "bg-accent/[0.04] ring-accent/15" : "bg-bg-base/30 ring-white/[0.04]",
      )}
    >
      <div className={cn("grid size-7 shrink-0 place-items-center rounded-md ring-1", accent)}>
        <Icon className="size-3.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-fg-primary">
          {notif.title}
        </div>
        <div className="truncate text-[10px] text-fg-muted">{notif.description}</div>
      </div>
      {unread && (
        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      )}
    </li>
  );
}
