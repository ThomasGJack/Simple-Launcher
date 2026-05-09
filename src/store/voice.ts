// Voice store — Zustand state pour la session vocale active. Singleton :
// un seul user est dans 1 seul vocal channel à la fois (UX simple,
// matches Discord). Les composants UI s'abonnent pour réagir aux
// joins/leaves et muter/démuter.

import { create } from "zustand";
import {
  joinVoiceSession,
  leaveVoiceSession,
  setOwnPeerFlags,
  watchVoicePeers,
  type VoicePeer,
} from "@/firebase/voiceCalls";
import { getMicStream, stopStream } from "@/lib/audioDevices";
import { MeshSession } from "@/lib/webrtc";

export type VoiceState = {
  /** Active session info — null quand pas connecté. */
  active: {
    crewId: string;
    channelId: string;
    channelName: string;
    crewName: string;
  } | null;
  /** Peers Firestore (incl. soi-même). Tracked par le watcher Firestore. */
  peers: VoicePeer[];
  /** Streams audio distants — un par peer remote (sans soi-même). */
  remoteStreams: Map<string, MediaStream>;
  /** Speaking state (VAD) par uid — pour pulser le ring d'avatar. */
  speakingUids: Set<string>;
  /** Volume per-peer (0..1). Default 1.0 si absent. AudioMixer applique
   *  ça sur chaque <audio> remote pour permettre de baisser le volume
   *  d'un participant individuel (ex: un pote qui crie). */
  peerVolumes: Map<string, number>;
  /** Mes propres flags. */
  micMuted: boolean;
  deafened: boolean;
  /** Push-to-talk activé : si true, le mic ne transmet QUE quand
   *  l'user maintient la touche assignée (cf. customShortcuts.ts).
   *  Sinon, transmission constante (open mic). */
  pushToTalk: boolean;
  /** Quand pushToTalk = true, indique si la touche est actuellement
   *  enfoncée. Le mic transmet uniquement si pushToTalkActive === true. */
  pushToTalkActive: boolean;
  /** Erreurs récentes — affichées dans le panel. */
  error: string | null;
};

type VoiceActions = {
  joinChannel: (
    crewId: string,
    channelId: string,
    crewName: string,
    channelName: string,
    myUid: string,
  ) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  setSpeaking: (uid: string, speaking: boolean) => void;
  setPeerVolume: (uid: string, volume: number) => void;
  setPushToTalk: (enabled: boolean) => void;
  setPushToTalkActive: (active: boolean) => void;
  clearError: () => void;
};

// Refs hors-Zustand pour les ressources non-sérialisables. Zustand ne
// gère bien que les objets purs ; les MediaStream + RTCPeerConnection
// + AudioContext vivent ici en module-scope, indexés par crewId+channelId.
let mesh: MeshSession | null = null;
let localStream: MediaStream | null = null;
let peersUnsub: (() => void) | null = null;

// Boot du push-to-talk depuis localStorage — l'user persiste son choix.
const LS_PTT = "voice.ptt.v1";
function loadPtt(): boolean {
  try {
    return localStorage.getItem(LS_PTT) === "1";
  } catch {
    return false;
  }
}
function savePtt(v: boolean) {
  try {
    localStorage.setItem(LS_PTT, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export const useVoiceStore = create<VoiceState & VoiceActions>((set, get) => ({
  active: null,
  peers: [],
  remoteStreams: new Map(),
  speakingUids: new Set(),
  peerVolumes: new Map(),
  micMuted: false,
  deafened: false,
  pushToTalk: loadPtt(),
  pushToTalkActive: false,
  error: null,

  async joinChannel(crewId, channelId, crewName, channelName, myUid) {
    const current = get().active;
    if (current) {
      // Déjà dans un channel — leave avant de re-join ailleurs.
      await get().leaveChannel();
    }
    set({ error: null });
    try {
      console.log("[voice] joining", { crewId, channelId, myUid });
      // 1. Acquire mic.
      console.log("[voice] requesting mic...");
      localStream = await getMicStream();
      console.log("[voice] mic acquired:", localStream.getAudioTracks().length, "tracks");

      // 2. Register dans Firestore (crée le peer doc + bump session).
      console.log("[voice] writing Firestore session doc...");
      await joinVoiceSession(crewId, channelId, myUid);
      console.log("[voice] Firestore write OK");

      // 3. Init mesh + watch peers Firestore pour add/remove peers WebRTC.
      mesh = new MeshSession(crewId, channelId, myUid, localStream, {
        onRemoteStream: (uid, stream) => {
          set((state) => {
            const next = new Map(state.remoteStreams);
            next.set(uid, stream);
            return { remoteStreams: next };
          });
        },
        onRemoteLeave: (uid) => {
          set((state) => {
            const next = new Map(state.remoteStreams);
            next.delete(uid);
            const speaking = new Set(state.speakingUids);
            speaking.delete(uid);
            return { remoteStreams: next, speakingUids: speaking };
          });
        },
        onError: (uid, message) => {
          console.warn(`[voice] peer ${uid}:`, message);
        },
      });

      peersUnsub = watchVoicePeers(crewId, channelId, (peers) => {
        // Le watcher fire à chaque changement de peers ; pour chaque
        // nouveau peer, addPeer du mesh ; pour chaque parti, removePeer.
        const knownUids = new Set(get().peers.map((p) => p.uid));
        const currentUids = new Set(peers.map((p) => p.uid));
        for (const peer of peers) {
          if (!knownUids.has(peer.uid)) {
            void mesh?.addPeer(peer.uid);
          }
        }
        for (const oldUid of knownUids) {
          if (!currentUids.has(oldUid)) {
            mesh?.removePeer(oldUid);
          }
        }
        set({ peers });
      });

      set({
        active: { crewId, channelId, crewName, channelName },
        micMuted: false,
        deafened: false,
      });
    } catch (err) {
      console.error("[voice] join failed:", err);
      set({
        error: err instanceof Error ? err.message : String(err),
      });
      // Cleanup partiel si la chaîne d'init a partial-failed.
      stopStream(localStream);
      localStream = null;
      mesh?.destroy();
      mesh = null;
    }
  },

  async leaveChannel() {
    const active = get().active;
    if (!active) return;
    const myUid = await currentMyUid();
    // 1. Stop mesh + close peer connections.
    mesh?.destroy();
    mesh = null;
    // 2. Stop watcher peers.
    peersUnsub?.();
    peersUnsub = null;
    // 3. Stop mic stream.
    stopStream(localStream);
    localStream = null;
    // 4. Cleanup Firestore (peer doc + participantUids).
    if (myUid) {
      await leaveVoiceSession(active.crewId, active.channelId, myUid).catch(() =>
        /* silent */ undefined,
      );
    }
    // 5. Reset state.
    set({
      active: null,
      peers: [],
      remoteStreams: new Map(),
      speakingUids: new Set(),
      micMuted: false,
      deafened: false,
    });
  },

  async toggleMic() {
    const next = !get().micMuted;
    set({ micMuted: next });
    mesh?.setMicMuted(next);
    const active = get().active;
    const myUid = await currentMyUid();
    if (active && myUid) {
      await setOwnPeerFlags(active.crewId, active.channelId, myUid, {
        micMuted: next,
      }).catch(() => undefined);
    }
  },

  async toggleDeafen() {
    const next = !get().deafened;
    set({ deafened: next });
    // Deafen = mute tous les remote audio elements + auto-mute le mic
    // (convention Discord). On n'en touche que le flag ici, le rendu
    // applique le mute sur les <audio> via la prop.
    const active = get().active;
    const myUid = await currentMyUid();
    if (active && myUid) {
      await setOwnPeerFlags(active.crewId, active.channelId, myUid, {
        deafened: next,
        micMuted: next || get().micMuted,
      }).catch(() => undefined);
    }
    if (next && !get().micMuted) {
      await get().toggleMic();
    }
  },

  setSpeaking(uid, speaking) {
    set((state) => {
      const next = new Set(state.speakingUids);
      if (speaking) next.add(uid);
      else next.delete(uid);
      return { speakingUids: next };
    });
  },

  setPeerVolume(uid, volume) {
    const clamped = Math.max(0, Math.min(1, volume));
    set((state) => {
      const next = new Map(state.peerVolumes);
      next.set(uid, clamped);
      return { peerVolumes: next };
    });
  },

  setPushToTalk(enabled) {
    savePtt(enabled);
    set({ pushToTalk: enabled, pushToTalkActive: false });
    // En mode PTT, on coupe le mic d'office — il ne s'active que
    // quand pushToTalkActive devient true (touche enfoncée).
    if (mesh && enabled) {
      mesh.setMicMuted(true);
    } else if (mesh && !enabled) {
      // Sortie du PTT : restaure l'état muted/unmuted classique.
      mesh.setMicMuted(get().micMuted);
    }
  },

  setPushToTalkActive(active) {
    if (!get().pushToTalk) return;
    set({ pushToTalkActive: active });
    if (mesh) {
      // Mic actif uniquement quand active=true ET pas muted classique.
      mesh.setMicMuted(!active || get().micMuted);
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/** Helper pour récupérer le uid courant sans coupler le store voice
 *  au store auth (évite le cycle d'imports). */
async function currentMyUid(): Promise<string | null> {
  const mod = await import("@/store/auth");
  return mod.useAuthStore.getState().user?.uid ?? null;
}
