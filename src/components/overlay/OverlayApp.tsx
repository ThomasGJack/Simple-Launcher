import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { onAuthStateChanged } from "firebase/auth";
import {
  Users,
  MessageCircle,
  X,
  Gamepad2,
  Bell,
  ArrowLeft,
  Send,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getFirebase } from "@/firebase/config";
import {
  useUsers,
  useConversations,
  useNotifications,
} from "@/store/firebaseStores";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import {
  statusFromLastSeen,
  type UserPresence,
  type PresenceStatus,
} from "@/firebase/presence";
import { useTickEvery } from "@/hooks/useTickEvery";
import {
  ensureConversation,
  markConversationRead,
  sendMessage,
  watchMessages,
} from "@/firebase/messaging";
import {
  conversationIdFor,
  otherParticipant,
  unreadCount,
  type Conversation,
  type Message,
} from "@/types/messaging";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Lightweight overlay shown over the active game when the user
 * presses their global hotkey (default Shift+F9). The window
 * itself is transparent + always-on-top, so this React tree paints
 * over whatever borderless game is in the foreground.
 *
 * Three top-level tabs : Friends, Messages, Notifs. The Messages tab
 * is two-level — clicking a conversation drills into a thread view
 * with bubbles + composer, exactly like the main launcher's
 * MessagesPage but compact for the 420×600 px window. The Friends
 * tab also opens a thread directly (creates the conversation if it
 * doesn't exist yet).
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
  /** When set, the Messages tab shows the thread for that conversation
   *  instead of the conversation list. Clearing it (back button) brings
   *  the list back. */
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const handleClose = () => {
    void invoke("overlay_hide");
  };

  // Helper used by the Friends tab "click → open DM" action.
  const openConversationWith = async (peer: UserPresence) => {
    if (!me) return;
    const cid = conversationIdFor(me.uid, peer.uid);
    setTab("messages");
    setActiveConvId(cid);
    try {
      await ensureConversation({
        meUid: me.uid,
        meName: me.displayName ?? "Anonyme",
        meAvatar: me.photoURL ?? null,
        peerUid: peer.uid,
        peerName: peer.displayName ?? peer.username ?? "Anonyme",
        peerAvatar: peer.avatarUrl,
      });
      sounds.click();
    } catch (err) {
      console.warn("[overlay] open conversation failed:", err);
      sounds.error();
    }
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
          onClick={() => {
            setTab("friends");
            setActiveConvId(null);
          }}
        />
        <TabButton
          icon={<MessageCircle className="size-3.5" />}
          label="Messages"
          active={tab === "messages"}
          onClick={() => {
            setTab("messages");
            setActiveConvId(null);
          }}
        />
        <TabButton
          icon={<Bell className="size-3.5" />}
          label="Notifs"
          active={tab === "notifs"}
          onClick={() => {
            setTab("notifs");
            setActiveConvId(null);
          }}
        />
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!me ? (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-fg-muted">
            Connecte-toi dans le launcher pour utiliser l'overlay.
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab + (activeConvId ? `:${activeConvId}` : "")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {tab === "friends" && (
                <FriendsTab
                  meUid={me.uid}
                  onPickFriend={openConversationWith}
                />
              )}
              {tab === "messages" && activeConvId === null && (
                <MessagesListTab
                  meUid={me.uid}
                  onSelectConv={(cid) => setActiveConvId(cid)}
                />
              )}
              {tab === "messages" && activeConvId !== null && (
                <ConversationThread
                  convId={activeConvId}
                  meUid={me.uid}
                  onBack={() => setActiveConvId(null)}
                />
              )}
              {tab === "notifs" && <NotifsTab meUid={me.uid} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 border-t border-white/[0.05] px-4 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        Shift+F9 pour fermer · drag pour déplacer
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

function FriendsTab({
  meUid,
  onPickFriend,
}: {
  meUid: string;
  onPickFriend: (user: UserPresence) => void;
}) {
  const users = useUsers();
  const now = useTickEvery(15_000);
  const friends = useMemo(() => {
    const order: Record<PresenceStatus, number> = {
      online: 0,
      idle: 1,
      offline: 2,
    };
    return users
      .filter((u) => u.uid !== meUid)
      .map((u) => ({ user: u, status: statusFromLastSeen(u.lastSeen, now) }))
      .filter((s) => s.status !== "offline")
      .sort(
        (a, b) =>
          order[a.status] - order[b.status] ||
          (b.user.lastSeen ?? 0) - (a.user.lastSeen ?? 0),
      );
  }, [users, meUid, now]);

  if (friends.length === 0) {
    return (
      <div className="scroll-y-only flex-1">
        <div className="grid h-32 place-items-center px-4 text-center text-xs text-fg-muted">
          Personne d'autre n'est en ligne pour le moment.
        </div>
      </div>
    );
  }
  return (
    <div className="scroll-y-only flex-1 space-y-1 p-2">
      {friends.map(({ user, status }) => (
        <FriendRow
          key={user.uid}
          user={user}
          status={status}
          onClick={() => onPickFriend(user)}
        />
      ))}
    </div>
  );
}

function FriendRow({
  user,
  status,
  onClick,
}: {
  user: UserPresence;
  status: PresenceStatus;
  onClick: () => void;
}) {
  const dot =
    status === "online"
      ? "bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
      : "bg-amber-400";
  return (
    <button
      onClick={onClick}
      className="no-drag flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
      title={`Envoyer un message à ${user.displayName ?? user.username ?? "ce pote"}`}
    >
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
      <MessageCircle className="size-3.5 shrink-0 text-fg-dim" />
    </button>
  );
}

// ─── Messages list (level 1) ────────────────────────────────────────────

function MessagesListTab({
  meUid,
  onSelectConv,
}: {
  meUid: string;
  onSelectConv: (convId: string) => void;
}) {
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
      <div className="scroll-y-only flex-1">
        <div className="grid h-32 place-items-center px-4 text-center text-xs text-fg-muted">
          Aucune conversation.
        </div>
      </div>
    );
  }
  return (
    <div className="scroll-y-only flex-1 space-y-1 p-2">
      {sorted.map((c) => {
        const peerUid = otherParticipant(c, meUid);
        const peerName = c.participantNames[peerUid] ?? "Inconnu";
        const peerAvatar = c.participantAvatars[peerUid] ?? null;
        const peerTier = users.find((u) => u.uid === peerUid)?.tier ?? null;
        const unread = unreadCount(c, meUid);
        const last = c.lastMessage;
        const isMine = last?.senderUid === meUid;
        return (
          <button
            key={c.id}
            onClick={() => {
              sounds.click();
              onSelectConv(c.id);
            }}
            className="no-drag flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
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
          </button>
        );
      })}
    </div>
  );
}

// ─── Conversation thread (level 2) ──────────────────────────────────────

function ConversationThread({
  convId,
  meUid,
  onBack,
}: {
  convId: string;
  meUid: string;
  onBack: () => void;
}) {
  const me = useAuthStore((s) => s.user)!;
  const conversations = useConversations(meUid);
  const users = useUsers();
  const conv: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === convId),
    [conversations, convId],
  );
  const peerUid = conv ? otherParticipant(conv, meUid) : null;
  const peer = peerUid ? users.find((u) => u.uid === peerUid) : null;
  const peerName =
    (conv && peerUid && conv.participantNames[peerUid]) ??
    peer?.displayName ??
    "Inconnu";
  const peerAvatar =
    (conv && peerUid && conv.participantAvatars[peerUid]) ??
    peer?.avatarUrl ??
    null;
  const peerTier = peer?.tier ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  // Subscribe to message stream for this conversation. Cleanup on
  // back / unmount.
  useEffect(() => {
    return watchMessages(convId, (next) => {
      setMessages(next);
      const newest = next[next.length - 1];
      if (
        newest &&
        newest.id !== lastSeenIdRef.current &&
        newest.senderUid !== meUid &&
        lastSeenIdRef.current !== null
      ) {
        sounds.messageReceived();
      }
      if (newest) lastSeenIdRef.current = newest.id;
    });
  }, [convId, meUid]);

  // Mark read whenever a new message lands while we're in the thread.
  useEffect(() => {
    markConversationRead(convId, meUid).catch(() => {});
  }, [convId, meUid, messages.length]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendMessage({
        conversationId: convId,
        senderUid: meUid,
        senderName: me.displayName ?? "Anonyme",
        senderAvatar: me.photoURL ?? null,
        text,
      });
      sounds.click();
    } catch (err) {
      console.warn("[overlay] send failed:", err);
      sounds.error();
      setDraft(text); // restore draft
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thread header — back button + peer */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] px-3 py-2">
        <button
          onClick={() => {
            sounds.click();
            onBack();
          }}
          className="no-drag grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
          title="Retour à la liste"
        >
          <ArrowLeft className="size-4" />
        </button>
        <TierAvatar
          tier={peerTier}
          src={peerAvatar}
          displayName={peerName}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <TierName
            tier={peerTier}
            name={peerName}
            className="block truncate text-xs font-medium text-fg-primary"
          />
          {peer?.currentActivity ? (
            <div className="flex items-center gap-1 text-[10px] text-emerald-300">
              <Gamepad2 className="size-2.5" />
              <span className="truncate">{peer.currentActivity.moduleName}</span>
            </div>
          ) : (
            <div className="text-[10px] text-fg-dim">Conversation privée</div>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div ref={scrollRef} className="scroll-y-only flex-1 px-3 py-3">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-[11px] text-fg-muted">
            Première conversation avec{" "}
            <strong className="ml-1 text-fg-primary">{peerName}</strong>. Dis
            bonjour ! 👋
          </div>
        ) : (
          <div className="space-y-1.5">
            {messages.map((msg, i) => {
              const isMine = msg.senderUid === meUid;
              const prev = messages[i - 1];
              const grouped =
                !!prev &&
                prev.senderUid === msg.senderUid &&
                msg.sentAt - prev.sentAt < 2 * 60 * 1000;
              return (
                <Bubble
                  key={msg.id}
                  message={msg}
                  isMine={isMine}
                  grouped={grouped}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/[0.05] bg-bg-soft/40 p-2">
        <form
          className="no-drag flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message à ${peerName}…`}
            disabled={sending}
            maxLength={2000}
            className="no-drag flex-1 rounded-lg bg-bg-base/60 px-3 py-2 text-xs text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className={cn(
              "no-drag grid size-8 shrink-0 place-items-center rounded-lg transition-all",
              draft.trim() && !sending
                ? "bg-accent text-bg-base shadow-[0_0_14px_var(--color-accent-soft)]"
                : "bg-white/[0.04] text-fg-dim ring-1 ring-white/[0.06]",
            )}
            aria-label="Envoyer"
          >
            <Send className="size-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({
  message,
  isMine,
  grouped,
}: {
  message: Message;
  isMine: boolean;
  grouped: boolean;
}) {
  return (
    <div
      className={cn(
        "flex",
        isMine ? "justify-end" : "justify-start",
        grouped ? "mt-0.5" : "mt-2",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] break-words rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
          isMine
            ? "bg-accent text-bg-base shadow-[0_0_8px_var(--color-accent-soft)] rounded-br-md"
            : "bg-bg-soft/80 text-fg-primary ring-1 ring-white/[0.06] rounded-bl-md",
        )}
        style={{ wordBreak: "break-word" }}
      >
        {message.text}
      </div>
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
        .slice(0, 30),
    [notifs],
  );

  if (recent.length === 0) {
    return (
      <div className="scroll-y-only flex-1">
        <div className="grid h-32 place-items-center px-4 text-center text-xs text-fg-muted">
          Aucune notification récente.
        </div>
      </div>
    );
  }
  return (
    <div className="scroll-y-only flex-1 space-y-1 p-2">
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
