import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged } from "firebase/auth";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalPosition, type PhysicalSize } from "@tauri-apps/api/dpi";
import { Gamepad2, MessageCircle, UserPlus } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getFirebase } from "@/firebase/config";
import { useUsers, useConversations } from "@/store/firebaseStores";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import {
  statusFromLastSeen,
  type UserPresence,
  type PresenceStatus,
} from "@/firebase/presence";
import { otherParticipant } from "@/types/messaging";
import { sounds } from "@/lib/sounds";
import {
  getToastsEnabled,
  getToastsKindEnabled,
  type ToastKind,
} from "@/lib/toasts";
import { cn } from "@/lib/cn";
import type { SupporterTier } from "@/lib/supporterTier";

/**
 * In-game toast notifications — Phase 2 of the overlay feature.
 *
 * Renders a vertical stack of small notification cards that pop in
 * from the right edge of the screen, hover for ~4 s, then slide
 * out. The window itself is click-through (setIgnoreCursorEvents
 * true) so the user can keep playing without the toasts intercepting
 * mouse / keyboard input.
 *
 * Three kinds of events trigger a toast :
 *   - `friend-online`  : a friend transitions offline → online
 *   - `friend-launched`: a friend just started playing a game
 *   - `message`        : an incoming DM from another user
 *
 * Each kind can be toggled in Settings → Overlay (cf. `lib/toasts.ts`).
 *
 * The window stays mounted for the whole launcher session — it's
 * hidden by default (visible: false in tauri.conf.json) and shown
 * once the React app has booted, positioned at the bottom-right of
 * the primary monitor with click-through enabled.
 */
type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  subtitle?: string;
  avatarUrl: string | null;
  displayName: string | null;
  tier: SupporterTier | null;
};

const MAX_VISIBLE_TOASTS = 5;
const TOAST_LIFETIME_MS = 4500;

export function ToastsApp() {
  // Auth bridge — same as OverlayApp. The Firebase Auth session
  // persists in IndexedDB so this picks up the same user the main
  // window logged in.
  useEffect(() => {
    const fb = getFirebase();
    if (!fb) return;
    return onAuthStateChanged(fb.auth, (u) => {
      const set = useAuthStore.getState();
      if (u) set.setUser(u);
      else set.setUser(null);
    });
  }, []);

  const me = useAuthStore((s) => s.user);

  // Position the window bottom-right of the primary monitor, set
  // it click-through, then show it. We do this only once after
  // boot — moving the window during runtime would be jittery.
  const positionedRef = useRef(false);
  useEffect(() => {
    if (positionedRef.current) return;
    positionedRef.current = true;
    void positionAndShow();
  }, []);

  const [toasts, setToasts] = useState<Toast[]>([]);

  /** Pushes a toast to the queue and schedules its removal. */
  const pushToast = (t: Toast) => {
    if (!getToastsEnabled() || !getToastsKindEnabled(t.kind)) return;
    setToasts((prev) => {
      const next = [...prev, t];
      // Keep the queue bounded — older toasts get evicted instantly
      // (rare in practice : you'd need 5 events within 4 s).
      return next.length > MAX_VISIBLE_TOASTS
        ? next.slice(next.length - MAX_VISIBLE_TOASTS)
        : next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, TOAST_LIFETIME_MS);
    // Subtle ping when a toast appears — uses the existing Soft Lofi
    // chime so it stays consistent with the rest of the launcher.
    if (t.kind === "message") sounds.messageReceived();
    else sounds.notification();
  };

  // Detector hooks — only run when we have an authed user.
  useFriendOnlineDetector(me?.uid ?? null, pushToast);
  useFriendLaunchedDetector(me?.uid ?? null, pushToast);
  useNewMessageDetector(me?.uid ?? null, pushToast);

  return (
    <div className="flex h-full flex-col-reverse items-end gap-2 p-3">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Tauri window setup ─────────────────────────────────────────────────

async function positionAndShow() {
  try {
    const win = getCurrentWindow();
    // Click-through everywhere — the toasts are purely informative
    // and shouldn't intercept input. User opens the overlay (Shift+F9)
    // if they want to interact.
    await win.setIgnoreCursorEvents(true);

    // Position bottom-right of the primary monitor with a 24 px margin.
    // We have to read the actual window size (not what we wrote in
    // tauri.conf.json) because DPI scaling can offset it.
    const monitor = await currentMonitor();
    if (!monitor) {
      await win.show();
      return;
    }
    const size: PhysicalSize = await win.outerSize();
    const dpi = monitor.scaleFactor ?? 1;
    const margin = 24;
    const x =
      monitor.position.x + monitor.size.width - size.width - Math.round(margin * dpi);
    const y =
      monitor.position.y + monitor.size.height - size.height - Math.round(margin * dpi);
    await win.setPosition(
      new LogicalPosition(Math.round(x / dpi), Math.round(y / dpi)),
    );
    await win.setAlwaysOnTop(true);
    await win.show();
  } catch (err) {
    console.warn("[toasts] positionAndShow failed:", err);
  }
}

// ─── Toast item ─────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const Icon =
    toast.kind === "message"
      ? MessageCircle
      : toast.kind === "friend-launched"
        ? Gamepad2
        : UserPlus;
  const accent =
    toast.kind === "message"
      ? "text-accent ring-accent/40 bg-accent/[0.08]"
      : toast.kind === "friend-launched"
        ? "text-emerald-300 ring-emerald-400/40 bg-emerald-400/[0.08]"
        : "text-cyan-300 ring-cyan-400/40 bg-cyan-400/[0.08]";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-bg-soft/90 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl ring-1",
          accent,
        )}
      >
        <Icon className="size-4" />
      </div>
      <TierAvatar
        tier={toast.tier}
        src={toast.avatarUrl}
        displayName={toast.displayName ?? "?"}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <TierName
            tier={toast.tier}
            name={toast.displayName ?? "Anonyme"}
            className="truncate font-semibold text-fg-primary"
          />
        </div>
        <div className="truncate text-[11px] text-fg-muted">{toast.title}</div>
        {toast.subtitle && (
          <div className="truncate text-[10px] text-fg-dim">{toast.subtitle}</div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Detectors ─────────────────────────────────────────────────────────

/**
 * Fires a toast when a friend transitions offline → online. The
 * `lastStatusRef` map keeps the previous status of every user we've
 * seen ; on the *first* render we just snapshot without firing
 * (otherwise every booted user would trigger a notification).
 */
function useFriendOnlineDetector(
  meUid: string | null,
  push: (t: Toast) => void,
) {
  const users = useUsers();
  const lastStatusRef = useRef<Map<string, PresenceStatus>>(new Map());

  useEffect(() => {
    if (!meUid) {
      lastStatusRef.current.clear();
      return;
    }
    const last = lastStatusRef.current;
    const isFirst = last.size === 0;
    for (const u of users) {
      if (u.uid === meUid) continue;
      const status = statusFromLastSeen(u.lastSeen);
      const prev = last.get(u.uid);
      if (!isFirst && prev !== "online" && status === "online") {
        push(toastFromUser(u, "friend-online", "vient de passer en ligne"));
      }
      last.set(u.uid, status);
    }
  }, [users, meUid, push]);
}

/**
 * Fires a toast when a friend transitions from "not playing" to
 * "playing some game". Uses the `currentActivity` field on the user
 * presence doc which the launcher heartbeat updates.
 */
function useFriendLaunchedDetector(
  meUid: string | null,
  push: (t: Toast) => void,
) {
  const users = useUsers();
  const lastActivityRef = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!meUid) {
      lastActivityRef.current.clear();
      return;
    }
    const last = lastActivityRef.current;
    const isFirst = last.size === 0;
    for (const u of users) {
      if (u.uid === meUid) continue;
      const cur = u.currentActivity?.moduleName ?? null;
      const prev = last.get(u.uid) ?? null;
      // Trigger on null → set transition (game just started). Skip
      // changes between two games (e.g. the user switched titles)
      // to avoid spam if someone alt-tabs across modules quickly.
      if (!isFirst && prev == null && cur != null) {
        push(
          toastFromUser(u, "friend-launched", `joue à ${cur}`, "vient de lancer un jeu"),
        );
      }
      last.set(u.uid, cur);
    }
  }, [users, meUid, push]);
}

/**
 * Fires a toast when a new message lands in any of the user's
 * conversations from someone other than themselves. We diff each
 * conversation's `lastMessage.sentAt` against the previously-seen
 * timestamp — if the new sentAt is strictly greater AND it's not
 * from us, it's a brand new incoming message worth toasting.
 */
function useNewMessageDetector(meUid: string | null, push: (t: Toast) => void) {
  const conversations = useConversations(meUid);
  const users = useUsers();
  const lastSentAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!meUid) {
      lastSentAtRef.current.clear();
      return;
    }
    const last = lastSentAtRef.current;
    const isFirst = last.size === 0;
    for (const c of conversations) {
      const lm = c.lastMessage;
      if (!lm) continue;
      const prevSentAt = last.get(c.id) ?? 0;
      if (!isFirst && lm.senderUid !== meUid && lm.sentAt > prevSentAt) {
        const peerUid = otherParticipant(c, meUid);
        const peer = users.find((u) => u.uid === peerUid);
        const peerName =
          c.participantNames[peerUid] ?? peer?.displayName ?? "Anonyme";
        const peerAvatar =
          c.participantAvatars[peerUid] ?? peer?.avatarUrl ?? null;
        const peerTier = peer?.tier ?? null;
        push({
          id: `msg-${c.id}-${lm.sentAt}`,
          kind: "message",
          title: lm.text.slice(0, 100),
          avatarUrl: peerAvatar,
          displayName: peerName,
          tier: peerTier,
        });
      }
      last.set(c.id, lm.sentAt);
    }
  }, [conversations, users, meUid, push]);
}

function toastFromUser(
  u: UserPresence,
  kind: ToastKind,
  title: string,
  subtitle?: string,
): Toast {
  return {
    id: `${kind}-${u.uid}-${Date.now()}`,
    kind,
    title,
    subtitle,
    avatarUrl: u.avatarUrl,
    displayName: u.displayName ?? u.username ?? "Anonyme",
    tier: u.tier,
  };
}
