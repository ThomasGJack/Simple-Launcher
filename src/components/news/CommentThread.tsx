import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import {
  postComment,
  watchComments,
  type NewsComment,
} from "@/firebase/newsComments";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
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
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<NewsComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [primed, setPrimed] = useState(false);

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
      await postComment(
        newsId,
        me.uid,
        me.displayName ?? null,
        me.photoURL ?? null,
        text,
        replyTo?.id ?? null,
      );
      setDraft("");
      setReplyTo(null);
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
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              replyTo
                ? `Répondre à ${replyTo.authorName ?? "ce commentaire"}…`
                : "Écris un commentaire — markdown léger supporté (**gras**, *italique*, [lien](url))…"
            }
            rows={3}
            className="w-full resize-none rounded-lg bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-dim"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
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
