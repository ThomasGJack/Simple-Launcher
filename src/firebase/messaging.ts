import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";
import { logger } from "@/lib/logger";
import type { Conversation, Message } from "@/types/messaging";
import { conversationIdFor } from "@/types/messaging";

/**
 * Firestore layout for the messaging system:
 *
 *   /conversations/{cid}                  → Conversation metadata
 *   /conversations/{cid}/messages/{mid}   → Individual messages
 *
 * Where `cid = [uidA, uidB].sort().join("__")` so both peers compute the
 * same id deterministically. Firestore rules restrict read/write to the
 * two participants only.
 */

/**
 * Creates the conversation doc if it doesn't exist yet, populating both
 * participants' metadata snapshots so the conversation list can render
 * without extra `/users` reads. Idempotent — safe to call every time the
 * UI opens a chat.
 */
export async function ensureConversation(opts: {
  meUid: string;
  meName: string;
  meAvatar: string | null;
  peerUid: string;
  peerName: string;
  peerAvatar: string | null;
}): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const cid = conversationIdFor(opts.meUid, opts.peerUid);
  const ref = doc(fb.db, "conversations", cid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Refresh the cached display names in case either user renamed in Discord.
    await setDoc(
      ref,
      {
        participantNames: {
          [opts.meUid]: opts.meName,
          [opts.peerUid]: opts.peerName,
        },
        participantAvatars: {
          [opts.meUid]: opts.meAvatar,
          [opts.peerUid]: opts.peerAvatar,
        },
      },
      { merge: true },
    );
    return cid;
  }
  // Fresh doc. Sort participants the same way the cid is built so that the
  // tuple matches the docs id components.
  const sorted = [opts.meUid, opts.peerUid].sort();
  await setDoc(ref, {
    participants: sorted,
    participantNames: {
      [opts.meUid]: opts.meName,
      [opts.peerUid]: opts.peerName,
    },
    participantAvatars: {
      [opts.meUid]: opts.meAvatar,
      [opts.peerUid]: opts.peerAvatar,
    },
    lastMessage: null,
    lastReadAt: {
      [opts.meUid]: Date.now(),
      [opts.peerUid]: 0,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logger.action("Conversation started", {
    source: "messaging.ensureConversation",
    metadata: { peerUid: opts.peerUid, peerName: opts.peerName, conversationId: cid },
  });
  return cid;
}

/**
 * Sends a message. Creates the message doc in the subcollection and updates
 * the parent conversation's `lastMessage` + `updatedAt` so the conversation
 * list can sort/filter without scanning every subcollection.
 */
export async function sendMessage(opts: {
  conversationId: string;
  senderUid: string;
  senderName: string;
  senderAvatar: string | null;
  text: string;
}): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const trimmed = opts.text.trim();
  if (!trimmed) return;
  const now = Date.now();

  const messagesRef = collection(fb.db, "conversations", opts.conversationId, "messages");
  await addDoc(messagesRef, {
    senderUid: opts.senderUid,
    senderName: opts.senderName,
    senderAvatar: opts.senderAvatar,
    text: trimmed,
    sentAt: now,
    serverTs: serverTimestamp(),
  });

  // Update the parent conversation's preview + activity. We use updateDoc
  // (not setDoc-with-merge) because we need dot-notation paths to update a
  // single key inside the `lastReadAt` map. setDoc(..., { merge: true })
  // *doesn't* expand `"lastReadAt.uidA"` into `lastReadAt: { uidA: ... }` —
  // it would store a literal top-level field named with a dot. updateDoc
  // does honor dot-paths.
  const convRef = doc(fb.db, "conversations", opts.conversationId);
  await updateDoc(convRef, {
    lastMessage: {
      text: trimmed.slice(0, 200), // cap preview length
      senderUid: opts.senderUid,
      sentAt: now,
    },
    // Mark sender as having read up to now (they obviously saw their own
    // message). Other participant's lastReadAt is left untouched.
    [`lastReadAt.${opts.senderUid}`]: now,
    updatedAt: serverTimestamp(),
  });

  logger.action("Message sent", {
    source: "messaging.sendMessage",
    metadata: { conversationId: opts.conversationId, length: trimmed.length },
  });
}

/**
 * Marks the conversation as read up to now for `meUid`. Called when the user
 * opens or scrolls to the bottom of the conversation. Does not affect the
 * other participant.
 */
export async function markConversationRead(conversationId: string, meUid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  try {
    // updateDoc honors `"lastReadAt.uid"` as a nested path; setDoc + merge
    // would create a literal field `"lastReadAt.uid"` at the top level
    // instead, so we explicitly use updateDoc here.
    await updateDoc(doc(fb.db, "conversations", conversationId), {
      [`lastReadAt.${meUid}`]: Date.now(),
    });
  } catch (err) {
    console.warn("[messaging] markRead failed:", err);
  }
}

/**
 * Subscribes to all conversations involving `meUid`. Sorted client-side by
 * `updatedAt` descending — we deliberately *don't* use Firestore's
 * `orderBy("updatedAt")` because that would temporarily filter out brand-new
 * conversations whose `updatedAt: serverTimestamp()` is still pending the
 * server ack, causing the chat to flash visible and then disappear.
 */
export function watchConversationsFor(
  meUid: string,
  callback: (convs: Conversation[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "conversations"),
    where("participants", "array-contains", meUid),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      const convs: Conversation[] = snap.docs.map((d) => parseConversation(d.id, d.data()));
      // Client-side sort: newest activity first, falling back to createdAt
      // if updatedAt is still pending (= 0 from our parser).
      convs.sort((a, b) => {
        const aTs = a.updatedAt || a.createdAt || 0;
        const bTs = b.updatedAt || b.createdAt || 0;
        return bTs - aTs;
      });
      callback(convs);
    },
    (err) => {
      console.warn("[messaging] conversations listener error:", err);
      callback([]);
    },
  );
}

/**
 * Subscribes to a single conversation document by its deterministic id.
 * Used as a fallback in `MessagesPage` so the active conversation can render
 * even before the array-contains list query catches up to a freshly-created
 * doc. Returns null when the doc doesn't exist yet (or was deleted).
 */
export function watchConversationById(
  conversationId: string,
  callback: (conv: Conversation | null) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback(null);
    return () => {};
  }
  return onSnapshot(
    doc(fb.db, "conversations", conversationId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(parseConversation(snap.id, snap.data()));
    },
    (err) => {
      console.warn("[messaging] conversation-by-id listener error:", err);
      callback(null);
    },
  );
}

/**
 * Subscribes to the messages of a conversation, ordered by `sentAt` ascending
 * (oldest first → newest last) so the chat view can render top-to-bottom and
 * scroll-pin to bottom on new messages.
 */
export function watchMessages(
  conversationId: string,
  callback: (msgs: Message[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "conversations", conversationId, "messages"),
    orderBy("sentAt", "asc"),
    limit(500),
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs: Message[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          conversationId,
          senderUid: data.senderUid ?? "",
          senderName: data.senderName ?? "—",
          senderAvatar: data.senderAvatar ?? null,
          text: data.text ?? "",
          sentAt: typeof data.sentAt === "number" ? data.sentAt : 0,
        };
      });
      callback(msgs);
    },
    (err) => {
      console.warn("[messaging] messages listener error:", err);
      callback([]);
    },
  );
}

function parseConversation(id: string, data: Record<string, unknown>): Conversation {
  const participants = Array.isArray(data.participants)
    ? (data.participants.filter((p) => typeof p === "string") as string[])
    : [];
  const last = data.lastMessage as
    | { text?: unknown; senderUid?: unknown; sentAt?: unknown }
    | null
    | undefined;
  const lastMessage =
    last && typeof last.text === "string" && typeof last.senderUid === "string" && typeof last.sentAt === "number"
      ? { text: last.text, senderUid: last.senderUid, sentAt: last.sentAt }
      : null;
  const lastReadAtRaw = (data.lastReadAt as Record<string, unknown> | undefined) ?? {};
  const lastReadAt: Record<string, number> = {};
  for (const [k, v] of Object.entries(lastReadAtRaw)) {
    if (typeof v === "number") lastReadAt[k] = v;
  }
  const namesRaw = (data.participantNames as Record<string, unknown> | undefined) ?? {};
  const names: Record<string, string> = {};
  for (const [k, v] of Object.entries(namesRaw)) {
    if (typeof v === "string") names[k] = v;
  }
  const avatarsRaw = (data.participantAvatars as Record<string, unknown> | undefined) ?? {};
  const avatars: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(avatarsRaw)) {
    avatars[k] = typeof v === "string" ? v : null;
  }
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0;
  return {
    id,
    participants: [participants[0] ?? "", participants[1] ?? ""] as [string, string],
    participantNames: names,
    participantAvatars: avatars,
    lastMessage,
    lastReadAt,
    createdAt,
    updatedAt,
  };
}
