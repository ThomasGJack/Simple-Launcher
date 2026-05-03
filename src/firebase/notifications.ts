import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Per-user notifications subcollection : `users/{uid}/notifications/{auto-id}`.
 *
 * Sources :
 *   - Achievement unlocked (written by `recordUnlock`'s caller)
 *   - Invitation reçue / acceptée (written by the invitations module)
 *   - Future : friend went online, news published, module updated, etc.
 *
 * Each entry is small enough that we keep them in a single collection
 * (no pagination needed for the foreseeable future). The watcher caps
 * at 50 most recent for the UI; older entries are kept in Firestore
 * but only surface if the limit is bumped.
 *
 * Read state : a `readAt: Timestamp` field is set when the user opens
 * the panel + clicks a notification (or "mark all read"). Unread is
 * `readAt == null`.
 */

export type NotificationKind =
  | "achievement"
  | "invitation"
  | "friend"
  | "news"
  | "release"
  | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  /** Epoch ms — derived from server timestamp. */
  createdAtMs: number;
  /** Null when unread, Epoch ms when read. */
  readAtMs: number | null;
  /** Optional internal route to navigate to when the notif is clicked.
   *  Format: same as `useUIStore` route variants serialized as a string,
   *  parsed by the panel. Examples : `module:glitchscolony`, `messages`,
   *  `crews:abc`. */
  link?: string;
  /** Optional metadata for the icon (achievement id, friend uid, etc.). */
  meta?: Record<string, string | number>;
};

export async function recordNotification(
  uid: string,
  payload: Omit<AppNotification, "id" | "createdAtMs" | "readAtMs">,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) return "";
  const ref = await addDoc(collection(fb.db, "users", uid, "notifications"), {
    ...payload,
    createdAt: serverTimestamp(),
    readAt: null,
  });
  return ref.id;
}

export function watchNotifications(
  uid: string,
  callback: (notifs: AppNotification[]) => void,
  cap = 50,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "users", uid, "notifications"),
    orderBy("createdAt", "desc"),
    limit(cap),
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: AppNotification[] = snap.docs.map((d) => {
        const data = d.data();
        const created =
          data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : 0;
        const read =
          data.readAt instanceof Timestamp ? data.readAt.toMillis() : null;
        return {
          id: d.id,
          kind: (data.kind as NotificationKind) ?? "system",
          title: typeof data.title === "string" ? data.title : "",
          description:
            typeof data.description === "string" ? data.description : "",
          createdAtMs: created,
          readAtMs: read,
          link: typeof data.link === "string" ? data.link : undefined,
          meta:
            data.meta && typeof data.meta === "object"
              ? (data.meta as Record<string, string | number>)
              : undefined,
        };
      });
      callback(items);
    },
    (err) => {
      console.warn("[notifications] watch failed:", err);
      callback([]);
    },
  );
}

export async function markAsRead(uid: string, notifId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await updateDoc(doc(fb.db, "users", uid, "notifications", notifId), {
    readAt: serverTimestamp(),
  });
}

/** Marks every notification in the list as read in one batched write.
 *  No-op when the list is empty or when all entries are already read. */
export async function markAllAsRead(
  uid: string,
  notifIds: string[],
): Promise<void> {
  const fb = getFirebase();
  if (!fb || notifIds.length === 0) return;
  const batch = writeBatch(fb.db);
  for (const id of notifIds) {
    batch.update(doc(fb.db, "users", uid, "notifications", id), {
      readAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
