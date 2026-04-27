import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Persisted unlock record in `/users/{uid}/achievements/{achievementId}`.
 * Only created the moment the user satisfies the condition for the first
 * time, never deleted — once unlocked, always unlocked.
 */
export type UnlockedAchievement = {
  id: string;
  unlockedAt: number;
};

export async function recordUnlock(uid: string, achievementId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await setDoc(
    doc(fb.db, "users", uid, "achievements", achievementId),
    {
      id: achievementId,
      unlockedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function watchAchievements(
  uid: string,
  callback: (unlocked: UnlockedAchievement[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "users", uid, "achievements"),
    (snap) => {
      const unlocked: UnlockedAchievement[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          unlockedAt:
            data.unlockedAt instanceof Timestamp ? data.unlockedAt.toMillis() : 0,
        };
      });
      callback(unlocked);
    },
    (err) => {
      console.warn("[achievements] watch failed:", err);
      callback([]);
    },
  );
}
