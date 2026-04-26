import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

export type CurrentActivity = {
  moduleId: string;
  moduleName: string;
  startedAt: number;
};

export type UserPresence = {
  uid: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  discordId: string | null;
  lastSeen: number | null;
  currentActivity: CurrentActivity | null;
};

export type PresenceStatus = "online" | "idle" | "offline";

const ONLINE_WINDOW_MS = 60_000;
const IDLE_WINDOW_MS = 5 * 60_000;

export function statusFromLastSeen(lastSeen: number | null): PresenceStatus {
  if (!lastSeen) return "offline";
  const now = Date.now();
  if (now - lastSeen < ONLINE_WINDOW_MS) return "online";
  if (now - lastSeen < IDLE_WINDOW_MS) return "idle";
  return "offline";
}

export async function pushHeartbeat(uid: string, activity: CurrentActivity | null) {
  const fb = getFirebase();
  if (!fb) return;
  await setDoc(
    doc(fb.db, "users", uid),
    {
      lastSeen: serverTimestamp(),
      currentActivity: activity,
    },
    { merge: true },
  );
}

export function watchAllUsers(callback: (users: UserPresence[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(collection(fb.db, "users"), (snap) => {
    const users: UserPresence[] = snap.docs.map((d) => {
      const data = d.data();
      const lastSeen = data.lastSeen?.toMillis?.() ?? null;
      const activity = data.currentActivity
        ? {
            moduleId: data.currentActivity.moduleId,
            moduleName: data.currentActivity.moduleName,
            startedAt: data.currentActivity.startedAt,
          }
        : null;
      return {
        uid: d.id,
        displayName: data.displayName ?? null,
        username: data.username ?? null,
        avatarUrl: data.avatarUrl ?? null,
        discordId: data.discordId ?? null,
        lastSeen,
        currentActivity: activity,
      };
    });
    callback(users);
  });
}
