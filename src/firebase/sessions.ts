import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Coordinated game sessions. The host picks a module + time, friends RSVP.
 * Real-time via onSnapshot. Sessions auto-prune themselves visually after
 * they end (no server cleanup yet — they linger in Firestore).
 */
export type GameSession = {
  id: string;
  moduleId: string;
  moduleName: string;
  moduleIcon: string | null;
  hostUid: string;
  hostName: string | null;
  hostAvatar: string | null;
  scheduledAt: number; // millis (when the session starts)
  /** Free-form note shown on the card. */
  note: string;
  createdAt: number;
};

export type GameSessionDraft = {
  moduleId: string;
  moduleName: string;
  moduleIcon: string | null;
  scheduledAt: number;
  note: string;
};

export type RsvpStatus = "yes" | "maybe" | "no";

export type SessionRsvp = {
  uid: string;
  status: RsvpStatus;
  userName: string | null;
  userAvatar: string | null;
};

export function watchSessions(callback: (list: GameSession[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(collection(fb.db, "sessions"), orderBy("scheduledAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const list: GameSession[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          moduleId: typeof data.moduleId === "string" ? data.moduleId : "",
          moduleName: typeof data.moduleName === "string" ? data.moduleName : "",
          moduleIcon: typeof data.moduleIcon === "string" ? data.moduleIcon : null,
          hostUid: typeof data.hostUid === "string" ? data.hostUid : "",
          hostName: typeof data.hostName === "string" ? data.hostName : null,
          hostAvatar: typeof data.hostAvatar === "string" ? data.hostAvatar : null,
          scheduledAt: tsToMs(data.scheduledAt) ?? 0,
          note: typeof data.note === "string" ? data.note : "",
          createdAt: tsToMs(data.createdAt) ?? 0,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[sessions] watch failed:", err);
      callback([]);
    },
  );
}

export async function createSession(
  draft: GameSessionDraft,
  hostUid: string,
  hostName: string | null,
  hostAvatar: string | null,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "sessions"), {
    moduleId: draft.moduleId,
    moduleName: draft.moduleName,
    moduleIcon: draft.moduleIcon,
    scheduledAt: Timestamp.fromMillis(draft.scheduledAt),
    note: draft.note,
    hostUid,
    hostName,
    hostAvatar,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteSession(id: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "sessions", id));
}

export function watchRsvps(
  sessionId: string,
  callback: (rsvps: SessionRsvp[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "sessions", sessionId, "rsvps"),
    (snap) => {
      const list: SessionRsvp[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          status: validRsvp(data.status),
          userName: typeof data.userName === "string" ? data.userName : null,
          userAvatar: typeof data.userAvatar === "string" ? data.userAvatar : null,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[sessions] watchRsvps failed:", err);
      callback([]);
    },
  );
}

export async function setRsvp(
  sessionId: string,
  uid: string,
  status: RsvpStatus,
  userName: string | null,
  userAvatar: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(doc(fb.db, "sessions", sessionId, "rsvps", uid), {
    status,
    userName,
    userAvatar,
    updatedAt: serverTimestamp(),
  });
}

export async function clearRsvp(sessionId: string, uid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "sessions", sessionId, "rsvps", uid));
}

function validRsvp(v: unknown): RsvpStatus {
  if (v === "yes" || v === "maybe" || v === "no") return v;
  return "maybe";
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
