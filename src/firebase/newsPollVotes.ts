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
 * One vote document per (news, user). The doc holds the option index the
 * user has selected (single-choice poll). Tapping the same option again
 * clears the vote.
 *
 * Path: /news/{newsId}/votes/{uid}
 */
export type NewsPollVote = {
  uid: string;
  option: number;
  userName: string | null;
  userAvatar: string | null;
};

export function watchPollVotes(
  newsId: string,
  callback: (votes: NewsPollVote[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "news", newsId, "votes"),
    (snap) => {
      const list: NewsPollVote[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          option: typeof data.option === "number" ? data.option : -1,
          userName: typeof data.userName === "string" ? data.userName : null,
          userAvatar: typeof data.userAvatar === "string" ? data.userAvatar : null,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[newsPollVotes] watch failed:", err);
      callback([]);
    },
  );
}

export async function castVote(
  newsId: string,
  uid: string,
  option: number,
  userName: string | null,
  userAvatar: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(doc(fb.db, "news", newsId, "votes", uid), {
    option,
    userName,
    userAvatar,
    updatedAt: serverTimestamp(),
  });
}

export async function clearVote(newsId: string, uid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "news", newsId, "votes", uid));
}
