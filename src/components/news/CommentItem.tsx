import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Reply, Edit2, Trash2, Check, X, SmilePlus } from "lucide-react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { preprocessAutolinks, handleExternalLinkClick } from "@/lib/linkUtils";
import { editComment, deleteComment, type NewsComment } from "@/firebase/newsComments";
import {
  COMMENT_REACTION_EMOJIS,
  toggleCommentReaction,
  watchCommentReactions,
  type CommentReaction,
} from "@/firebase/commentReactions";
import { splitMessageMentions } from "@/lib/crewMessageFormat";
import { useUsers } from "@/store/firebaseStores";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Une ligne de comment dans le thread. Affiche avatar + nom + body
 * markdown rendu, et — pour l'auteur — actions Édit / Supprimer.
 *
 * Si `parentName` est fourni, c'est une réponse → affiche un petit
 * marqueur "↪ en réponse à <parentName>" en tête.
 */
export function CommentItem({
  comment,
  newsId,
  parentName,
  onReply,
}: {
  comment: NewsComment;
  newsId: string;
  parentName: string | null;
  onReply: (comment: NewsComment) => void;
}) {
  const me = useAuthStore((s) => s.user);
  const allUsers = useUsers();
  const isMine = me?.uid === comment.authorUid;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  // Resolver uid → displayName pour rendre les mentions @user en pill.
  const nameForUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of allUsers) {
      if (u.displayName) map.set(u.uid, u.displayName);
    }
    return (uid: string) => map.get(uid) ?? "user";
  }, [allUsers]);

  // Tokenize le body : sépare le texte du markdown + les mentions
  // <@uid> qu'on render en pills cliquables.
  const tokens = useMemo(
    () => splitMessageMentions(comment.body),
    [comment.body],
  );
  const [reactions, setReactions] = useState<CommentReaction[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Live watch des réactions sur ce comment.
  useEffect(() => {
    const unsub = watchCommentReactions(newsId, comment.id, setReactions);
    return unsub;
  }, [newsId, comment.id]);

  const myEmojis = useMemo(
    () => reactions.find((r) => r.uid === me?.uid)?.emojis ?? [],
    [reactions, me?.uid],
  );

  // Aggrège les counts par emoji pour rendu (display "❤️ 3 🔥 1").
  const emojiCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reactions) {
      for (const e of r.emojis) {
        m[e] = (m[e] ?? 0) + 1;
      }
    }
    return m;
  }, [reactions]);

  const handleReact = async (emoji: string) => {
    if (!me) return;
    sounds.click();
    try {
      await toggleCommentReaction(
        newsId,
        comment.id,
        me.uid,
        emoji,
        myEmojis,
        me.displayName ?? null,
        me.photoURL ?? null,
      );
    } catch (err) {
      console.warn("[comment-reactions] toggle failed:", err);
    }
  };

  const namesForEmoji = (emoji: string): string => {
    const names = reactions
      .filter((r) => r.emojis.includes(emoji))
      .map((r) => r.userName ?? "Anonyme")
      .slice(0, 8);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  };

  // Render markdown par segment de texte (entre les mentions). Les
  // mentions sont rendues en React pills, le markdown du reste passe
  // par marked + DOMPurify comme avant.
  const renderTextSegment = (text: string): string => {
    if (!text) return "";
    return sanitizeHtml(
      marked.parse(preprocessAutolinks(text), {
        async: false,
        gfm: true,
        breaks: true,
      }) as string,
    );
  };

  const fallbackInitial = (comment.authorName ?? "?").trim().charAt(0).toUpperCase() || "?";

  const handleSaveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.body || busy) return;
    setBusy(true);
    try {
      await editComment(newsId, comment.id, trimmed);
      setEditing(false);
      sounds.success();
    } catch (err) {
      console.warn("[comment] edit failed:", err);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    if (!confirm("Supprimer ce commentaire ?")) return;
    setBusy(true);
    try {
      await deleteComment(newsId, comment.id);
      sounds.click();
    } catch (err) {
      console.warn("[comment] delete failed:", err);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.05] transition hover:bg-white/[0.04]",
        comment.parentCommentId && "ml-6 border-l-2 border-accent/20 pl-4",
      )}
    >
      {parentName && comment.parentCommentId && (
        <div className="mb-1.5 text-[10px] text-fg-dim">
          ↪ en réponse à <strong className="text-fg-muted">{parentName}</strong>
        </div>
      )}

      <div className="flex items-start gap-2.5">
        {comment.authorAvatar ? (
          <img
            src={comment.authorAvatar}
            alt=""
            className="size-7 shrink-0 rounded-full ring-1 ring-white/10"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 font-display text-[11px] text-accent ring-1 ring-accent/20">
            {fallbackInitial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-fg-primary">
              {comment.authorName ?? "Anonyme"}
            </span>
            <span className="text-[10px] text-fg-dim">
              {formatRelativeTime(comment.createdAt)}
              {comment.editedAt && comment.editedAt > comment.createdAt && (
                <span className="ml-1 italic">(modifié)</span>
              )}
            </span>
          </div>

          {editing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                autoFocus
                className="w-full resize-none rounded-lg bg-bg-base/60 p-2 text-sm text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={busy || !draft.trim() || draft.trim() === comment.body}
                  className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-bg-base disabled:opacity-50"
                >
                  <Check className="size-3" /> Enregistrer
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(comment.body);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2.5 py-1 text-xs text-fg-muted hover:bg-white/[0.08]"
                >
                  <X className="size-3" /> Annuler
                </button>
              </div>
            </div>
          ) : (
            <div
              className="mt-1 text-sm leading-relaxed text-fg-muted [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-fg-primary"
              onClick={handleExternalLinkClick}
            >
              {tokens.map((t, i) =>
                t.kind === "text" ? (
                  <span
                    key={i}
                    dangerouslySetInnerHTML={{ __html: renderTextSegment(t.text) }}
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
          )}

          {!editing && (
            <>
              {/* Réactions actives — toujours visibles si y'a au moins 1
                  réaction (chips compacts, pas dépendants du hover). */}
              {Object.keys(emojiCounts).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(emojiCounts).map(([emoji, count]) => {
                    const active = myEmojis.includes(emoji);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReact(emoji)}
                        title={namesForEmoji(emoji)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 transition",
                          active
                            ? "bg-accent/15 text-fg-primary ring-accent/40 shadow-[0_0_8px_var(--color-accent-soft)]"
                            : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
                        )}
                      >
                        <span className="text-xs leading-none">{emoji}</span>
                        <span className="font-mono tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Actions row — visible au hover */}
              <div className="mt-2 flex items-center gap-3 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
                {/* Bouton "Réagir" : ouvre le picker emoji */}
                <div className="relative">
                  <button
                    onClick={() => setPickerOpen((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors",
                      pickerOpen ? "text-accent" : "text-fg-dim hover:text-accent",
                    )}
                  >
                    <SmilePlus className="size-3" /> Réagir
                  </button>
                  {pickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full z-10 mt-1 flex gap-0.5 rounded-lg bg-bg-elevated/95 p-1 ring-1 ring-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                    >
                      {COMMENT_REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            handleReact(emoji);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            "rounded-md px-1.5 py-1 text-base leading-none transition hover:bg-white/[0.08] hover:scale-125",
                            myEmojis.includes(emoji) && "bg-accent/15",
                          )}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
                <button
                  onClick={() => onReply(comment)}
                  className="inline-flex items-center gap-1 text-fg-dim hover:text-accent"
                >
                  <Reply className="size-3" /> Répondre
                </button>
                {isMine && (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1 text-fg-dim hover:text-accent"
                    >
                      <Edit2 className="size-3" /> Modifier
                    </button>
                    <button
                      onClick={handleDelete}
                      className="inline-flex items-center gap-1 text-fg-dim hover:text-danger"
                    >
                      <Trash2 className="size-3" /> Supprimer
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Formate une date en "il y a 2 min" / "il y a 3 h" / "hier" / "12 mai".
 * Format simple (pas d'intl complet — la communauté est francophone).
 */
function formatRelativeTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 86_400_000 * 2) return "hier";
  if (diff < 86_400_000 * 7) return `il y a ${Math.floor(diff / 86_400_000)} j`;
  const d = new Date(ms);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
