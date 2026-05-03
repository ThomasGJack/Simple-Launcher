import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  doc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

/**
 * Game invitation lifecycle:
 *   pending  → Sent by `fromUid`, waiting for `toUid` to react.
 *   accepted → `toUid` clicked Accept; consumer auto-installs/launches.
 *   declined → `toUid` clicked Decline.
 *   cancelled → `fromUid` revoked the invitation.
 *   expired  → 30 minutes after creation, treated as auto-declined client-side.
 *
 * Invitations are stored in `/invitations/{id}` (top-level collection) so
 * users can query "invitations sent to me" with a single `where toUid ==`.
 */
export type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled";

export type GameInvitation = {
  id: string;
  fromUid: string;
  fromName: string;
  fromAvatar: string | null;
  toUid: string;
  /** Module the inviter is asking the recipient to join. */
  moduleId: string;
  moduleName: string;
  moduleIconUrl: string | null;
  /** Optional message attached to the invitation ("Allez glitch ce soir ?"). */
  note: string | null;
  status: InvitationStatus;
  createdAt: number;
  /** Set when status changes to anything other than `pending`. */
  resolvedAt: number | null;
};

export const INVITATION_TTL_MS = 30 * 60 * 1000; // 30 min

export async function sendGameInvitation(opts: {
  fromUid: string;
  fromName: string;
  fromAvatar: string | null;
  toUid: string;
  moduleId: string;
  moduleName: string;
  moduleIconUrl: string | null;
  note?: string;
}): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "invitations"), {
    fromUid: opts.fromUid,
    fromName: opts.fromName,
    fromAvatar: opts.fromAvatar,
    toUid: opts.toUid,
    moduleId: opts.moduleId,
    moduleName: opts.moduleName,
    moduleIconUrl: opts.moduleIconUrl,
    note: opts.note ?? null,
    status: "pending" as InvitationStatus,
    createdAt: serverTimestamp(),
    resolvedAt: null,
  });
  // Mirror into the recipient's notifications subcollection so it shows
  // in the bell panel for later (the InvitationPopup is ephemeral —
  // close it once and the invitation visually disappears even though
  // it's still pending until accepted/declined).
  // Best-effort — failure here doesn't break the invitation itself.
  try {
    const { recordNotification } = await import("./notifications");
    await recordNotification(opts.toUid, {
      kind: "invitation",
      title: `${opts.fromName} t'invite à jouer`,
      description: opts.note
        ? `${opts.moduleName} — ${opts.note}`
        : opts.moduleName,
      link: `module:${opts.moduleId}`,
      meta: { invitationId: ref.id, fromUid: opts.fromUid },
    });
  } catch (err) {
    console.warn("[notifications] invitation notif failed:", err);
  }
  return ref.id;
}

export async function setInvitationStatus(
  invitationId: string,
  status: Exclude<InvitationStatus, "pending">,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await updateDoc(doc(fb.db, "invitations", invitationId), {
    status,
    resolvedAt: serverTimestamp(),
  });
}

/**
 * Subscribes to invitations *received* by `meUid`. Filters out anything
 * older than the TTL or already resolved — we only surface live, actionable
 * pings to the user. Sorted newest-first.
 *
 * NB: We deliberately do NOT use `orderBy("createdAt", "desc")` in the
 * query — that would require a composite index on `(toUid asc, createdAt
 * desc)`. While such an index is BUILDING (e.g. just deployed), Firestore
 * throws an INTERNAL ASSERTION FAILED that cascades through every active
 * watcher and can black-screen the app. Sorting client-side over the small
 * filtered result set is essentially free and avoids the dependency.
 */
export function watchIncomingInvitations(
  meUid: string,
  callback: (invitations: GameInvitation[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "invitations"),
    where("toUid", "==", meUid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const out: GameInvitation[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const createdAt =
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;
        // Skip stale or already-resolved invitations
        if (data.status !== "pending") continue;
        if (createdAt > 0 && now - createdAt > INVITATION_TTL_MS) continue;
        out.push({
          id: d.id,
          fromUid: data.fromUid ?? "",
          fromName: data.fromName ?? "Anonyme",
          fromAvatar: data.fromAvatar ?? null,
          toUid: data.toUid ?? "",
          moduleId: data.moduleId ?? "",
          moduleName: data.moduleName ?? "—",
          moduleIconUrl: data.moduleIconUrl ?? null,
          note: data.note ?? null,
          status: data.status ?? "pending",
          createdAt,
          resolvedAt:
            data.resolvedAt instanceof Timestamp ? data.resolvedAt.toMillis() : null,
        });
      }
      // Sort newest-first client-side (no composite index needed).
      out.sort((a, b) => b.createdAt - a.createdAt);
      callback(out);
    },
    (err) => {
      console.warn("[invitations] watchIncoming failed:", err);
      callback([]);
    },
  );
}
