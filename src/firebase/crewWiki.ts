// Wiki collaboratif par crew. Sub-collection
// `/crews/{crewId}/wikiPages/{pageId}` — pages markdown éditables
// par n'importe quel member. Pas de hiérarchie parent en MVP
// (ajout en Phase ultérieure si besoin).
//
// Last-write-wins en cas d'édition concurrente — pas de OT/CRDT.
// Acceptable pour un crew d'amis ; le label "Édité par X il y a 12s"
// décourage les collisions.

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

export type WikiPage = {
  id: string;
  title: string;
  body: string; // markdown
  authorUid: string;
  authorName: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export function watchWikiPages(
  crewId: string,
  callback: (pages: WikiPage[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "crews", crewId, "wikiPages"),
    orderBy("position", "asc"),
    fbLimit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: WikiPage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: typeof data.title === "string" ? data.title : "Sans titre",
          body: typeof data.body === "string" ? data.body : "",
          authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
          authorName: typeof data.authorName === "string" ? data.authorName : null,
          position: typeof data.position === "number" ? data.position : 0,
          createdAt: tsToMs(data.createdAt) ?? 0,
          updatedAt: tsToMs(data.updatedAt) ?? 0,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[crewWiki] watch failed:", err);
      callback([]);
    },
  );
}

export async function createWikiPage(
  crewId: string,
  title: string,
  body: string,
  authorUid: string,
  authorName: string | null,
  position: number,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "crews", crewId, "wikiPages"), {
    title,
    body,
    authorUid,
    authorName,
    position,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWikiPage(
  crewId: string,
  pageId: string,
  patch: { title?: string; body?: string; position?: number },
  authorUid: string,
  authorName: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "crews", crewId, "wikiPages", pageId), {
    ...patch,
    authorUid,
    authorName,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWikiPage(
  crewId: string,
  pageId: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "crews", crewId, "wikiPages", pageId));
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
