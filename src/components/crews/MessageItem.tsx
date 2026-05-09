import { memo, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CornerDownLeft,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import {
  addMessageReaction,
  deleteChannelMessage,
  editChannelMessage,
  removeMessageReaction,
  setMessagePinned,
  type CrewMessage,
} from "@/firebase/crews";
import {
  renderMessageMarkdown,
  splitMessageMentions,
} from "@/lib/crewMessageFormat";
import { handleExternalLinkClick } from "@/lib/linkUtils";
import { useUsers } from "@/store/firebaseStores";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import { PollMessage } from "@/components/crews/PollMessage";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "🤔"];

/**
 * Single message item in a channel. Wraps everything message-level :
 *
 *  - Markdown body + mention pills
 *  - Reply preview (when this message is itself a reply)
 *  - Reactions row (live subscription)
 *  - Hover actions toolbar (react / reply / edit / pin / delete)
 *  - Inline edit mode for the sender
 *
 * Memoized — a channel can render 100+ messages and the parent
 * (ChannelView) re-renders on every typing keystroke, every Firestore
 * snapshot, every shared tick. Without memo, every re-render of the
 * parent would re-execute every MessageItem body, re-subscribing
 * reactions and re-running the markdown render.
 */
export const MessageItem = memo(function MessageItem({
  message,
  crewId,
  channelId,
  myUid,
  amOwnerOrAdmin,
  grouped,
  onReply,
}: {
  message: CrewMessage;
  crewId: string;
  channelId: string;
  myUid: string;
  amOwnerOrAdmin: boolean;
  /** True if this message comes right after another from the same
   *  sender within 5 minutes — used to compress the avatar/header. */
  grouped: boolean;
  onReply: () => void;
}) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [hover, setHover] = useState(false);
  const allUsers = useUsers();
  const isMine = message.senderUid === myUid;
  const canEdit = isMine && !message.imageUrl;
  const canDelete = isMine || amOwnerOrAdmin;
  const canPin = amOwnerOrAdmin;

  // Reactions are now delivered inline on the message doc (see perf
  // Phase 2.3) — no per-message listener. The map is already
  // `Record<emoji, uid[]>`, we just need to flag whether the current
  // viewer reacted and sort by count for display.
  const groupedReactions = useMemo(() => {
    const map = new Map<string, { uids: string[]; iReacted: boolean }>();
    for (const [emoji, uids] of Object.entries(message.reactions)) {
      if (!uids.length) continue;
      map.set(emoji, {
        uids,
        iReacted: uids.includes(myUid),
      });
    }
    return Array.from(map.entries()).sort(
      (a, b) => b[1].uids.length - a[1].uids.length,
    );
  }, [message.reactions, myUid]);

  // Resolve uid → displayName from the live users store. Falls back to
  // the truncated uid if the user is no longer in the store (left,
  // banned, etc.). Used by mention pills + reaction tooltips.
  const nameForUid = (uid: string): string => {
    const u = allUsers.find((x) => x.uid === uid);
    return u?.displayName ?? u?.username ?? `@${uid.slice(0, 6)}`;
  };

  const handleToggleReaction = async (emoji: string) => {
    const existing = groupedReactions.find(([e]) => e === emoji);
    if (existing && existing[1].iReacted) {
      await removeMessageReaction(crewId, channelId, message.id, myUid, emoji);
    } else {
      await addMessageReaction(crewId, channelId, message.id, myUid, emoji);
      sounds.click();
    }
    setEmojiPickerOpen(false);
  };

  const handleSaveEdit = async () => {
    const text = editText.trim();
    if (!text) {
      setEditText(message.text);
      setEditing(false);
      return;
    }
    if (text === message.text) {
      setEditing(false);
      return;
    }
    try {
      await editChannelMessage(crewId, channelId, message.id, text);
      sounds.click();
      setEditing(false);
    } catch (err) {
      console.warn("[crews] edit failed:", err);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer ce message ? L'action est irréversible.")) return;
    try {
      await deleteChannelMessage(crewId, channelId, message.id);
      sounds.click();
    } catch (err) {
      console.warn("[crews] delete failed:", err);
    }
  };

  const handleTogglePin = async () => {
    try {
      await setMessagePinned(crewId, channelId, message.id, !message.pinned);
      sounds.click();
    } catch (err) {
      console.warn("[crews] pin failed:", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "group relative flex gap-3 rounded-lg px-2 py-1 transition-colors",
        hover && "bg-white/[0.02]",
        message.pinned && "bg-amber-500/[0.04]",
      )}
    >
      {/* Avatar */}
      {grouped ? (
        <div className="w-9 shrink-0" />
      ) : (
        <TierAvatar
          tier={
            allUsers.find((u) => u.uid === message.senderUid)?.tier ?? null
          }
          src={message.senderAvatar}
          displayName={message.senderName}
          size="sm"
          className="shrink-0"
          fallbackTone="muted"
          frameId={
            allUsers.find((u) => u.uid === message.senderUid)?.equippedFrameId ??
            null
          }
        />
      )}

      {/* Body */}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <TierName
              tier={
                allUsers.find((u) => u.uid === message.senderUid)?.tier ?? null
              }
              name={message.senderName ?? "Anonyme"}
              className="font-medium text-fg-primary"
            />
            <span className="text-[10px] text-fg-dim">
              {formatStamp(message.sentAt)}
            </span>
            {message.pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
                <Pin className="size-2.5" /> Épinglé
              </span>
            )}
          </div>
        )}

        {/* Reply context preview */}
        {message.replyToId && message.replyToText && (
          <div className="mb-1 flex items-center gap-1.5 rounded-md border-l-2 border-accent/40 bg-bg-base/30 px-2 py-1 text-[11px] text-fg-muted">
            <CornerDownLeft className="size-3 shrink-0 text-accent" />
            <span className="font-medium text-fg-primary">
              {message.replyToSenderName ?? "?"}
            </span>
            <span className="truncate">{message.replyToText}</span>
          </div>
        )}

        {editing ? (
          <div className="space-y-1.5">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSaveEdit();
                }
                if (e.key === "Escape") {
                  setEditText(message.text);
                  setEditing(false);
                }
              }}
              autoFocus
              rows={2}
              className="no-drag w-full resize-none rounded-lg bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-accent/40 focus:outline-none"
            />
            <div className="flex items-center gap-2 text-[10px] text-fg-dim">
              <button
                type="button"
                onClick={handleSaveEdit}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-bg-base"
              >
                <Check className="size-3" /> Enregistrer
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditText(message.text);
                  setEditing(false);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-fg-muted ring-1 ring-white/[0.06]"
              >
                <X className="size-3" /> Annuler
              </button>
              <span>échap pour annuler · entrée pour valider</span>
            </div>
          </div>
        ) : (
          <>
            {message.text && (
              <MessageBody text={message.text} nameForUid={nameForUid} />
            )}
            {message.imageUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Ouvre le viewer intégré au lieu d'un onglet browser :
                  // l'app reste l'app, pas une webview qui ouvre une page.
                  void import("@/store/imageViewer").then(({ openImage }) =>
                    openImage(message.imageUrl!, message.senderName ?? null),
                  );
                }}
                className="no-drag mt-1 block max-w-md overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition hover:ring-accent/40"
                title="Voir l'image en grand"
              >
                <img
                  src={message.imageUrl}
                  alt=""
                  className="max-h-80 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              </button>
            )}
            {message.poll && (
              <div className="mt-2 max-w-md">
                <PollMessage
                  crewId={crewId}
                  channelId={channelId}
                  messageId={message.id}
                  poll={message.poll}
                />
              </div>
            )}
          </>
        )}

        {message.editedAt && !editing && (
          <span className="ml-1 text-[10px] text-fg-dim">(modifié)</span>
        )}

        {/* Reactions row */}
        {groupedReactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {groupedReactions.map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleToggleReaction(emoji)}
                title={info.uids.map(nameForUid).join(", ")}
                className={cn(
                  "no-drag inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition",
                  info.iReacted
                    ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                    : "bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08]",
                )}
              >
                <span>{emoji}</span>
                <span className="text-[10px] tabular-nums">{info.uids.length}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((v) => !v)}
              className="grid size-6 place-items-center rounded-full bg-white/[0.02] text-fg-dim ring-1 ring-white/[0.06] transition hover:bg-white/[0.06] hover:text-fg-primary"
              title="Ajouter une réaction"
            >
              <SmilePlus className="size-3" />
            </button>
          </div>
        )}
      </div>

      {/* Hover actions toolbar */}
      <AnimatePresence>
        {hover && !editing && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute -top-2 right-3 flex items-center gap-0.5 rounded-lg bg-bg-elevated/95 p-0.5 shadow-lg ring-1 ring-white/[0.06]"
          >
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((v) => !v)}
              title="Réagir"
              className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
            >
              <SmilePlus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onReply}
              title="Répondre"
              className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
            >
              <Reply className="size-3.5" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Modifier"
                className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {canPin && (
              <button
                type="button"
                onClick={handleTogglePin}
                title={message.pinned ? "Détacher" : "Épingler"}
                className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-amber-500/15 hover:text-amber-300"
              >
                {message.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                title="Supprimer"
                className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <div className="size-7 grid place-items-center text-fg-dim/30">
              <MoreHorizontal className="size-3.5" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker popover */}
      <AnimatePresence>
        {emojiPickerOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute right-3 top-6 z-10 flex gap-1 rounded-xl bg-bg-elevated/95 p-2 shadow-xl ring-1 ring-white/[0.08] backdrop-blur"
          >
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => handleToggleReaction(e)}
                className="grid size-9 place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-white/[0.06]"
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}, (prev, next) => {
  // Cheap field-by-field compare. Skipping the onReply callback
  // (inline arrow from parent) is safe because onReply uses the
  // current message id which is captured in the parent closure.
  return (
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.message.editedAt === next.message.editedAt &&
    prev.message.pinned === next.message.pinned &&
    prev.message.imageUrl === next.message.imageUrl &&
    prev.message.poll === next.message.poll &&
    prev.message.replyToId === next.message.replyToId &&
    prev.message.replyToText === next.message.replyToText &&
    prev.message.replyToSenderName === next.message.replyToSenderName &&
    prev.message.senderUid === next.message.senderUid &&
    prev.message.senderName === next.message.senderName &&
    prev.message.senderAvatar === next.message.senderAvatar &&
    prev.message.sentAt === next.message.sentAt &&
    reactionsEqual(prev.message.reactions, next.message.reactions) &&
    prev.crewId === next.crewId &&
    prev.channelId === next.channelId &&
    prev.myUid === next.myUid &&
    prev.amOwnerOrAdmin === next.amOwnerOrAdmin &&
    prev.grouped === next.grouped
  );
});

/**
 * Shallow compare two reaction maps. Returns true when both contain
 * the same emojis in the same order with identical uid arrays.
 * Used by MessageItem's memo comparator — without it, every snapshot
 * would emit a fresh map and bust the memo.
 */
function reactionsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = a[k];
    const bv = b[k];
    if (!bv || av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) {
      if (av[i] !== bv[i]) return false;
    }
  }
  return true;
}

/** Renders the message body with markdown + mention pills. */
function MessageBody({
  text,
  nameForUid,
}: {
  text: string;
  nameForUid: (uid: string) => string;
}) {
  const tokens = splitMessageMentions(text);
  return (
    <div
      onClick={handleExternalLinkClick}
      className="break-words text-sm leading-relaxed text-fg-muted [&_a]:cursor-pointer [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-accent/40 [&_a]:transition-colors hover:[&_a]:decoration-accent [&_code]:rounded [&_code]:bg-bg-base/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-fg-primary [&_pre]:rounded-lg [&_pre]:bg-bg-base/60 [&_pre]:p-2 [&_pre]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_strong]:text-fg-primary"
    >
      {tokens.map((t, i) =>
        t.kind === "text" ? (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderMessageMarkdown(t.text) }}
          />
        ) : (
          <span
            key={i}
            className="mx-0.5 inline-flex items-center rounded-md bg-accent/15 px-1.5 py-0.5 text-[12px] font-medium text-accent ring-1 ring-accent/30"
          >
            @{nameForUid(t.uid)}
          </span>
        ),
      )}
    </div>
  );
}

function formatStamp(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Aujourd'hui ${time}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + time;
}

// Keep these around for tree-shaker — used only in tooltip cases.
void useRef;
