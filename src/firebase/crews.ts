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
  setDoc,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Discord-like text-only "crew" hierarchy:
 *
 *   /crews/{crewId}
 *     name, emblem, color, position, createdAt
 *     /channels/{channelId}
 *       name, description, position, createdAt
 *       /messages/{messageId}
 *         text, senderUid, senderName, senderAvatar, sentAt
 *
 * Admin (firestore rules `isAdmin()`) creates and configures crews and
 * channels; all authed launchers can read crews/channels and write
 * messages in any channel they can read. There's no per-crew membership
 * for now — the whole launcher community is in every crew.
 */

export type Crew = {
  id: string;
  name: string;
  emblem: string;
  color: string;
  position: number;
  createdAt: number;
};

export type CrewChannel = {
  id: string;
  name: string;
  description: string;
  position: number;
  createdAt: number;
};

export type CrewMessage = {
  id: string;
  text: string;
  senderUid: string;
  senderName: string | null;
  senderAvatar: string | null;
  sentAt: number;
};

export function watchCrews(callback: (crews: Crew[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "crews"),
    (snap) => {
      const list: Crew[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: typeof data.name === "string" ? data.name : "",
          emblem: typeof data.emblem === "string" ? data.emblem : "🏰",
          color: typeof data.color === "string" ? data.color : "#00d4ff",
          position: typeof data.position === "number" ? data.position : 0,
          createdAt: tsToMs(data.createdAt) ?? 0,
        };
      });
      list.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
      callback(list);
    },
    (err) => {
      console.warn("[crews] watch failed:", err);
      callback([]);
    },
  );
}

export function watchCrewChannels(
  crewId: string,
  callback: (channels: CrewChannel[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "crews", crewId, "channels"),
    (snap) => {
      const list: CrewChannel[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: typeof data.name === "string" ? data.name : "",
          description: typeof data.description === "string" ? data.description : "",
          position: typeof data.position === "number" ? data.position : 0,
          createdAt: tsToMs(data.createdAt) ?? 0,
        };
      });
      list.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
      callback(list);
    },
    (err) => {
      console.warn("[crews] channels watch failed:", err);
      callback([]);
    },
  );
}

export function watchChannelMessages(
  crewId: string,
  channelId: string,
  callback: (messages: CrewMessage[]) => void,
  max: number = 100,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "crews", crewId, "channels", channelId, "messages"),
    orderBy("sentAt", "desc"),
    fbLimit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CrewMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: typeof data.text === "string" ? data.text : "",
          senderUid: typeof data.senderUid === "string" ? data.senderUid : "",
          senderName: typeof data.senderName === "string" ? data.senderName : null,
          senderAvatar: typeof data.senderAvatar === "string" ? data.senderAvatar : null,
          sentAt: tsToMs(data.sentAt) ?? 0,
        };
      });
      // Reverse so oldest is first (UI scrolls bottom = newest).
      list.reverse();
      callback(list);
    },
    (err) => {
      console.warn("[crews] messages watch failed:", err);
      callback([]);
    },
  );
}

export async function sendChannelMessage(
  crewId: string,
  channelId: string,
  text: string,
  senderUid: string,
  senderName: string | null,
  senderAvatar: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await addDoc(
    collection(fb.db, "crews", crewId, "channels", channelId, "messages"),
    {
      text: text.trim(),
      senderUid,
      senderName,
      senderAvatar,
      sentAt: serverTimestamp(),
    },
  );
}

// ─── Admin ops ─────────────────────────────────────────────────────────

export async function createCrew(crew: Omit<Crew, "id" | "createdAt">): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "crews"), {
    name: crew.name,
    emblem: crew.emblem,
    color: crew.color,
    position: crew.position,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCrew(id: string, patch: Partial<Omit<Crew, "id">>): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "crews", id), patch);
}

export async function deleteCrew(id: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "crews", id));
}

export async function createChannel(
  crewId: string,
  channel: Omit<CrewChannel, "id" | "createdAt">,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "crews", crewId, "channels"), {
    name: channel.name,
    description: channel.description,
    position: channel.position,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateChannel(
  crewId: string,
  channelId: string,
  patch: Partial<Omit<CrewChannel, "id">>,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "crews", crewId, "channels", channelId),
    patch,
    { merge: true },
  );
}

export async function deleteChannel(crewId: string, channelId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "crews", crewId, "channels", channelId));
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
