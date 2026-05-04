import {
  doc,
  getDoc,
  increment,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Global achievement rarity tracking.
 *
 * One Firestore doc at `stats/achievements` stores a flat map of
 * `{ counts: { [achievementId]: number }, totalUsers: number }`. Every
 * client increments the relevant counter once per achievement when it
 * unlocks. Reading the doc + dividing each count by `totalUsers` gives
 * the rarity % we display next to each badge ("X % des joueurs l'ont").
 *
 * Two simplifications vs a "real" leaderboard:
 *
 *  - We don't deduplicate at the source (a client could spam-increment
 *    if they unlocked, deleted their record, and re-unlocked, but
 *    that's not exposed in the UI today). The unlock guard in
 *    App.tsx (`unlockedSet.has(id)`) already prevents the legitimate
 *    case of double-increment per session.
 *  - `totalUsers` is bumped client-side once per `boot` per uid via
 *    `bumpTotalUsersOnce`. That's an over-estimate by design — we'd
 *    rather slightly inflate the denominator than miss users who never
 *    open Settings or never unlock anything.
 */

export type AchievementStats = {
  counts: Record<string, number>;
  totalUsers: number;
};

const STATS_PATH = ["stats", "achievements"] as const;

/** Load the current rarity numbers, one-shot. Returns an empty stats
 *  object if Firestore is unreachable or the doc doesn't exist yet. */
export async function fetchAchievementStats(): Promise<AchievementStats> {
  const fb = getFirebase();
  if (!fb) return { counts: {}, totalUsers: 0 };
  try {
    const ref = doc(fb.db, STATS_PATH[0], STATS_PATH[1]);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { counts: {}, totalUsers: 0 };
    const data = snap.data();
    return {
      counts:
        data && typeof data.counts === "object" && data.counts !== null
          ? (data.counts as Record<string, number>)
          : {},
      totalUsers:
        typeof data?.totalUsers === "number" ? data.totalUsers : 0,
    };
  } catch (err) {
    console.warn("[achievement-stats] fetch failed:", err);
    return { counts: {}, totalUsers: 0 };
  }
}

/** Live subscription for the rarity numbers. The launcher uses this on
 *  the AchievementsPage so the % values stay current while the page is
 *  open (someone else unlocking the same badge in real time will tick
 *  the percentage up). Returns an unsubscribe function. */
export function watchAchievementStats(
  callback: (stats: AchievementStats) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback({ counts: {}, totalUsers: 0 });
    return () => {};
  }
  const ref = doc(fb.db, STATS_PATH[0], STATS_PATH[1]);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback({ counts: {}, totalUsers: 0 });
        return;
      }
      const data = snap.data();
      callback({
        counts:
          data && typeof data.counts === "object" && data.counts !== null
            ? (data.counts as Record<string, number>)
            : {},
        totalUsers:
          typeof data?.totalUsers === "number" ? data.totalUsers : 0,
      });
    },
    (err) => {
      console.warn("[achievement-stats] watch failed:", err);
      callback({ counts: {}, totalUsers: 0 });
    },
  );
}

/** Atomically increment the rarity counter for one achievement. Best-
 *  effort — failures are logged and swallowed because rarity is purely
 *  decorative. */
export async function incrementAchievementCount(
  achievementId: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  try {
    const ref = doc(fb.db, STATS_PATH[0], STATS_PATH[1]);
    await setDoc(
      ref,
      { counts: { [achievementId]: increment(1) } },
      { merge: true },
    );
  } catch (err) {
    console.warn("[achievement-stats] increment failed:", err);
  }
}

/**
 * Bump the global user counter once per uid per boot. We persist a
 * `bumped:{uid}` flag in localStorage to avoid hammering the doc when
 * the user reloads the launcher repeatedly in a single session — the
 * counter is meaningful as "ever-active users", not "active right now".
 */
export async function bumpTotalUsersOnce(uid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const flagKey = `ach.stats.bumped.${uid}.v1`;
  try {
    if (localStorage.getItem(flagKey) === "1") return;
    localStorage.setItem(flagKey, "1");
  } catch {
    // localStorage disabled — fall through and bump anyway. Worst case
    // is a slightly inflated denominator, which is fine.
  }
  try {
    const ref = doc(fb.db, STATS_PATH[0], STATS_PATH[1]);
    await setDoc(ref, { totalUsers: increment(1) }, { merge: true });
  } catch (err) {
    console.warn("[achievement-stats] bump totalUsers failed:", err);
  }
}

/** Compute rarity % for each known achievement id. Returns 0 if total
 *  users is 0 (initial bootstrap), or for ids missing from the counts
 *  map. */
export function computeRarity(stats: AchievementStats): Record<string, number> {
  const out: Record<string, number> = {};
  if (stats.totalUsers <= 0) return out;
  for (const [id, count] of Object.entries(stats.counts)) {
    out[id] = (count / stats.totalUsers) * 100;
  }
  return out;
}
