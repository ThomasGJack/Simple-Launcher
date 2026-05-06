import {
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Per-user "when do you play" heatmap : counts game launches by
 * day-of-week × hour-of-day. Stored as a single doc with a map of
 * 168 cells max (7 days × 24 hours), keyed by the string
 * `<dow>-<hour>` (Monday=0 … Sunday=6).
 *
 * Used to render :
 *  - Personal heatmap on the launcher's Profile page (when do *I*
 *    play the most ?)
 *  - Public heatmap on a friend's profile (so the user can see at
 *    a glance "Oh, Alastor plays mostly weekends 20h-23h").
 *
 * Doc path : `users/{uid}/playHeatmap/data`. Single doc rather than
 * a sub-collection since 168 ints fit easily and updates are
 * atomic via FieldValue.increment().
 */

export type Heatmap = {
  /** Cell value = number of launches at that day×hour bucket.
   *  Missing keys mean 0. */
  cells: Record<string, number>;
  totalLaunches: number;
  updatedAtMs: number | null;
};

export function cellKey(dayOfWeek: number, hour: number): string {
  return `${dayOfWeek}-${hour}`;
}

/** Records a single launch event into the user's heatmap. Best-
 *  effort — failures don't block the launch flow. */
export async function recordHeatmapHit(
  uid: string,
  ts: number = Date.now(),
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const date = new Date(ts);
  // Monday = 0, Tuesday = 1, …, Sunday = 6 (French/ISO standard).
  // Date.getDay() returns Sun = 0, so we shift.
  const dayOfWeek = (date.getDay() + 6) % 7;
  const hour = date.getHours();
  const key = cellKey(dayOfWeek, hour);
  try {
    await setDoc(
      doc(fb.db, "users", uid, "playHeatmap", "data"),
      {
        cells: { [key]: increment(1) },
        totalLaunches: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[playHeatmap] record failed:", err);
  }
}

/** Subscribe to the heatmap doc for a given user. Fires immediately
 *  with an empty heatmap if the doc doesn't exist yet. */
export function watchHeatmap(
  uid: string,
  callback: (heatmap: Heatmap) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback({ cells: {}, totalLaunches: 0, updatedAtMs: null });
    return () => {};
  }
  return onSnapshot(
    doc(fb.db, "users", uid, "playHeatmap", "data"),
    (snap) => {
      if (!snap.exists()) {
        callback({ cells: {}, totalLaunches: 0, updatedAtMs: null });
        return;
      }
      const data = snap.data();
      const cells = (data?.cells ?? {}) as Record<string, number>;
      callback({
        cells,
        totalLaunches:
          typeof data?.totalLaunches === "number" ? data.totalLaunches : 0,
        updatedAtMs: data?.updatedAt?.toMillis?.() ?? null,
      });
    },
    (err) => {
      console.warn(`[playHeatmap] watch failed for ${uid}:`, err);
      callback({ cells: {}, totalLaunches: 0, updatedAtMs: null });
    },
  );
}
