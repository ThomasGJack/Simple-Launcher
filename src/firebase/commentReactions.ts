// Réactions emoji sur les commentaires des news — calque exact du
// pattern `newsReactions.ts` mais sur la sub-coll
// `/news/{newsId}/comments/{commentId}/reactions/{uid}`.
//
// 1 doc par (comment, user). Le doc contient la liste des emojis que
// l'user a activés sur ce comment. Toggle : re-cliquer le même emoji
// le retire, cliquer un autre l'ajoute (multi-réactions par comment
// par user, comme Discord).

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

export type CommentReaction = {
  uid: string;
  emojis: string[];
  userName: string | null;
  userAvatar: string | null;
};

/** Même palette que les news pour la cohérence visuelle. */
export const COMMENT_REACTION_EMOJIS = ["❤️", "🔥", "👍", "😂", "🎉"] as const;
export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];

export function watchCommentReactions(
  newsId: string,
  commentId: string,
  callback: (reactions: CommentReaction[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "news", newsId, "comments", commentId, "reactions"),
    (snap) => {
      const list: CommentReaction[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          emojis: Array.isArray(data.emojis)
            ? (data.emojis.filter((e) => typeof e === "string") as string[])
            : [],
          userName: typeof data.userName === "string" ? data.userName : null,
          userAvatar: typeof data.userAvatar === "string" ? data.userAvatar : null,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[commentReactions] watch failed:", err);
      callback([]);
    },
  );
}

export async function toggleCommentReaction(
  newsId: string,
  commentId: string,
  uid: string,
  emoji: string,
  current: string[],
  userName: string | null,
  userAvatar: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const next = current.includes(emoji)
    ? current.filter((e) => e !== emoji)
    : [...current, emoji];
  const ref = doc(
    fb.db,
    "news",
    newsId,
    "comments",
    commentId,
    "reactions",
    uid,
  );
  if (next.length === 0) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, {
    emojis: next,
    userName,
    userAvatar,
    updatedAt: serverTimestamp(),
  });
}
