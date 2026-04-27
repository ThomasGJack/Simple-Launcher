import {
  collection,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";
import type { LogEntry, LogLevel } from "@/lib/logger";

/** Stored shape — adds a server-assigned `serverTs` and the doc id. */
export type StoredLogEntry = LogEntry & {
  id: string;
  serverTs: number | null;
};

/**
 * Real-time stream of recent logs for the admin panel. Sorted server-side by
 * `serverTs` descending so newest entries land at the top of the list. The
 * caller can narrow the stream by user id and/or by levels.
 *
 * Note: requires the caller to have admin read access via the Firestore rules.
 */
export function watchRecentLogs(
  opts: {
    /** Restrict to a single user's logs. When null, all users (admin only). */
    uid: string | null;
    /** Filter by log levels. When empty, returns all levels. */
    levels: LogLevel[];
    /** Hard cap on number of returned entries. */
    max: number;
  },
  callback: (entries: StoredLogEntry[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }

  // Build the constraints array dynamically to support optional filters
  // without nesting query() calls.
  const constraints = [];
  if (opts.uid) constraints.push(where("uid", "==", opts.uid));
  // Firestore `in` clause is capped at 30 values — way over our 5 levels.
  if (opts.levels.length > 0 && opts.levels.length < 5) {
    constraints.push(where("level", "in", opts.levels));
  }
  constraints.push(orderBy("serverTs", "desc"));
  constraints.push(fbLimit(opts.max));

  const q = query(collection(fb.db, "logs"), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const entries: StoredLogEntry[] = snap.docs.map((d) => {
        const data = d.data() as Partial<LogEntry> & { serverTs?: Timestamp };
        return {
          id: d.id,
          uid: data.uid ?? "",
          userName: data.userName ?? "Anonymous",
          userAvatar: data.userAvatar ?? null,
          level: data.level ?? "info",
          message: data.message ?? "",
          source: data.source,
          metadata: data.metadata,
          ts: data.ts ?? 0,
          sessionId: data.sessionId ?? "",
          launcherVersion: data.launcherVersion ?? "?",
          userAgent: data.userAgent ?? "?",
          serverTs:
            data.serverTs instanceof Timestamp ? data.serverTs.toMillis() : null,
        };
      });
      callback(entries);
    },
    (err) => {
      console.warn("[logs] watchRecentLogs failed:", err);
      callback([]);
    },
  );
}
