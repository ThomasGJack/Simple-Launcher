// Voice signaling via Firestore — couche réseau pour les salons vocaux
// WebRTC par channel de crew. Pas de serveur dédié (signaling = pure
// data-store), le launcher utilise les sub-collections Firestore comme
// "boîte aux lettres" pour échanger SDP + ICE candidates entre peers.
//
// Topologie : MESH peer-to-peer (full N×N). OK pour ≤8 participants
// (recommandé Discord/Mumble même limite). Au-delà, bandwidth explose
// quadratiquement → faudrait un SFU type LiveKit / Mediasoup, hors
// scope MVP.
//
// Schéma Firestore :
//
//   /crews/{crewId}/channels/{channelId}/voice/{sessionId}
//     startedAt: Timestamp
//     startedByUid: string
//     participantUids: string[]   ← entries auto-mises-à-jour quand
//                                   les peer docs sont créés / supprimés
//
//   /crews/{crewId}/channels/{channelId}/voice/{sessionId}/peers/{peerUid}
//     joinedAt: Timestamp
//     micMuted: boolean
//     deafened: boolean
//     /signals/{signalId}    ← messages SDP/ICE adressés à ce peer
//       fromUid: string
//       kind: "offer" | "answer" | "ice-candidate"
//       payload: any         ← SDP string, ICE candidate JSON, etc.
//       createdAt: Timestamp
//
// Convention : un signal "à destination de Bob émis par Alice" vit dans
//   /voice/{s}/peers/Bob/signals/{auto-id} avec fromUid=Alice.
// Bob watch sa propre sub-coll signals → consume + delete chaque signal
// après l'avoir appliqué à sa RTCPeerConnection.

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
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

export type VoiceSession = {
  id: string;
  startedAt: number;
  startedByUid: string;
  participantUids: string[];
};

export type VoicePeer = {
  uid: string;
  joinedAt: number;
  micMuted: boolean;
  deafened: boolean;
};

export type VoiceSignal = {
  id: string;
  fromUid: string;
  kind: "offer" | "answer" | "ice-candidate";
  payload: unknown;
  createdAt: number;
};

const SESSION_DOC_ID = "active";

/**
 * Watch la session vocale active du channel. Comme on n'autorise
 * qu'1 session par channel à la fois (UX simple : "le salon vocal du
 * channel"), le doc id est statique = "active".
 */
export function watchVoiceSession(
  crewId: string,
  channelId: string,
  callback: (session: VoiceSession | null) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback(null);
    return () => {};
  }
  const ref = doc(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
  );
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const data = snap.data();
      callback({
        id: snap.id,
        startedAt: tsToMs(data.startedAt) ?? 0,
        startedByUid: typeof data.startedByUid === "string" ? data.startedByUid : "",
        participantUids: Array.isArray(data.participantUids)
          ? data.participantUids.filter((x): x is string => typeof x === "string")
          : [],
      });
    },
    (err) => {
      console.warn("[voiceCalls] watchSession failed:", err);
      callback(null);
    },
  );
}

/** Watch les peers actifs (sub-coll). Émis à chaque join/leave. */
export function watchVoicePeers(
  crewId: string,
  channelId: string,
  callback: (peers: VoicePeer[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const ref = collection(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
    "peers",
  );
  return onSnapshot(
    ref,
    (snap) => {
      const list: VoicePeer[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          joinedAt: tsToMs(data.joinedAt) ?? 0,
          micMuted: data.micMuted === true,
          deafened: data.deafened === true,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[voiceCalls] watchPeers failed:", err);
      callback([]);
    },
  );
}

/**
 * Join le salon vocal — crée le peer doc + ajoute uid à participantUids.
 * Si la session n'existe pas, on la crée à la volée.
 */
export async function joinVoiceSession(
  crewId: string,
  channelId: string,
  uid: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const sessionRef = doc(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
  );
  // Crée le doc session s'il n'existe pas, ou bump participantUids.
  // setDoc(merge:true) = upsert sans écraser les autres champs.
  await setDoc(
    sessionRef,
    {
      startedAt: serverTimestamp(),
      startedByUid: uid, // overridden si non-créateur (ok, pas critique)
      participantUids: arrayUnion(uid),
    },
    { merge: true },
  );
  const peerRef = doc(sessionRef, "peers", uid);
  await setDoc(peerRef, {
    joinedAt: serverTimestamp(),
    micMuted: false,
    deafened: false,
  });
}

/** Leave — supprime le peer doc + retire uid de participantUids. */
export async function leaveVoiceSession(
  crewId: string,
  channelId: string,
  uid: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const sessionRef = doc(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
  );
  // Wipe pending signals avant le leave pour ne pas garder de poubelle.
  try {
    const signalsSnap = await getDocs(
      collection(sessionRef, "peers", uid, "signals"),
    );
    await Promise.all(signalsSnap.docs.map((d) => deleteDoc(d.ref)));
  } catch {
    /* silent */
  }
  await deleteDoc(doc(sessionRef, "peers", uid)).catch(() => {
    /* déjà supprimé */
  });
  await updateDoc(sessionRef, {
    participantUids: arrayRemove(uid),
  }).catch(() => {
    /* session peut-être déjà supprimée */
  });
}

/** Toggle mute / deafen flags on own peer doc. Watched par les autres. */
export async function setOwnPeerFlags(
  crewId: string,
  channelId: string,
  uid: string,
  flags: { micMuted?: boolean; deafened?: boolean },
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const peerRef = doc(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
    "peers",
    uid,
  );
  // updateDoc veut un type bien spécifique (FieldValue | Partial). On
  // construit explicitement un objet avec uniquement les champs définis
  // pour respecter ce shape sans cast.
  if (typeof flags.micMuted === "boolean" && typeof flags.deafened === "boolean") {
    await updateDoc(peerRef, {
      micMuted: flags.micMuted,
      deafened: flags.deafened,
    }).catch((err) => console.warn("[voiceCalls] setFlags failed:", err));
  } else if (typeof flags.micMuted === "boolean") {
    await updateDoc(peerRef, { micMuted: flags.micMuted }).catch((err) =>
      console.warn("[voiceCalls] setFlags failed:", err),
    );
  } else if (typeof flags.deafened === "boolean") {
    await updateDoc(peerRef, { deafened: flags.deafened }).catch((err) =>
      console.warn("[voiceCalls] setFlags failed:", err),
    );
  }
}

// ─── Signaling (SDP / ICE) ──────────────────────────────────────────────

/**
 * Envoie un signal (offer / answer / ice-candidate) à un peer cible.
 * Le signal vit dans /peers/{toUid}/signals/{auto-id} — le récepteur
 * watch sa propre sub-coll, applique, puis delete pour cleanup.
 */
export async function sendVoiceSignal(
  crewId: string,
  channelId: string,
  toUid: string,
  fromUid: string,
  signal: { kind: VoiceSignal["kind"]; payload: unknown },
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const ref = collection(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
    "peers",
    toUid,
    "signals",
  );
  await addDoc(ref, {
    fromUid,
    kind: signal.kind,
    payload: signal.payload,
    createdAt: serverTimestamp(),
  });
}

/**
 * Watch les signaux entrants pour un user donné. Le callback reçoit
 * un signal à la fois — implémentation appelle delete dès l'avoir
 * traité, donc le watcher ne re-emit pas les vieux signals.
 */
export function watchIncomingSignals(
  crewId: string,
  channelId: string,
  uid: string,
  callback: (signal: VoiceSignal) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) return () => {};
  const ref = collection(
    fb.db,
    "crews",
    crewId,
    "channels",
    channelId,
    "voice",
    SESSION_DOC_ID,
    "peers",
    uid,
    "signals",
  );
  const q = query(ref, orderBy("createdAt", "asc"), fbLimit(50));
  return onSnapshot(
    q,
    (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const data = change.doc.data();
        const signal: VoiceSignal = {
          id: change.doc.id,
          fromUid: typeof data.fromUid === "string" ? data.fromUid : "",
          kind: (data.kind as VoiceSignal["kind"]) ?? "ice-candidate",
          payload: data.payload,
          createdAt: tsToMs(data.createdAt) ?? Date.now(),
        };
        callback(signal);
      }
    },
    (err) => {
      console.warn("[voiceCalls] watchIncomingSignals failed:", err);
    },
  );
}

/** Marque un signal comme consommé (delete du doc). */
export async function consumeVoiceSignal(
  crewId: string,
  channelId: string,
  uid: string,
  signalId: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  await deleteDoc(
    doc(
      fb.db,
      "crews",
      crewId,
      "channels",
      channelId,
      "voice",
      SESSION_DOC_ID,
      "peers",
      uid,
      "signals",
      signalId,
    ),
  ).catch(() => {
    /* déjà supprimé */
  });
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
