import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, ArrowLeft, Search } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import {
  markConversationRead,
  sendMessage,
  watchConversationById,
  watchConversationsFor,
  watchMessages,
} from "@/firebase/messaging";
import {
  otherParticipant,
  unreadCount,
  type Conversation,
  type Message,
} from "@/types/messaging";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Two-pane chat page:
 *  - Left: conversation list (avatars + last message preview + unread badge)
 *  - Right: active conversation (messages bubbles + input)
 *
 * The active conversation is identified by `route.conversationId`. When
 * unset, the right pane shows an empty state inviting the user to pick or
 * start a chat from the Communauté page.
 */
export function MessagesPage() {
  const me = useAuthStore((s) => s.user);
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const activeId = route.name === "messages" ? route.conversationId : undefined;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  /**
   * Fallback subscription for the *currently selected* conversation.
   *
   * The list query (`array-contains`) sometimes lags by a couple of hundred
   * ms after creating a brand-new conversation — Firestore's local cache
   * has the doc, but with `updatedAt: serverTimestamp()` still pending,
   * which made the chat flash visible and then vanish.
   *
   * Subscribing directly to the doc by id covers that gap: as soon as the
   * doc exists (even with pending fields) we render the chat, no race.
   */
  const [directActiveConv, setDirectActiveConv] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!me) {
      setConversations([]);
      return;
    }
    return watchConversationsFor(me.uid, setConversations);
  }, [me?.uid]);

  useEffect(() => {
    if (!activeId) {
      setDirectActiveConv(null);
      return;
    }
    return watchConversationById(activeId, setDirectActiveConv);
  }, [activeId]);

  const activeConv = useMemo(
    () =>
      conversations.find((c) => c.id === activeId) ??
      (directActiveConv && directActiveConv.id === activeId ? directActiveConv : null),
    [conversations, activeId, directActiveConv],
  );

  if (!me) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="rounded-2xl glass p-8 text-center">
          <MessageCircle className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
          <p className="text-sm text-fg-muted">Connecte-toi pour accéder à la messagerie.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid h-full grid-cols-12 gap-0 overflow-hidden">
      {/* LEFT — conversation list */}
      <aside className="col-span-12 flex flex-col overflow-hidden border-r border-white/[0.04] bg-bg-soft/30 lg:col-span-4 xl:col-span-3">
        <header className="border-b border-white/[0.04] px-5 pb-4 pt-6">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
            <MessageCircle className="size-3" /> Messages
          </p>
          <h1 className="mt-1.5 font-display text-2xl text-fg-primary">Conversations</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {conversations.length === 0 ? (
            <div className="rounded-2xl bg-bg-base/40 p-5 text-center text-xs text-fg-muted ring-1 ring-white/[0.04]">
              <Search className="mx-auto mb-2 size-5 text-fg-dim" />
              Aucune conversation pour l'instant. Va sur <strong className="text-fg-primary">Communauté</strong> et clique sur le bouton « Message » d'un pote pour démarrer.
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  myUid={me.uid}
                  active={c.id === activeId}
                  onClick={() => {
                    sounds.click();
                    navigate({ name: "messages", conversationId: c.id });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT — active conversation */}
      <section className="col-span-12 flex flex-col overflow-hidden lg:col-span-8 xl:col-span-9">
        {activeConv ? (
          <ChatPanel conv={activeConv} myUid={me.uid} />
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                            CONVERSATION LIST
// ---------------------------------------------------------------------------

function ConversationRow({
  conv,
  myUid,
  active,
  onClick,
}: {
  conv: Conversation;
  myUid: string;
  active: boolean;
  onClick: () => void;
}) {
  const peerUid = otherParticipant(conv, myUid);
  const peerName = conv.participantNames[peerUid] ?? "Inconnu";
  const peerAvatar = conv.participantAvatars[peerUid] ?? null;
  const unread = unreadCount(conv, myUid);
  const last = conv.lastMessage;
  const isMine = last?.senderUid === myUid;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => sounds.hover()}
      className={cn(
        "no-drag group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        active
          ? "bg-accent/10 ring-1 ring-accent/30"
          : "hover:bg-white/[0.03]",
      )}
    >
      {peerAvatar ? (
        <img
          src={peerAvatar}
          alt=""
          className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
        />
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 font-display text-sm text-accent ring-1 ring-accent/20">
          {peerName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "truncate text-sm",
            unread > 0 ? "font-semibold text-fg-primary" : "font-medium text-fg-primary",
          )}>
            {peerName}
          </span>
          {last && (
            <span className="shrink-0 text-[10px] text-fg-dim">
              {formatRelative(last.sentAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn(
            "min-w-0 flex-1 truncate text-xs",
            unread > 0 ? "text-fg-primary" : "text-fg-muted",
          )}>
            {last
              ? (isMine ? "Toi : " : "") + last.text
              : <span className="italic text-fg-dim">Aucun message — dis bonjour 👋</span>}
          </span>
          {unread > 0 && (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-bg-base shadow-[0_0_10px_var(--color-accent-soft)]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
//                              CHAT PANEL
// ---------------------------------------------------------------------------

function ChatPanel({ conv, myUid }: { conv: Conversation; myUid: string }) {
  const me = useAuthStore((s) => s.user)!;
  const navigate = useUIStore((s) => s.navigate);
  const peerUid = otherParticipant(conv, myUid);
  const peerName = conv.participantNames[peerUid] ?? "Inconnu";
  const peerAvatar = conv.participantAvatars[peerUid] ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    return watchMessages(conv.id, (next) => {
      setMessages(next);
      // Play receive sound when a new message comes from the other side.
      const newest = next[next.length - 1];
      if (
        newest &&
        newest.id !== lastSeenIdRef.current &&
        newest.senderUid !== myUid &&
        lastSeenIdRef.current !== null // don't ding on the initial load
      ) {
        sounds.messageReceived();
      }
      if (newest) lastSeenIdRef.current = newest.id;
    });
  }, [conv.id, myUid]);

  // Mark conversation as read whenever it's open + a new message lands.
  useEffect(() => {
    markConversationRead(conv.id, myUid).catch(() => {});
  }, [conv.id, myUid, messages.length]);

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
        conversationId: conv.id,
        senderUid: myUid,
        senderName: me.displayName ?? "Anonyme",
        senderAvatar: me.photoURL ?? null,
        text,
      });
      sounds.click();
    } catch (err) {
      console.warn("[messaging] send failed:", err);
      sounds.error();
      setDraft(text); // restore draft on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — clicking on the avatar or name opens the peer's public
          profile. Convenient way to peek at their stats / achievements
          mid-conversation without losing the chat thread (the page key
          changes so the chat is preserved on back-nav). */}
      <header className="flex items-center gap-3 border-b border-white/[0.04] bg-bg-soft/40 px-5 py-3">
        <button
          onClick={() => navigate({ name: "messages" })}
          className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg-primary lg:hidden"
          aria-label="Retour à la liste"
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          onClick={() => navigate({ name: "user-profile", uid: peerUid })}
          className="no-drag flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.03]"
          title={`Voir le profil de ${peerName}`}
        >
          {peerAvatar ? (
            <img
              src={peerAvatar}
              alt=""
              className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 font-display text-accent ring-1 ring-accent/20">
              {peerName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-fg-primary">{peerName}</div>
            <div className="text-[10px] uppercase tracking-wider text-fg-dim">Conversation privée · Voir le profil</div>
          </div>
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs rounded-2xl bg-bg-base/40 p-6 text-center text-xs text-fg-muted ring-1 ring-white/[0.04]">
              <MessageCircle className="mx-auto mb-2 size-6 text-fg-dim" />
              Première conversation avec <strong className="text-fg-primary">{peerName}</strong>. Dis bonjour pour démarrer 👋
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, i) => {
              const isMine = msg.senderUid === myUid;
              const prev = messages[i - 1];
              // Group consecutive messages from the same sender within 2 min
              // → suppress avatar/name for grouped follow-ups.
              const grouped =
                prev &&
                prev.senderUid === msg.senderUid &&
                msg.sentAt - prev.sentAt < 2 * 60 * 1000;
              return (
                <Bubble
                  key={msg.id}
                  message={msg}
                  isMine={isMine}
                  grouped={!!grouped}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.04] bg-bg-soft/40 px-5 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Écris à ${peerName}…`}
            disabled={sending}
            className="no-drag w-full rounded-xl bg-bg-base/60 px-4 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className={cn(
              "no-drag grid size-10 shrink-0 place-items-center rounded-xl transition-all",
              draft.trim() && !sending
                ? "bg-accent text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]"
                : "bg-white/[0.04] text-fg-dim ring-1 ring-white/[0.06]",
            )}
            aria-label="Envoyer le message"
          >
            <Send className="size-4" />
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
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "flex items-end gap-2",
          isMine ? "flex-row-reverse" : "flex-row",
          grouped ? "mt-0.5" : "mt-3",
        )}
      >
        <div className={cn("size-7 shrink-0", grouped && "invisible")}>
          {message.senderAvatar ? (
            <img
              src={message.senderAvatar}
              alt=""
              className="size-7 rounded-md object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="grid size-7 place-items-center rounded-md bg-accent/15 text-[10px] font-display text-accent ring-1 ring-accent/20">
              {(message.senderName || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className={cn("flex max-w-[70%] flex-col", isMine ? "items-end" : "items-start")}>
          {!grouped && (
            <div className="mb-0.5 px-1 text-[10px] text-fg-dim">
              {isMine ? "Toi" : message.senderName} · {formatTime(message.sentAt)}
            </div>
          )}
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
              isMine
                ? "bg-accent text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] rounded-br-md"
                : "bg-bg-soft/80 text-fg-primary ring-1 ring-white/[0.06] rounded-bl-md",
            )}
            style={{ wordBreak: "break-word" }}
          >
            {message.text}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-12">
      <div className="max-w-md rounded-3xl glass-strong p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
          <MessageCircle className="size-6" />
        </div>
        <h2 className="font-display text-2xl text-fg-primary">Choisis une conversation</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Sélectionne une discussion à gauche, ou démarre-en une nouvelle depuis la page <strong className="text-fg-primary">Communauté</strong> en cliquant sur le bouton « Message » à côté d'un pote.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              HELPERS
// ---------------------------------------------------------------------------

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} h`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} j`;
  const date = new Date(ts);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
