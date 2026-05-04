import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, Pin, Search, X } from "lucide-react";
import {
  recordNotification,
} from "@/firebase/notifications";
import {
  sendChannelMessage,
  watchChannelMessages,
  watchPinnedMessages,
  type Crew,
  type CrewChannel,
  type CrewMessage,
  type CrewMember,
} from "@/firebase/crews";
import { MessageItem } from "@/components/crews/MessageItem";
import { MessageComposer } from "@/components/crews/MessageComposer";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Renders the messages pane for a single channel : pinned bar (when
 * non-empty) at the top, message list in the middle, composer at the
 * bottom. Live subscriptions for messages + pinned + reactions are
 * scoped to the (crewId, channelId) pair so they're torn down + re-
 * established whenever the user switches channels.
 */
export function ChannelView({
  crew,
  channel,
  myUid,
  myName,
  myAvatar,
  myMember,
}: {
  crew: Crew;
  channel: CrewChannel;
  myUid: string;
  myName: string | null;
  myAvatar: string | null;
  myMember: CrewMember | null;
}) {
  const [messages, setMessages] = useState<CrewMessage[]>([]);
  const [pinned, setPinned] = useState<CrewMessage[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<CrewMessage | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const crewId = crew.id;
  const channelId = channel.id;
  const amOwnerOrAdmin =
    myMember?.role === "owner" ||
    myMember?.role === "admin" ||
    crew.ownerUid === myUid;

  useEffect(
    () => watchChannelMessages(crewId, channelId, setMessages),
    [crewId, channelId],
  );
  useEffect(
    () => watchPinnedMessages(crewId, channelId, setPinned),
    [crewId, channelId],
  );

  // Auto-scroll to bottom on new messages, only if user was near bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Filter messages client-side for the search query. We're capped at
  // 100 messages by the watcher so this is cheap; older history would
  // need a server-side index (out of scope for now).
  const visibleMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.trim().toLowerCase();
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        (m.senderName ?? "").toLowerCase().includes(q),
    );
  }, [messages, searchQuery]);

  const handleSend = async (input: {
    text: string;
    mentionedUids: string[];
    replyTo: { id: string; text: string; senderName: string | null } | null;
  }) => {
    if (!myUid) return;
    try {
      await sendChannelMessage(
        crewId,
        channelId,
        input.text,
        myUid,
        myName,
        myAvatar,
        {
          replyTo: input.replyTo,
          mentionedUids: input.mentionedUids,
        },
      );
      sounds.click();
      // Fan out @mention notifications. Best-effort — failures don't
      // block the send. Skip self-mentions.
      for (const uid of input.mentionedUids) {
        if (uid === myUid) continue;
        recordNotification(uid, {
          kind: "system",
          title: `${myName ?? "Quelqu'un"} t'a mentionné`,
          description:
            input.text.replace(/<@[^>]+>/g, "").slice(0, 140) || "Mention dans un crew",
          link: `crews:${crewId}`,
        }).catch((err) =>
          console.warn("[crews] mention notif failed:", err),
        );
      }
    } catch (err) {
      console.warn("[crews] send failed:", err);
      throw err;
    }
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-white/[0.06] bg-bg-soft/30 px-5 py-3">
        <Hash className="size-4 text-fg-dim" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{channel.name}</div>
          {channel.description && (
            <div className="truncate text-xs text-fg-muted">{channel.description}</div>
          )}
        </div>
        {pinned.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPinned((v) => !v)}
            title={`${pinned.length} message${pinned.length > 1 ? "s" : ""} épinglé${pinned.length > 1 ? "s" : ""}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 transition",
              showPinned
                ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                : "bg-white/[0.03] text-fg-muted ring-white/[0.06] hover:bg-white/[0.06]",
            )}
          >
            <Pin className="size-3" />
            {pinned.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          title="Rechercher"
          className={cn(
            "grid size-7 place-items-center rounded-md ring-1 transition",
            searchOpen
              ? "bg-accent/15 text-accent ring-accent/30"
              : "bg-white/[0.03] text-fg-muted ring-white/[0.06] hover:bg-white/[0.06]",
          )}
        >
          <Search className="size-3.5" />
        </button>
      </header>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.06] bg-bg-soft/20"
          >
            <div className="flex items-center gap-2 px-5 py-2.5">
              <Search className="size-4 text-fg-dim" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher dans les messages chargés…"
                autoFocus
                className="no-drag flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-dim focus:outline-none"
              />
              {searchQuery && (
                <span className="text-[10px] text-fg-dim">
                  {visibleMessages.length} résultat{visibleMessages.length > 1 ? "s" : ""}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="grid size-6 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPinned && pinned.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-amber-500/20 bg-amber-500/[0.04]"
          >
            <div className="flex items-center gap-2 px-5 py-1.5 text-[10px] uppercase tracking-wider text-amber-300">
              <Pin className="size-3" /> Messages épinglés
            </div>
            <div className="max-h-48 overflow-y-auto px-2 pb-2">
              {pinned.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  crewId={crewId}
                  channelId={channelId}
                  myUid={myUid}
                  amOwnerOrAdmin={amOwnerOrAdmin}
                  grouped={false}
                  onReply={() => {
                    setReplyTo(m);
                    setShowPinned(false);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-2 py-4">
        <AnimatePresence initial={false}>
          {visibleMessages.length === 0 ? (
            <div className="grid h-full place-items-center text-fg-dim">
              <div className="text-center">
                <Hash className="mx-auto mb-2 size-8 text-fg-dim" strokeWidth={1.5} />
                <div className="text-sm">
                  {searchQuery
                    ? "Aucun résultat pour cette recherche."
                    : `Premier message dans #${channel.name} ?`}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {visibleMessages.map((m, i) => {
                const prev = i > 0 ? visibleMessages[i - 1] : null;
                const grouped =
                  !!prev &&
                  prev.senderUid === m.senderUid &&
                  m.sentAt - prev.sentAt < 5 * 60_000 &&
                  !m.replyToId;
                return (
                  <MessageItem
                    key={m.id}
                    message={m}
                    crewId={crewId}
                    channelId={channelId}
                    myUid={myUid}
                    amOwnerOrAdmin={amOwnerOrAdmin}
                    grouped={grouped}
                    onReply={() => setReplyTo(m)}
                  />
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      <MessageComposer
        channelName={channel.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSubmit={handleSend}
      />
    </>
  );
}
