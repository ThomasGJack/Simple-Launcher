import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getFirebase } from "@/firebase/config";

/**
 * One snapshot of a server's player count at a given point in time. Snapshots
 * are written by every running launcher client at most once every
 * `MIN_SNAPSHOT_INTERVAL_MS` so the cumulative timeline stays dense without
 * Firestore taking too many writes.
 *
 * Doc id = `<addressKey>__<roundedMinuteEpoch>` — natural deduplication: two
 * clients posting at the same minute write to the same doc, last wins.
 */
export type ServerSnapshot = {
  online: boolean;
  playersOnline: number;
  playersMax: number;
  /** Server-side timestamp (Firestore Timestamp). */
  ts: Timestamp;
};

/** All-time aggregate for a server, kept on the parent doc for fast reads. */
export type ServerAllTime = {
  peakPlayers: number;
  peakAt: Timestamp | null;
  lastUpdatedAt: Timestamp | null;
};

const MIN_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 min between writes
const HISTORY_HOURS = 24;
const lastWriteAt = new Map<string, number>();

/** Sanitizes the address into a Firestore-safe document ID. The hostname
 *  becomes the parent doc id under `/serverStats`. */
export function addressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/**
 * Posts a snapshot of the current server status to Firestore — at most once
 * per `MIN_SNAPSHOT_INTERVAL_MS` per address per running client. Updates the
 * all-time peak doc atomically when the new sample beats the previous record.
 */
export async function postServerSnapshot(
  address: string,
  online: boolean,
  playersOnline: number,
  playersMax: number,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const auth = fb.auth.currentUser;
  if (!auth) return; // Need authentication to write per Firestore rules.

  const now = Date.now();
  const lastAt = lastWriteAt.get(address);
  if (lastAt !== undefined && now - lastAt < MIN_SNAPSHOT_INTERVAL_MS) return;
  lastWriteAt.set(address, now);

  const key = addressKey(address);
  // Round to the nearest 5-minute slot so concurrent writers from different
  // clients converge onto the same doc id (no duplicate spam).
  const slot = Math.floor(now / MIN_SNAPSHOT_INTERVAL_MS) * MIN_SNAPSHOT_INTERVAL_MS;
  const snapshotId = `${slot}`;

  try {
    const snapRef = doc(fb.db, "serverStats", key, "snapshots", snapshotId);
    await setDoc(snapRef, {
      online,
      playersOnline,
      playersMax,
      ts: Timestamp.fromMillis(now),
    });

    // Update the all-time peak only if this sample beats it. Read-then-write
    // is acceptable here — the data is best-effort, not financial.
    const summaryRef = doc(fb.db, "serverStats", key);
    const existing = await getDoc(summaryRef);
    const prev = existing.exists() ? (existing.data() as ServerAllTime) : null;
    if (!prev || playersOnline > prev.peakPlayers) {
      await setDoc(
        summaryRef,
        {
          peakPlayers: playersOnline,
          peakAt: Timestamp.fromMillis(now),
          lastUpdatedAt: Timestamp.fromMillis(now),
        },
        { merge: true },
      );
    } else {
      await setDoc(
        summaryRef,
        { lastUpdatedAt: Timestamp.fromMillis(now) },
        { merge: true },
      );
    }
  } catch (err) {
    console.warn(`[server-activity] post failed for ${address}:`, err);
  }
}

/**
 * Reads the last 24h of snapshots for an address. Returns them sorted by
 * timestamp ascending so the chart can render left-to-right.
 */
export async function fetchLast24hSnapshots(address: string): Promise<ServerSnapshot[]> {
  const fb = getFirebase();
  if (!fb) return [];
  try {
    const key = addressKey(address);
    const cutoff = Timestamp.fromMillis(Date.now() - HISTORY_HOURS * 60 * 60 * 1000);
    const snapsRef = collection(fb.db, "serverStats", key, "snapshots");
    const q = query(snapsRef, where("ts", ">=", cutoff), orderBy("ts", "asc"), limit(500));
    const result = await getDocs(q);
    return result.docs.map((d) => d.data() as ServerSnapshot);
  } catch (err) {
    console.warn(`[server-activity] fetch24h failed for ${address}:`, err);
    return [];
  }
}

export async function fetchServerAllTime(address: string): Promise<ServerAllTime | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const key = addressKey(address);
    const summary = await getDoc(doc(fb.db, "serverStats", key));
    if (!summary.exists()) return null;
    return summary.data() as ServerAllTime;
  } catch (err) {
    console.warn(`[server-activity] fetchAllTime failed for ${address}:`, err);
    return null;
  }
}

/**
 * Hook combining the 24h history + the all-time summary in one call. Refetches
 * on a 2-minute interval so a long-lived module detail page stays current.
 */
export function useServerActivity(address: string | undefined | null): {
  history: ServerSnapshot[];
  allTime: ServerAllTime | null;
  loaded: boolean;
} {
  const [history, setHistory] = useState<ServerSnapshot[]>([]);
  const [allTime, setAllTime] = useState<ServerAllTime | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address) {
      setHistory([]);
      setAllTime(null);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const [hist, all] = await Promise.all([
        fetchLast24hSnapshots(address),
        fetchServerAllTime(address),
      ]);
      if (cancelled) return;
      setHistory(hist);
      setAllTime(all);
      setLoaded(true);
    };
    tick();
    const interval = setInterval(tick, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address]);

  return { history, allTime, loaded };
}
