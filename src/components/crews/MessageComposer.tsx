import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  CornerDownLeft,
  Image as ImageIcon,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { PollComposer } from "./PollComposer";
import {
  extractMentionedUids,
  injectMentionTokens,
} from "@/lib/crewMessageFormat";
import { useUsers } from "@/store/firebaseStores";
import { useAuthStore } from "@/store/auth";
import { uploadCrewImage } from "@/firebase/crews";
import { cn } from "@/lib/cn";
import type { CrewMessage } from "@/firebase/crews";

export type ComposerSubmit = (input: {
  text: string;
  mentionedUids: string[];
  replyTo: { id: string; text: string; senderName: string | null } | null;
  imageUrl: string | null;
}) => Promise<void>;

/**
 * Channel composer with @mention autocomplete + reply chip. The
 * autocomplete pops as soon as the user types `@` and matches the
 * remaining word against the live users store. Selecting a user
 * inserts `@DisplayName` literally into the text — at submit time we
 * rewrite it to `<@uid>` so the renderer can pill it.
 */
export function MessageComposer({
  channelName,
  replyTo,
  onCancelReply,
  onSubmit,
  onPollSubmit,
}: {
  channelName: string;
  replyTo: CrewMessage | null;
  onCancelReply: () => void;
  onSubmit: ComposerSubmit;
  /** Callback invoqué quand l'utilisateur valide un sondage depuis la
   *  modal PollComposer. Si non fourni, le bouton "Sondage" est caché. */
  onPollSubmit?: (poll: { question: string; options: string[] }) => Promise<void>;
}) {
  const [showPollComposer, setShowPollComposer] = useState(false);
  const allUsers = useUsers();
  const me = useAuthStore((s) => s.user);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    file: File;
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Track resolved mentions chosen via the popup so we can rewrite
  // `@Name` → `<@uid>` reliably even if multiple users share the same
  // display name.
  const [resolvedMentions, setResolvedMentions] = useState<
    Array<{ uid: string; displayName: string }>
  >([]);

  // Suggestions for the autocomplete popup — top 5 users whose
  // display name matches the query (case-insensitive prefix).
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allUsers
      .filter(
        (u) =>
          u.displayName &&
          (q === "" ||
            u.displayName.toLowerCase().includes(q) ||
            u.username?.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [allUsers, mentionQuery]);

  const updateMentionQuery = (next: string) => {
    setText(next);
    // Find the current word the cursor is on, and check if it starts
    // with `@`. If yes, open the popup with the rest as query.
    const ta = taRef.current;
    if (!ta) {
      setMentionQuery(null);
      return;
    }
    const cursor = ta.selectionStart;
    const upToCursor = next.slice(0, cursor);
    const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(upToCursor);
    if (match) {
      setMentionQuery(match[1]);
      setHighlightIdx(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (user: {
    uid: string;
    displayName: string | null;
    username: string | null;
  }) => {
    const ta = taRef.current;
    if (!ta) return;
    const display = user.displayName ?? user.username ?? "";
    if (!display) return;
    const cursor = ta.selectionStart;
    const upToCursor = text.slice(0, cursor);
    const after = text.slice(cursor);
    const replaced = upToCursor.replace(/@[\p{L}\p{N}_-]*$/u, `@${display} `);
    const next = replaced + after;
    setText(next);
    setMentionQuery(null);
    setResolvedMentions((arr) => {
      if (arr.find((m) => m.uid === user.uid)) return arr;
      return [...arr, { uid: user.uid, displayName: display }];
    });
    // Re-focus + put cursor right after the inserted mention.
    requestAnimationFrame(() => {
      ta.focus();
      const newCursor = replaced.length;
      ta.setSelectionRange(newCursor, newCursor);
    });
  };

  const handlePickImage = () => fileInputRef.current?.click();

  const handleImageChange = async (file: File | null) => {
    if (!file || !me) return;
    setUploadError(null);
    // Show local preview immediately while we upload in background.
    const localUrl = URL.createObjectURL(file);
    setImagePreview({ url: localUrl, file });
  };

  const handleClearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.url);
    setImagePreview(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !imagePreview) || sending || !me) return;
    setSending(true);
    try {
      // Upload the image (if any) right before sending so we don't
      // burn quota on aborted drafts.
      let imageUrl: string | null = null;
      if (imagePreview) {
        setUploadingImage(true);
        try {
          imageUrl = await uploadCrewImage(me.uid, imagePreview.file);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : String(err));
          setUploadingImage(false);
          setSending(false);
          return;
        }
        setUploadingImage(false);
      }
      const tokenized = injectMentionTokens(trimmed, resolvedMentions);
      const mentioned = extractMentionedUids(tokenized);
      await onSubmit({
        text: tokenized,
        mentionedUids: mentioned,
        replyTo: replyTo
          ? {
              id: replyTo.id,
              text: replyTo.text.slice(0, 140),
              senderName: replyTo.senderName,
            }
          : null,
        imageUrl,
      });
      setText("");
      setResolvedMentions([]);
      setMentionQuery(null);
      handleClearImage();
      onCancelReply();
    } catch (err) {
      console.warn("[crews] composer send failed:", err);
    } finally {
      setSending(false);
    }
  };

  // Reset the resolved mentions list whenever the user clears them
  // from the text (so leftover stale resolutions don't leak into a
  // fresh message).
  useEffect(() => {
    if (resolvedMentions.length === 0) return;
    setResolvedMentions((arr) =>
      arr.filter((m) => text.includes(`@${m.displayName}`)),
    );
  }, [text, resolvedMentions.length]);

  return (
    <div className="border-t border-white/[0.06] bg-bg-soft/30 p-4">
      {/* Reply chip */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-accent/50 bg-bg-base/40 px-3 py-1.5 text-[11px]"
          >
            <CornerDownLeft className="size-3 text-accent" />
            <span className="text-fg-muted">
              Réponse à{" "}
              <span className="font-medium text-fg-primary">
                {replyTo.senderName ?? "?"}
              </span>{" "}
              ·{" "}
              <span className="line-clamp-1 inline">{replyTo.text}</span>
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              className="ml-auto grid size-5 place-items-center rounded text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        {/* Mention autocomplete popup */}
        <AnimatePresence>
          {mentionQuery !== null && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full left-0 z-10 mb-2 w-72 overflow-hidden rounded-xl bg-bg-elevated/95 shadow-xl ring-1 ring-white/[0.08] backdrop-blur"
            >
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-fg-dim">
                Mentionner un membre
              </div>
              {suggestions.map((u, i) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => insertMention(u)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition",
                    i === highlightIdx
                      ? "bg-accent/10 text-fg-primary"
                      : "text-fg-muted hover:bg-white/[0.04]",
                  )}
                >
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt=""
                      className="size-6 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="grid size-6 place-items-center rounded-full bg-bg-base/40 text-[10px] uppercase text-fg-dim ring-1 ring-white/10">
                      {(u.displayName ?? "?").slice(0, 1)}
                    </div>
                  )}
                  <span className="truncate">{u.displayName ?? u.username}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image preview chip */}
        <AnimatePresence>
          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-2 flex items-center gap-2 rounded-xl bg-bg-base/40 p-2 ring-1 ring-white/[0.06]"
            >
              <img
                src={imagePreview.url}
                alt=""
                className="size-12 rounded-lg object-cover ring-1 ring-white/10"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-fg-primary">
                  {imagePreview.file.name}
                </div>
                <div className="text-[10px] text-fg-dim">
                  {(imagePreview.file.size / 1024).toFixed(0)} KB
                  {uploadingImage && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-accent">
                        <Loader2 className="inline size-3 animate-spin" /> upload…
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearImage}
                className="grid size-6 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
              >
                <X className="size-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {uploadError && (
          <div className="mb-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger ring-1 ring-danger/30">
            {uploadError}
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImageChange(f);
          }}
          className="hidden"
        />

        <div className="flex items-end gap-2 rounded-2xl bg-bg-base/40 p-2 ring-1 ring-white/[0.06] focus-within:ring-accent/40">
          <button
            type="button"
            onClick={handlePickImage}
            title="Joindre une image"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
          >
            <ImageIcon className="size-4" />
          </button>
          {onPollSubmit && (
            <button
              type="button"
              onClick={() => setShowPollComposer(true)}
              title="Créer un sondage"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
            >
              <BarChart3 className="size-4" />
            </button>
          )}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => updateMentionQuery(e.target.value)}
            onKeyDown={(e) => {
              if (mentionQuery !== null && suggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlightIdx((i) => (i + 1) % suggestions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(suggestions[highlightIdx]);
                  return;
                }
                if (e.key === "Escape") {
                  setMentionQuery(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Écrire dans #${channelName}…`}
            rows={1}
            className="no-drag flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg-primary placeholder:text-fg-dim focus:outline-none"
            style={{ maxHeight: 200 }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="no-drag grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </div>

        <p className="mt-1.5 px-1 text-[10px] text-fg-dim">
          **gras** · *italique* · `code` · [lien](url) · @user pour mentionner ·
          Maj+Entrée pour saut de ligne
        </p>
      </div>

      <AnimatePresence>
        {showPollComposer && onPollSubmit && (
          <PollComposer
            onCancel={() => setShowPollComposer(false)}
            onSubmit={async (poll) => {
              await onPollSubmit(poll);
              setShowPollComposer(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
