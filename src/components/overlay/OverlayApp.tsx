import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { onAuthStateChanged } from "firebase/auth";
import { Users, MessageCircle, X, Gamepad2, Bell } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getFirebase } from "@/firebase/config";
import { useUsers, useConversations, useNotifications } from "@/store/firebaseStores";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import { statusFromLastSeen, type UserPresence, type PresenceStatus } from "@/firebase/presence";
import { useTickEvery } from "@/hooks/useTickEvery";
import { otherParticipant, unreadCount } from "@/types/messaging";
import { cn } from "@/lib/cn";

/**
 * Lightweight overlay shown over the active game when the user
 * presses their global hotkey (default Ctrl+Shift+O). The window
 * itself is transparent + always-on-top, so this React tree paints
 * over whatever borderless game is in the foreground.
 *
 * Three tabs at the top :
 *   - Friends : compact online list, click to start a DM
 *   - Messages : recent conversations + unread badges
 *   - Notifs : friend launches / new DMs / system events
 *
 * The "Close" button calls `overlay_hide` (a Tauri command) instead
 * of closing the window outright — we want to preserve the webview
 * so the next hotkey press is instant (no React re-mount).
 */
export function OverlayApp() {
  // Bridge Firebase Auth → Zustand store. Tauri renders this overlay
  // in a separate webview from the main window, so the in-memory
  // Zustand state isn't shared. The Firebase Auth session itself is
  // (it's persisted via IndexedDB on the same origin), so listening
  // to onAuthStateChanged here picks up the same user the main
  // window already authenticated — no re-login needed.
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
  const [tab, setTab] = useState<"friends" | "messages" | "notifs">("friends");

  const handleClose = () => {
    void invoke("overlay_hide");
  };

  return (
    <div
      className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-bg-soft/85 text-fg-primary shadow-[0_30px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
      data-tauri-drag-region
    >
      {/* Drag handle / header */}
      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent-glow)]" />
          <span className="font-display text-sm tracking-wider text-fg-primary">
            Simple Launcher
          </span>
        </div>
        <button
          onClick={handleClose}
          className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
          title="Fermer (le hotkey la rouvre)"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-white/[0.05]">
        <TabButton
          icon={<Users className="size-3.5" />}
          label="Amis"
          active={tab === "friends"}
          onClick={() => setTab("friends")}
        />
        <TabButton
          icon={<MessageCircle className="size-3.5" />}
          label="Messages"
          active={tab === "messages"}
          onClick={() => setTab("messages")}
        />
        <TabButton
          icon={<Bell className="size-3.5" />}
          label="Notifs"
          active={tab === "notifs"}
          onClick={() => setTab("notifs")}
        />
      </div>

      {/* Body */}
      <div className="scroll-y-only flex-1">
        {!me ? (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-fg-muted">
            Connecte-toi dans le launcher pour utiliser l'overlay.
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "friends" && <FriendsTab meUid={me.uid} />}
              {tab === "messages" && <MessagesTab meUid={me.uid} />}
              {tab === "notifs" && <NotifsTab meUid={me.uid} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 border-t border-white/[0.05] px-4 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        ctrl+shift+o pour fermer
      </div>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "no-drag flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors",
        active
          ? "border-b-2 border-accent text-accent"
          : "border-b-2 border-transparent text-fg-muted hover:text-fg-primary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Friends tab ────────────────────────────────────────────────────────

function FriendsTab({ meUid }: { meUid: string }) {
  const users = useUsers();
  const now = useTickEvery(15_000);
  const friends = useMemo(() => {
    const order: Record<PresenceStatus, number> = { online: 0, idle: 1, offline: 2 };
    return users
      .filter((u) => u.uid !== meUid)
      .map((u) => ({ user: u, status: statusFromLastSeen(u.lastSeen, now) }))
      .filter((s) => s.status !== "offline")
      .sort((a, b) => order[a.status] - order[b.status] || (b.user.lastSeen ?? 0) - (a.user.lastSeen ?? 0));
  }, [users, meUid, now]);

  if (friends.length === 0) {
    return (
      <div className="grid h-32 place-items-center px-4 text-center text-xs text-fg-muted">
        Personne d'autre n'est en ligne pour le moment.
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2">
      {friends.map(({ user, status }) => (
        <FriendRow key={user.uid} user={user} status={status} />
      ))}
    </div>
  );
}

function FriendRow({ user, status }: { user: UserPresence; status: PresenceStatus }) {
  const dot =
    status === "online"
      ? "bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
      : "bg-amber-400";
  return (
    <div className="no-drag flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
      <div className="relative shrink-0">
        <TierAvatar
          tier={user.tier}
          src={user.avatarUrl}
          displayName={user.displayName ?? user.username ?? "?"}
          size="sm"
        />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-bg-soft",
            dot,
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <TierName
          tier={user.tier}
          name={user.displayName ?? user.username ?? "Anonyme"}
          className="block truncate text-xs font-medium text-fg-primary"
        />
        {user.currentActivity && status === "online" ? (
          <div className="flex items-center gap-1 text-[10px] text-emerald-300">
            <Gamepad2 className="size-2.5" />
            <span className="truncate">{user.currentActivity.moduleName}</span>
          </div>
        ) : (
          <div className="text-[10px] text-fg-dim">
            {status === "online" ? "En ligne" : "Inactif"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Messages tab ───────────────────────────────────────────────────────

function MessagesTab({ meUid }: { meUid: string }) {
  const conversations = useConversations(meUid);
  const users = useUsers();
  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          (b.lastMessage?.sentAt ?? b.updatedAt ?? 0) -
          (a.lastMessage?.sentAt ?? a.updatedAt ?? 0),
      ),
    [conversations],
  );

  if (sorted.length === 0) {
    return (
      <div className="grid h-32 place-items-center px-4 text-center text-xs text-fg-muted">
        Aucune conversation.
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2">
      {sorted.slice(0, 12).map((c) => {
        const peerUid = otherParticipant(c, meUid);
        const peerName = c.participantNames[peerUid] ?? "Inconnu";
        const peerAvatar = c.participantAvatars[peerUid] ?? null;
        const peerTier = users.find((u) => u.uid === peerUid)?.tier ?? null;
        const unread = unreadCount(c, meUid);
        const last = c.lastMessage;
        const isMine = last?.senderUid === meUid;
        return (
          <div
            key={c.id}
            className="no-drag flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
          >
            <TierAvatar
              tier={peerTier}
              src={peerAvatar}
              displayName={peerName}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-xs",
                    unread > 0
                      ? "font-semibold text-fg-primary"
                      : "font-medium text-fg-primary",
                  )}
                >
                  {peerName}
                </span>
                {unread > 0 && (
                  <span className="grid size-4 min-w-4 shrink-0 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-bg-base">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </div>
              <div className="truncate text-[10px] text-fg-muted">
                {last
                  ? (isMine ? "Toi : " : "") + last.text
                  : "Aucun message"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Notifs tab ─────────────────────────────────────────────────────────

function NotifsTab({ meUid }: { meUid: string }) {
  const notifs = useNotifications(meUid);
  const recent = useMemo(
    () =>
      [...notifs]
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
        .slice(0, 20),
    [notifs],
  );

  if (recent.length === 0) {
    return (
      <div className="grid h-32 place-items-center px-4 text-center text-xs text-fg-muted">
        Aucune notification récente.
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2">
      {recent.map((n) => (
        <div
          key={n.id}
          className={cn(
            "no-drag rounded-lg px-3 py-2 ring-1 ring-white/[0.04]",
            n.readAtMs == null ? "bg-accent/[0.05]" : "bg-bg-base/30",
          )}
        >
          <div className="text-xs font-medium text-fg-primary">
            {n.title ?? "Notification"}
          </div>
          {n.description && (
            <div className="mt-0.5 line-clamp-2 text-[11px] text-fg-muted">
              {n.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
