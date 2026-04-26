import {
  collection,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

export type PlaytimeEntry = {
  moduleId: string;
  totalMs: number;
  totalLaunches: number;
  lastPlayedAt: number | null;
};

export async function recordPlaytime(uid: string, moduleId: string, durationMs: number) {
  const fb = getFirebase();
  if (!fb) return;
  await setDoc(
    doc(fb.db, "users", uid, "playtime", moduleId),
    {
      moduleId,
      totalMs: increment(durationMs),
      totalLaunches: increment(1),
      lastPlayedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function watchPlaytime(uid: string, callback: (entries: PlaytimeEntry[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(collection(fb.db, "users", uid, "playtime"), (snap) => {
    const entries: PlaytimeEntry[] = snap.docs.map((d) => {
      const data = d.data();
      const lastPlayedAt = data.lastPlayedAt?.toMillis?.() ?? null;
      return {
        moduleId: d.id,
        totalMs: typeof data.totalMs === "number" ? data.totalMs : 0,
        totalLaunches: typeof data.totalLaunches === "number" ? data.totalLaunches : 0,
        lastPlayedAt,
      };
    });
    callback(entries);
  });
}

export function formatPlaytime(ms: number): string {
  if (ms < 60_000) return "< 1 min";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin > 0 ? `${hours} h ${remMin} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
}
