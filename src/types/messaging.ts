/**
 * 1-on-1 conversation between two launcher users. Doc id is deterministic
 * (`[uidA, uidB].sort().join("__")`) so both participants always land on the
 * same Firestore document regardless of who DMs first.
 */
export type Conversation = {
  id: string;
  /** UIDs of the two participants, always sorted alphabetically. */
  participants: [string, string];
  /** Display name of each participant (cached at write time so we can render
   *  the conversation list without N extra reads of /users/{uid}). */
  participantNames: Record<string, string>;
  participantAvatars: Record<string, string | null>;
  /** Preview of the last message — used for the conversation list row. */
  lastMessage: {
    text: string;
    senderUid: string;
    sentAt: number;
  } | null;
  /** Per-participant timestamp of the last time they read the conversation;
   *  unread = number of messages with `sentAt > lastReadAt[myUid]`. */
  lastReadAt: Record<string, number>;
  createdAt: number;
  updatedAt: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderUid: string;
  /** Cached at send time so the bubble can render the avatar/name without
   *  cross-referencing /users on every message. Snapshot, not live. */
  senderName: string;
  senderAvatar: string | null;
  text: string;
  /** Client-side timestamp (Date.now() at send) — used for instant ordering;
   *  Firestore `serverTimestamp()` is also stored separately for authoritative
   *  ordering across clients with skewed clocks. */
  sentAt: number;
};

/**
 * Builds the deterministic conversation ID for a 1-on-1 chat between two
 * users. Sorting the UIDs guarantees both users compute the same ID.
 */
export function conversationIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("__");
}

/** Returns the *other* participant's UID, given the current user's UID. */
export function otherParticipant(conv: Conversation, myUid: string): string {
  return conv.participants[0] === myUid ? conv.participants[1] : conv.participants[0];
}

/** Number of unread messages in a conversation, from the perspective of `myUid`.
 *  Returns 0 if I'm the sender of the last message (since I obviously read it). */
export function unreadCount(conv: Conversation, myUid: string): number {
  if (!conv.lastMessage) return 0;
  if (conv.lastMessage.senderUid === myUid) return 0;
  const lastRead = conv.lastReadAt[myUid] ?? 0;
  return conv.lastMessage.sentAt > lastRead ? 1 : 0;
}
