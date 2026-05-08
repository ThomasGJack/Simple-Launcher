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
 * Votes pour un sondage embarqué dans un message de channel. Calque
 * exact de [src/firebase/newsPollVotes.ts](src/firebase/newsPollVotes.ts) mais avec un path
 * 4-segments plus profond.
 *
 * Path: /crews/{crewId}/channels/{channelId}/messages/{messageId}/votes/{uid}
 *
 * Single-choice : un user n'a qu'un vote actif. Re-tap la même option
 * la retire (clearVote). Re-tap une autre option remplace.
 */
export type ChannelPollVote = {
  uid: string;
  option: number;
  userName: string | null;
  userAvatar: string | null;
};

export function watchChannelPollVotes(
  crewId: string,
  channelId: string,
  messageId: string,
  callback: (votes: ChannelPollVote[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(
      fb.db,
      "crews",
      crewId,
      "channels",
      channelId,
      "messages",
      messageId,
      "votes",
    ),
    (snap) => {
      const list: ChannelPollVote[] = snap.docs.map((d) => {
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
      console.warn("[channelPollVotes] watch failed:", err);
      callback([]);
    },
  );
}

export async function castChannelVote(
  crewId: string,
  channelId: string,
  messageId: string,
  uid: string,
  option: number,
  userName: string | null,
  userAvatar: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(
      fb.db,
      "crews",
      crewId,
      "channels",
      channelId,
      "messages",
      messageId,
      "votes",
      uid,
    ),
    {
      option,
      userName,
      userAvatar,
      updatedAt: serverTimestamp(),
    },
  );
}

export async function clearChannelVote(
  crewId: string,
  channelId: string,
  messageId: string,
  uid: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(
    doc(
      fb.db,
      "crews",
      crewId,
      "channels",
      channelId,
      "messages",
      messageId,
      "votes",
      uid,
    ),
  );
}
