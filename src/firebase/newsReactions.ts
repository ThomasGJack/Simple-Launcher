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

/**
 * One emoji reaction document per (news, user). The doc holds the array
 * of emojis the user has currently activated on that news (a user can
 * react with several emojis at once, like on Discord/Slack).
 *
 * Path: /news/{newsId}/reactions/{uid}
 *
 * Real-time tally is computed client-side from this collection — Firestore
 * doesn't have native counters and we want the per-user-toggle UX where
 * tapping the emoji you already chose removes it. A few reactions per news
 * is way under any quota concern.
 */
export type NewsReaction = {
  uid: string;
  emojis: string[];
  /** Discord display name + avatar at time of react — cached so the toast
   *  list "Liked by …" can render names without re-joining users/ docs. */
  userName: string | null;
  userAvatar: string | null;
};

/** The fixed palette shown under each news card. */
export const REACTION_EMOJIS = ["❤️", "🔥", "👍", "🎉"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function watchReactions(
  newsId: string,
  callback: (reactions: NewsReaction[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "news", newsId, "reactions"),
    (snap) => {
      const list: NewsReaction[] = snap.docs.map((d) => {
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
      console.warn("[newsReactions] watch failed:", err);
      callback([]);
    },
  );
}

/**
 * Toggles a single emoji on a news for the given user. If the user already
 * has the emoji active, it's removed; otherwise it's added. Other emojis
 * by the same user remain untouched.
 */
export async function toggleReaction(
  newsId: string,
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
  const ref = doc(fb.db, "news", newsId, "reactions", uid);
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
