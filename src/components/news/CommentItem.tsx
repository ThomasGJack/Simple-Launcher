import { useState } from "react";
import { motion } from "framer-motion";
import { Reply, Edit2, Trash2, Check, X } from "lucide-react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { preprocessAutolinks, handleExternalLinkClick } from "@/lib/linkUtils";
import { editComment, deleteComment, type NewsComment } from "@/firebase/newsComments";
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
  const isMine = me?.uid === comment.authorUid;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  const html = comment.body
    ? sanitizeHtml(
        marked.parse(preprocessAutolinks(comment.body), {
          async: false,
          gfm: true,
          breaks: true,
        }) as string,
      )
    : "";

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
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}

          {!editing && (
            <div className="mt-2 flex items-center gap-3 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
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
