import {
  collection,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Per-day launch tracking — used by the streak achievements
 * (`streak-3-days`, `streak-7-days`) and by the weekend-warrior
 * achievement (`weekend-warrior` reads `weekdayMs` for Saturday /
 * Sunday entries).
 *
 * Stored at `users/{uid}/launchDays/{YYYY-MM-DD}`. Written on every
 * `module-exited` event (the playtime hook in App.tsx). Snapshot
 * fields:
 *
 *  - `date`     : "YYYY-MM-DD" (redundant with the doc id, kept for
 *                 simpler filtering when reading without a key context)
 *  - `dow`      : 0 = Sunday, 6 = Saturday — pre-computed so the
 *                 client doesn't need a Date parse round-trip
 *  - `launches` : number of distinct launches this day
 *  - `totalMs`  : cumulative playtime this day across modules
 *  - `updatedAt`: serverTimestamp of the last write (debugging only)
 *
 * Idempotent: each launch hits `setDoc(merge: true)` with a
 * `launches: increment(1)` + `totalMs: increment(durationMs)` patch.
 */
export type LaunchDay = {
  /** "YYYY-MM-DD" in local time — the user-perceived calendar day. */
  date: string;
  /** Day of week, 0 (Sunday) .. 6 (Saturday). */
  dow: number;
  launches: number;
  totalMs: number;
};

/** Format `Date` as "YYYY-MM-DD" using the user's local timezone. UTC
 *  would silently shift midnight for non-UTC players which would break
 *  streak detection across timezones. */
export function localDateKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Increment today's `launchDays` doc with one extra launch + the
 *  exited session's duration. Best-effort — failures are logged and
 *  swallowed because streak tracking is purely cosmetic. */
export async function recordLaunchDay(
  uid: string,
  durationMs: number,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const now = new Date();
  const date = localDateKey(now);
  try {
    await setDoc(
      doc(fb.db, "users", uid, "launchDays", date),
      {
        date,
        dow: now.getDay(),
        launches: increment(1),
        totalMs: increment(Math.max(0, durationMs)),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[launchDays] record failed:", err);
  }
}

export function watchLaunchDays(
  uid: string,
  callback: (days: LaunchDay[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "users", uid, "launchDays"),
    (snap) => {
      const days: LaunchDay[] = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.updatedAt;
        const _at = ts instanceof Timestamp ? ts.toMillis() : 0;
        void _at;
        return {
          date: typeof data.date === "string" ? data.date : d.id,
          dow: typeof data.dow === "number" ? data.dow : 0,
          launches: typeof data.launches === "number" ? data.launches : 0,
          totalMs: typeof data.totalMs === "number" ? data.totalMs : 0,
        };
      });
      callback(days);
    },
    (err) => {
      console.warn("[launchDays] watch failed:", err);
      callback([]);
    },
  );
}

/**
 * Compute the longest CONSECUTIVE streak ending today. Looks back at
 * `days` for "YYYY-MM-DD" keys and walks backwards from today; if a key
 * is missing, the streak ends. Returns 0 if today isn't in the set.
 */
export function computeCurrentStreak(days: LaunchDay[]): number {
  const set = new Set(days.map((d) => d.date));
  const today = new Date();
  // Drop the time-of-day so each iteration walks one calendar day.
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  const cursor = new Date(today);
  while (set.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Maximum single-day playtime (in ms) recorded on a Saturday (dow === 6)
 *  or Sunday (dow === 0). Used by the weekend-warrior achievement. */
export function maxWeekendDayMs(days: LaunchDay[]): number {
  let max = 0;
  for (const d of days) {
    if (d.dow !== 0 && d.dow !== 6) continue;
    if (d.totalMs > max) max = d.totalMs;
  }
  return max;
}
