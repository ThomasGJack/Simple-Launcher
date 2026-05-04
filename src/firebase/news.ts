import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * News broadcast across every launcher in real time. Admin-only writes,
 * any authed user can read. Updates propagate via onSnapshot — no relaunch
 * required client-side.
 */
export type NewsPoll = {
  question: string;
  options: string[];
};

export type News = {
  id: string;
  title: string;
  body: string;
  /** Optional hex color used for the accent strip on the home card. */
  accent: string | null;
  pinned: boolean;
  hidden: boolean;
  /** Optional embedded poll. When set, renders below the news body with
   *  live vote counts. Votes are stored in the `votes` sub-collection. */
  poll: NewsPoll | null;
  createdAt: number;
  updatedAt: number;
  authorUid: string;
  authorName: string | null;
};

export type NewsDraft = {
  title: string;
  body: string;
  accent: string | null;
  pinned: boolean;
  hidden: boolean;
  poll: NewsPoll | null;
};

/**
 * Real-time stream of every news doc, ordered by `pinned desc, updatedAt desc`.
 * Pinned items always float to the top; within each tier, latest update wins.
 */
export function watchNews(callback: (entries: News[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  // Cap the live stream to the 20 most recent updates. Older articles
  // are still readable via direct fetch on the public news page if we
  // ever build one — the launcher only surfaces the recent activity.
  const q = query(
    collection(fb.db, "news"),
    orderBy("updatedAt", "desc"),
    fbLimit(20),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: News[] = snap.docs.map((d) => {
        const data = d.data();
        const rawPoll = data.poll;
        const poll: NewsPoll | null =
          rawPoll &&
          typeof rawPoll === "object" &&
          typeof rawPoll.question === "string" &&
          Array.isArray(rawPoll.options)
            ? {
                question: rawPoll.question,
                options: rawPoll.options.filter((o: unknown) => typeof o === "string"),
              }
            : null;
        return {
          id: d.id,
          title: typeof data.title === "string" ? data.title : "",
          body: typeof data.body === "string" ? data.body : "",
          accent: typeof data.accent === "string" ? data.accent : null,
          pinned: !!data.pinned,
          hidden: !!data.hidden,
          poll,
          createdAt: tsToMs(data.createdAt) ?? 0,
          updatedAt: tsToMs(data.updatedAt) ?? 0,
          authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
          authorName: typeof data.authorName === "string" ? data.authorName : null,
        };
      });
      // Pinned items first, then chronological — the Firestore index can't
      // sort on two fields without a composite index, so we pin client-side.
      list.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      callback(list);
    },
    (err) => {
      console.warn("[news] watchNews failed:", err);
      callback([]);
    },
  );
}

export async function createNews(
  draft: NewsDraft,
  authorUid: string,
  authorName: string | null,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "news"), {
    title: draft.title,
    body: draft.body,
    accent: draft.accent,
    pinned: draft.pinned,
    hidden: draft.hidden,
    poll: draft.poll,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    authorUid,
    authorName,
  });
  return ref.id;
}

export async function updateNews(id: string, patch: Partial<NewsDraft>): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "news", id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteNews(id: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "news", id));
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
