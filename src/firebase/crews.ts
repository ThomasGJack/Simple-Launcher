import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
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

const KEY_CREW_JOINED = "ach.flag.crewJoined.v1";

/**
 * Per-crew, per-user roles. Owner can manage everything (settings,
 * members, channels, delete crew). Admin can moderate (kick, manage
 * channels, pin/delete others' messages). Member can post + react.
 */
export type CrewRole = "owner" | "admin" | "member";

/**
 * Discord-like clan hierarchy with a real membership model.
 *
 *   /crews/{crewId}
 *     name, emblem, color, position, createdAt
 *     ownerUid, isMaster, isPublic, joinCode, description, memberCount
 *     /channels/{channelId}
 *       name, description, position, createdAt
 *       /messages/{messageId}
 *         text, senderUid, senderName, senderAvatar, sentAt
 *     /members/{uid}
 *       uid, role, joinedAt, displayName, avatarUrl
 *
 * Two flavours of crew :
 *  - **Master crew** (`isMaster=true`) — admin-managed, every authed
 *    launcher user is implicitly a member. Used for the "Simple Games"
 *    community-wide chat that ships with the launcher.
 *  - **User crews** — created by paid-tier users. Owner-managed, with
 *    optional public visibility and an invite code. Members must
 *    explicitly join (browse public list, paste code, or get added).
 */

export type Crew = {
  id: string;
  name: string;
  emblem: string;
  color: string;
  position: number;
  createdAt: number;
  /** Uid of the user who owns this crew. Empty for legacy admin-only
   *  crews — those are filled in by the master-crew migration. */
  ownerUid: string;
  /** Master crew = community-wide, all authed users are implicit
   *  members. Only the admin can flag a crew as master. */
  isMaster: boolean;
  /** Listed in the "Découvrir" public directory. Anyone can browse +
   *  join without an invite code. */
  isPublic: boolean;
  /** Optional invite code for joining a private crew. Random 8-char
   *  uppercase alphanumeric. Owner can rotate it. */
  joinCode: string | null;
  description: string;
  /** Cached member count. Updated by the join/leave ops to avoid an
   *  N-doc count on every render. Master crews report 0 (computing
   *  the launcher-wide count is a separate query). */
  memberCount: number;
};

export type CrewMember = {
  uid: string;
  role: CrewRole;
  joinedAt: number;
  displayName: string | null;
  avatarUrl: string | null;
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

// ─── Marker for the achievement evaluator ─────────────────────────────

/** Stamps the local "crew joined" achievement flag (#26 Esprit de
 *  clan). Called by `joinCrewByCode` / `joinPublicCrew` /
 *  `sendChannelMessage` so the badge unlocks regardless of how the
 *  user first engages with a crew. */
function markCrewJoined(): void {
  try {
    if (localStorage.getItem(KEY_CREW_JOINED) === "1") return;
    localStorage.setItem(KEY_CREW_JOINED, "1");
  } catch {
    /* non-fatal */
  }
}

// ─── Watchers ─────────────────────────────────────────────────────────

export function watchCrews(callback: (crews: Crew[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "crews"),
    (snap) => {
      const list: Crew[] = snap.docs.map(parseCrew);
      list.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
      callback(list);
    },
    (err) => {
      console.warn("[crews] watch failed:", err);
      callback([]);
    },
  );
}

/**
 * Watch only the crews the given user is a member of (master crews
 * are added in by the caller — see `useMyCrews` in CrewsPage). Uses a
 * collection-group query on `members` filtered by uid, then resolves
 * the parent crew refs.
 */
export function watchMyCrewIds(
  uid: string,
  callback: (crewIds: string[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(collectionGroup(fb.db, "members"), where("uid", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const ids = snap.docs
        .map((d) => d.ref.parent.parent?.id)
        .filter((id): id is string => !!id);
      callback(ids);
    },
    (err) => {
      console.warn("[crews] watchMyCrewIds failed:", err);
      callback([]);
    },
  );
}

export function watchCrewMembers(
  crewId: string,
  callback: (members: CrewMember[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "crews", crewId, "members"),
    (snap) => {
      const list: CrewMember[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          role: parseRole(data.role),
          joinedAt: tsToMs(data.joinedAt) ?? 0,
          displayName: typeof data.displayName === "string" ? data.displayName : null,
          avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
        };
      });
      // Owner first, then admins, then members; alphabetical inside each tier.
      const rank: Record<CrewRole, number> = { owner: 0, admin: 1, member: 2 };
      list.sort(
        (a, b) =>
          rank[a.role] - rank[b.role] ||
          (a.displayName ?? "").localeCompare(b.displayName ?? ""),
      );
      callback(list);
    },
    (err) => {
      console.warn("[crews] members watch failed:", err);
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

// ─── Messaging ────────────────────────────────────────────────────────

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
  markCrewJoined();
}

// ─── Membership ops ───────────────────────────────────────────────────

/**
 * Generate an 8-char uppercase alphanumeric invite code. Avoids
 * ambiguous chars (0/O, 1/I/L) so users typing it from a screenshot
 * don't get confused.
 */
function generateJoinCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export type CreateUserCrewInput = {
  name: string;
  emblem: string;
  color: string;
  description: string;
  isPublic: boolean;
};

/**
 * Create a brand-new crew owned by the given user. Returns the new
 * crew id. The owner is auto-added as a member with role "owner". A
 * random invite code is generated alongside the public/private flag.
 *
 * Caller must check the user's tier before calling this — Firestore
 * rules don't enforce the VIP gate (they trust the client because
 * tiers are admin-granted, not user-claimed). The CrewsPage UI does
 * the gating in the create button.
 */
export async function createUserCrew(
  input: CreateUserCrewInput,
  ownerUid: string,
  ownerDisplayName: string | null,
  ownerAvatar: string | null,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "crews"), {
    name: input.name.trim(),
    emblem: input.emblem || "🏰",
    color: input.color || "#00d4ff",
    description: input.description.trim(),
    position: 100,
    ownerUid,
    isMaster: false,
    isPublic: input.isPublic,
    joinCode: generateJoinCode(),
    memberCount: 1,
    createdAt: serverTimestamp(),
  });
  // Owner membership doc — the rules read `role: "owner"` to grant
  // full admin powers within this crew.
  await setDoc(doc(fb.db, "crews", ref.id, "members", ownerUid), {
    uid: ownerUid,
    role: "owner",
    joinedAt: serverTimestamp(),
    displayName: ownerDisplayName,
    avatarUrl: ownerAvatar,
  });
  // Seed a default #général channel so the new crew isn't an empty
  // husk. The owner can rename / delete / add channels right after.
  await addDoc(collection(fb.db, "crews", ref.id, "channels"), {
    name: "général",
    description: "Le salon par défaut.",
    position: 0,
    createdAt: serverTimestamp(),
  });
  markCrewJoined();
  return ref.id;
}

/** Join a crew the user already knows the id of (e.g. from the
 *  public directory). Crew must be `isPublic === true` for this to
 *  pass the rules. */
export async function joinPublicCrew(
  crewId: string,
  uid: string,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(doc(fb.db, "crews", crewId, "members", uid), {
    uid,
    role: "member",
    joinedAt: serverTimestamp(),
    displayName,
    avatarUrl,
  });
  // Best-effort memberCount bump. Failures (e.g. rules) don't block
  // the join — the count is purely cosmetic.
  await updateDoc(doc(fb.db, "crews", crewId), {
    memberCount: (await readMemberCount(crewId)) + 1,
  }).catch(() => {});
  markCrewJoined();
}

/** Resolve an invite code to a crew id, then join. Throws if the
 *  code is unknown or matches multiple crews (shouldn't happen since
 *  codes are random 8 chars). */
export async function joinCrewByCode(
  code: string,
  uid: string,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const cleaned = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6,}$/.test(cleaned)) {
    throw new Error("Code d'invitation invalide");
  }
  const q = query(
    collection(fb.db, "crews"),
    where("joinCode", "==", cleaned),
    fbLimit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("Aucun crew ne correspond à ce code");
  const crewDoc = snap.docs[0];
  await setDoc(doc(fb.db, "crews", crewDoc.id, "members", uid), {
    uid,
    role: "member",
    joinedAt: serverTimestamp(),
    displayName,
    avatarUrl,
  });
  await updateDoc(crewDoc.ref, {
    memberCount: (await readMemberCount(crewDoc.id)) + 1,
  }).catch(() => {});
  markCrewJoined();
  return crewDoc.id;
}

export async function leaveCrew(crewId: string, uid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "crews", crewId, "members", uid));
  await updateDoc(doc(fb.db, "crews", crewId), {
    memberCount: Math.max(0, (await readMemberCount(crewId)) - 1),
  }).catch(() => {});
}

/** Owner / admin-only kick. Removes the target's member doc; the
 *  rules enforce the privilege check. */
export async function kickCrewMember(crewId: string, targetUid: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "crews", crewId, "members", targetUid));
  await updateDoc(doc(fb.db, "crews", crewId), {
    memberCount: Math.max(0, (await readMemberCount(crewId)) - 1),
  }).catch(() => {});
}

/** Owner-only promote/demote. Rules enforce that only the owner can
 *  flip the role (admins can kick but can't promote). */
export async function setCrewMemberRole(
  crewId: string,
  targetUid: string,
  role: CrewRole,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "crews", crewId, "members", targetUid), { role });
}

/** Owner-only crew metadata edit. */
export async function updateUserCrew(
  crewId: string,
  patch: Partial<{
    name: string;
    emblem: string;
    color: string;
    description: string;
    isPublic: boolean;
  }>,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "crews", crewId), patch);
}

/** Rotate the invite code (owner only). Returns the new code. */
export async function rotateCrewJoinCode(crewId: string): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const next = generateJoinCode();
  await updateDoc(doc(fb.db, "crews", crewId), { joinCode: next });
  return next;
}

async function readMemberCount(crewId: string): Promise<number> {
  const fb = getFirebase();
  if (!fb) return 0;
  try {
    const snap = await getDocs(collection(fb.db, "crews", crewId, "members"));
    return snap.size;
  } catch {
    return 0;
  }
}

// ─── Master crew bootstrap ────────────────────────────────────────────

/**
 * Ensure the current user is a member of every master crew. Master
 * crews are admin-managed launcher-wide community channels — every
 * authed launcher user should be in them automatically. Called on
 * boot from CrewsPage / App.tsx so newly-launched users join the
 * master without any UI step.
 *
 * No-op if already a member (idempotent setDoc with merge).
 */
export async function ensureMasterMemberships(
  uid: string,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  try {
    const q = query(collection(fb.db, "crews"), where("isMaster", "==", true));
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map((crewDoc) =>
        setDoc(
          doc(fb.db, "crews", crewDoc.id, "members", uid),
          {
            uid,
            role: "member",
            joinedAt: serverTimestamp(),
            displayName,
            avatarUrl,
          },
          { merge: true },
        ).catch((err) => {
          console.warn(
            `[crews] master membership for ${crewDoc.id} failed:`,
            err,
          );
        }),
      ),
    );
  } catch (err) {
    console.warn("[crews] master memberships ensure failed:", err);
  }
}

// ─── Admin ops (legacy + master-crew management) ──────────────────────

export async function createCrew(
  crew: Omit<Crew, "id" | "createdAt" | "ownerUid" | "isMaster" | "isPublic" | "joinCode" | "description" | "memberCount"> & {
    isMaster?: boolean;
    isPublic?: boolean;
    description?: string;
  },
  ownerUid: string,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "crews"), {
    name: crew.name,
    emblem: crew.emblem,
    color: crew.color,
    position: crew.position,
    description: crew.description ?? "",
    ownerUid,
    isMaster: !!crew.isMaster,
    isPublic: !!crew.isPublic,
    joinCode: crew.isMaster ? null : generateJoinCode(),
    memberCount: 0,
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

/** Read a single crew doc one-shot (for the join-by-code lookup +
 *  the public directory hover preview). Returns null if missing. */
export async function getCrew(crewId: string): Promise<Crew | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const snap = await getDoc(doc(fb.db, "crews", crewId));
    if (!snap.exists()) return null;
    return parseCrew(snap);
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function parseCrew(d: { id: string; data: () => Record<string, unknown> }): Crew {
  const data = d.data();
  return {
    id: d.id,
    name: typeof data.name === "string" ? data.name : "",
    emblem: typeof data.emblem === "string" ? data.emblem : "🏰",
    color: typeof data.color === "string" ? data.color : "#00d4ff",
    position: typeof data.position === "number" ? data.position : 0,
    createdAt: tsToMs(data.createdAt) ?? 0,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    isMaster: !!data.isMaster,
    isPublic: !!data.isPublic,
    joinCode: typeof data.joinCode === "string" ? data.joinCode : null,
    description: typeof data.description === "string" ? data.description : "",
    memberCount: typeof data.memberCount === "number" ? data.memberCount : 0,
  };
}

function parseRole(v: unknown): CrewRole {
  if (v === "owner" || v === "admin" || v === "member") return v;
  return "member";
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
