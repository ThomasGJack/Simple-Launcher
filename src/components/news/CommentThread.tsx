import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, X, AtSign } from "lucide-react";
import {
  postComment,
  watchComments,
  type NewsComment,
} from "@/firebase/newsComments";
import {
  injectMentionTokens,
  extractMentionedUids,
} from "@/lib/crewMessageFormat";
import { useAuthStore } from "@/store/auth";
import { useUsers } from "@/store/firebaseStores";
import { recordNotification } from "@/firebase/notifications";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { CommentItem } from "./CommentItem";

/**
 * Thread complet de commentaires sous une news. Inclut :
 *   - Composer (textarea + bouton "Publier") en haut
 *   - Liste live des comments (watcher Firestore)
 *   - Indicateur de "réponse à X" si l'utilisateur clique Répondre
 *
 * Threading 1 niveau : `parentCommentId` indexe par id parent. Le
 * rendu reste plat avec un retrait visuel (`ml-6 border-l-2`).
 *
 * Si l'utilisateur n'est pas connecté, un placeholder "Connecte-toi
 * pour commenter" remplace le composer.
 */
export function CommentThread({ newsId }: { newsId: string }) {
  const me = useAuthStore((s) => s.user);
  const allUsers = useUsers();
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<NewsComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [primed, setPrimed] = useState(false);

  // Mention autocomplete — réutilise le mécanisme du MessageComposer
  // crew. État local au composer.
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [resolvedMentions, setResolvedMentions] = useState<
    Array<{ uid: string; displayName: string }>
  >([]);

  // Top 5 users qui matchent la query (case-insensitive prefix on
  // displayName ou username).
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
      .slice(0, 5);
  }, [allUsers, mentionQuery]);

  const updateMentionQuery = (next: string) => {
    setDraft(next);
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
    const upToCursor = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const replaced = upToCursor.replace(/@[\p{L}\p{N}_-]*$/u, `@${display} `);
    const next = replaced + after;
    setDraft(next);
    setMentionQuery(null);
    setResolvedMentions((arr) => {
      if (arr.find((m) => m.uid === user.uid)) return arr;
      return [...arr, { uid: user.uid, displayName: display }];
    });
    requestAnimationFrame(() => {
      ta.focus();
      const newCursor = replaced.length;
      ta.setSelectionRange(newCursor, newCursor);
    });
  };

  // Reset les mentions résolues quand l'user les retire du texte —
  // évite que des mentions stale leak dans un nouveau commentaire.
  useEffect(() => {
    if (resolvedMentions.length === 0) return;
    setResolvedMentions((arr) =>
      arr.filter((m) => draft.includes(`@${m.displayName}`)),
    );
  }, [draft, resolvedMentions.length]);

  useEffect(() => {
    const unsub = watchComments(newsId, (next) => {
      setComments(next);
      setPrimed(true);
    });
    return unsub;
  }, [newsId]);

  /** Map commentId → authorName, used to show "↪ en réponse à <X>". */
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of comments) {
      if (c.authorName) map.set(c.id, c.authorName);
    }
    return map;
  }, [comments]);

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || !me || busy) return;
    setBusy(true);
    try {
      // Convertit les `@DisplayName` en tokens canoniques `<@uid>`
      // avant save (pareil que MessageComposer crew).
      const tokenized = injectMentionTokens(text, resolvedMentions);
      const mentionedUids = extractMentionedUids(tokenized);

      await postComment(
        newsId,
        me.uid,
        me.displayName ?? null,
        me.photoURL ?? null,
        tokenized,
        replyTo?.id ?? null,
      );

      // Notif aux mentionnés (skip self-mention).
      for (const uid of mentionedUids) {
        if (uid === me.uid) continue;
        recordNotification(uid, {
          kind: "system",
          title: `${me.displayName ?? "Quelqu'un"} t'a mentionné dans un commentaire`,
          description: text.replace(/<@[^>]+>/g, "").slice(0, 140) || "Mention",
          link: `news`,
        }).catch((err) =>
          console.warn("[comments] mention notif failed:", err),
        );
      }

      setDraft("");
      setReplyTo(null);
      setResolvedMentions([]);
      setMentionQuery(null);
      sounds.success();
    } catch (err) {
      console.warn("[CommentThread] post failed:", err);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-6 rounded-3xl bg-bg-soft/40 p-4 ring-1 ring-white/[0.05]"
    >
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
        <MessageSquare className="size-3.5" />
        Commentaires
        {primed && (
          <span className="ml-auto rounded-full bg-bg-base/50 px-2 py-0.5 font-mono text-[10px] text-fg-muted">
            {comments.length}
          </span>
        )}
      </div>

      {/* Composer */}
      {me ? (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-bg-base/40 p-3 ring-1 ring-white/[0.06]">
          {replyTo && (
            <div className="flex items-center gap-2 rounded-md bg-accent/10 px-2.5 py-1.5 text-[11px] text-accent ring-1 ring-accent/20">
              <span>
                ↪ en réponse à{" "}
                <strong>{replyTo.authorName ?? "Anonyme"}</strong>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="ml-auto opacity-60 hover:opacity-100"
                aria-label="Annuler la réponse"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="relative">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => updateMentionQuery(e.target.value)}
              placeholder={
                replyTo
                  ? `Répondre à ${replyTo.authorName ?? "ce commentaire"}…`
                  : "Écris un commentaire — markdown léger + @user pour mentionner…"
              }
              rows={3}
              // px-1 + leading-relaxed : sans padding horizontal le texte
              // s'aligne sur le coin arrondi (rounded-2xl du parent ≈ 16px)
              // alors que le textarea n'a que 12px (p-3) → les premières
              // lettres semblent grignotées par la courbe. 4px d'inset suffit.
              className="w-full resize-none rounded-lg bg-transparent px-1 text-sm leading-relaxed text-fg-primary outline-none placeholder:text-fg-dim"
              onKeyDown={(e) => {
                // Mention picker keyboard nav
                if (mentionQuery !== null && suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlightIdx((i) => (i + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightIdx(
                      (i) => (i - 1 + suggestions.length) % suggestions.length,
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertMention(suggestions[highlightIdx]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    return;
                  }
                }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />

            {/* Mention autocomplete popup */}
            {mentionQuery !== null && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg bg-bg-elevated/95 ring-1 ring-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md"
              >
                <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                  <AtSign className="size-3" />
                  Mentionner un user
                </div>
                {suggestions.map((u, i) => {
                  const initial = (u.displayName ?? "?").charAt(0).toUpperCase();
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => insertMention(u)}
                      onMouseEnter={() => setHighlightIdx(i)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition",
                        i === highlightIdx
                          ? "bg-accent/15 text-fg-primary"
                          : "text-fg-muted hover:bg-white/[0.04]",
                      )}
                    >
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="size-6 rounded-full ring-1 ring-white/10"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="grid size-6 place-items-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
                          {initial}
                        </div>
                      )}
                      <span className="truncate">{u.displayName ?? u.username}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-fg-dim">
              Ctrl+Entrée pour publier
            </span>
            <button
              onClick={handleSubmit}
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base shadow-[0_0_12px_var(--color-accent-soft)] disabled:opacity-50"
            >
              <Send className="size-3" /> Publier
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl bg-bg-base/40 p-4 text-center text-sm text-fg-muted ring-1 ring-white/[0.06]">
          Connecte-toi pour commenter cette news.
        </div>
      )}

      {/* Liste */}
      {comments.length === 0 ? (
        <div className="grid place-items-center py-6 text-center text-xs text-fg-dim">
          Aucun commentaire pour l'instant. Sois le premier à réagir !
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              newsId={newsId}
              parentName={c.parentCommentId ? (nameById.get(c.parentCommentId) ?? null) : null}
              onReply={(comment) => setReplyTo(comment)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
