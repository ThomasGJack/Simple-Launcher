import { collection, getDocs } from "firebase/firestore";
import { getFirebase } from "@/firebase/config";

/**
 * Admin-only stats aggregation.
 *
 * Fan-out shape : the launcher writes per-user `users/{uid}/playtime/{moduleId}`
 * docs (see `firebase/playtime.ts`) on every game-launch exit. To produce
 * a global-per-module view we need to fold those across every user.
 *
 * Strategy here : list `/users` once, then for each user fire a one-shot
 * `getDocs` on their `playtime` subcollection. Sequential / `Promise.all`,
 * not a `collectionGroup` query — avoids having to touch firestore.rules
 * to allow admin-wide collection groups, and at the target ~50 user
 * scale this is plenty fast (1 + N reads, typically under 1s).
 *
 * If the launcher ever grows past a few hundred users this should move
 * to a Cloud Function that maintains an aggregated `globalStats/...`
 * collection, which the admin tab would then read in a single query.
 */

export type ModuleStats = {
  moduleId: string;
  totalLaunches: number;
  totalMs: number;
  uniqueUsers: number;
  /** Most recent launch across all users, in epoch ms. */
  lastPlayedAt: number | null;
};

export type AdminStatsSnapshot = {
  /** Total registered users (size of `/users`). */
  totalUsers: number;
  /** Number of users with at least one playtime entry. */
  activeUsers: number;
  /** Sum of all launches across all users + modules. */
  totalLaunches: number;
  /** Sum of all playtime in ms across all users + modules. */
  totalMs: number;
  /** Per-module aggregation, sorted by `totalLaunches` descending. */
  modules: ModuleStats[];
  /** Wall-clock ms it took to load this snapshot — surfaced in the UI
   *  so admins know if a refresh is going to be slow. */
  loadDurationMs: number;
};

/**
 * One-shot fetch of admin stats. Throws on Firestore error or when
 * Firebase isn't initialized. Only callers in admin-only routes should
 * invoke this — the per-user playtime reads are scoped via Firestore
 * security rules to the user themselves OR to admins (allowed by the
 * `request.auth.uid in admins` rule, see firestore.rules).
 */
export async function loadAdminStats(): Promise<AdminStatsSnapshot> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non initialisé");
  const t0 = performance.now();

  // 1. List all users.
  const usersSnap = await getDocs(collection(fb.db, "users"));
  const totalUsers = usersSnap.size;

  // 2. For each user, fetch their playtime subcollection in parallel.
  //    `Promise.all` rather than serial — at 50 users serial would take
  //    1-2s, parallel ~200-400 ms.
  const playtimeSnaps = await Promise.all(
    usersSnap.docs.map((u) => getDocs(collection(fb.db, "users", u.id, "playtime"))),
  );

  // 3. Aggregate per module.
  const byModule = new Map<string, ModuleStats>();
  let activeUsers = 0;
  let totalLaunches = 0;
  let totalMs = 0;

  for (const snap of playtimeSnaps) {
    if (snap.empty) continue;
    activeUsers++;
    for (const doc of snap.docs) {
      const data = doc.data();
      const moduleId = typeof data.moduleId === "string" ? data.moduleId : doc.id;
      const launches = typeof data.totalLaunches === "number" ? data.totalLaunches : 0;
      const ms = typeof data.totalMs === "number" ? data.totalMs : 0;
      const lastRaw = data.lastPlayedAt;
      const lastPlayedAt =
        lastRaw && typeof (lastRaw as { toMillis?: () => number }).toMillis === "function"
          ? (lastRaw as { toMillis: () => number }).toMillis()
          : null;

      totalLaunches += launches;
      totalMs += ms;

      const existing = byModule.get(moduleId);
      if (existing) {
        existing.totalLaunches += launches;
        existing.totalMs += ms;
        existing.uniqueUsers += 1;
        if (lastPlayedAt && (!existing.lastPlayedAt || lastPlayedAt > existing.lastPlayedAt)) {
          existing.lastPlayedAt = lastPlayedAt;
        }
      } else {
        byModule.set(moduleId, {
          moduleId,
          totalLaunches: launches,
          totalMs: ms,
          uniqueUsers: 1,
          lastPlayedAt,
        });
      }
    }
  }

  const modules = [...byModule.values()].sort(
    (a, b) => b.totalLaunches - a.totalLaunches,
  );

  return {
    totalUsers,
    activeUsers,
    totalLaunches,
    totalMs,
    modules,
    loadDurationMs: Math.round(performance.now() - t0),
  };
}
