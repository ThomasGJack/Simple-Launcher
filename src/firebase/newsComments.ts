import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Threaded comments under a news. Stored as `/news/{newsId}/comments/{commentId}`
 * sub-collection, calque du pattern de `newsReactions.ts` / `newsPollVotes.ts`.
 *
 * 1 niveau de threading max (un comment peut répondre à un autre, mais
 * pas de réponse à une réponse — rendu plat avec retrait visuel).
 *
 * Cap watcher à 200 (les news avec beaucoup de retours peuvent dépasser
 * la limite news.ts elle-même). Pas de pagination "voir plus" en MVP —
 * 200 c'est large pour une news privée du crew.
 */

export type NewsComment = {
  id: string;
  authorUid: string;
  authorName: string | null;
  authorAvatar: string | null;
  /** Texte du comment, markdown léger (gras / italique / liens). */
  body: string;
  createdAt: number;
  editedAt: number | null;
  /** Si non null, ce comment est une réponse à un autre comment.
   *  Référence l'`id` du comment parent. 1 niveau seulement — un comment
   *  qui répond à une réponse pointe quand même vers le top-level. */
  parentCommentId: string | null;
};

/**
 * Watch live des comments d'une news. Renvoie les comments triés
 * chronologiquement (plus anciens en premier — discussion lit du haut
 * en bas comme un fil normal).
 */
export function watchComments(
  newsId: string,
  callback: (comments: NewsComment[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "news", newsId, "comments"),
    orderBy("createdAt", "asc"),
    fbLimit(200),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: NewsComment[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
          authorName: typeof data.authorName === "string" ? data.authorName : null,
          authorAvatar: typeof data.authorAvatar === "string" ? data.authorAvatar : null,
          body: typeof data.body === "string" ? data.body : "",
          createdAt: tsToMs(data.createdAt) ?? 0,
          editedAt: tsToMs(data.editedAt),
          parentCommentId:
            typeof data.parentCommentId === "string" ? data.parentCommentId : null,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[newsComments] watch failed:", err);
      callback([]);
    },
  );
}

/**
 * Poste un nouveau comment. Le serverTimestamp sera résolu côté
 * Firestore — le watcher reçoit la version résolue ~100ms après.
 */
export async function postComment(
  newsId: string,
  authorUid: string,
  authorName: string | null,
  authorAvatar: string | null,
  body: string,
  parentCommentId: string | null,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "news", newsId, "comments"), {
    authorUid,
    authorName,
    authorAvatar,
    body,
    parentCommentId,
    createdAt: serverTimestamp(),
    editedAt: null,
  });
  return ref.id;
}

/**
 * Édite le body d'un comment existant. Auteur seulement (les rules
 * Firestore l'imposent côté serveur — `update` gated sur authorUid).
 */
export async function editComment(
  newsId: string,
  commentId: string,
  body: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "news", newsId, "comments", commentId), {
    body,
    editedAt: serverTimestamp(),
  });
}

export async function deleteComment(newsId: string, commentId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "news", newsId, "comments", commentId));
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
