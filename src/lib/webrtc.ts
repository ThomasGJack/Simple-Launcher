// WebRTC mesh manager — gère N×N RTCPeerConnections pour le voice chat
// d'un channel de crew. Topologie mesh : chaque participant est connecté
// à TOUS les autres directement (pas de SFU). OK jusqu'à ~8 participants
// (2*7 = 14 streams audio par client → bande passante ~100 kbps total
// avec Opus 32 kbps).
//
// Stratégie offer/answer ("perfect negotiation pattern") :
//   - Le user avec l'uid lexicographiquement plus PETIT initie l'offer
//   - L'autre répond avec l'answer
//   - Cette règle déterministe évite les "glare" (deux peers qui
//     offrent en même temps).
//
// ICE servers : STUN public Google. Pas de TURN — ~20% des paires
// NAT-symmetric échoueront sans, à accepter pour MVP (les 4-5 amis du
// crew ont probablement des routeurs ouverts ou utilisent IPv6).
// TURN dédié = budget infra plus tard.

import {
  sendVoiceSignal,
  watchIncomingSignals,
  consumeVoiceSignal,
  type VoiceSignal,
} from "@/firebase/voiceCalls";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export type RemoteStream = {
  uid: string;
  stream: MediaStream;
};

export type WebRtcCallbacks = {
  /** Appelé quand un peer publie son audio track — le store ajoute
   *  le stream à la liste pour rendu. */
  onRemoteStream: (uid: string, stream: MediaStream) => void;
  /** Appelé quand un peer disconnect — le store retire le stream. */
  onRemoteLeave: (uid: string) => void;
  /** Appelé sur erreur de connexion à un peer (info pour le UI). */
  onError: (uid: string, message: string) => void;
};

/**
 * MeshSession encapsule le WebRTC state pour la durée d'une session
 * vocale. À l'instanciation : démarre le watcher de signaling. Méthodes
 * `addPeer` / `removePeer` driven par le watcher de peers Firestore.
 */
export class MeshSession {
  private myUid: string;
  private crewId: string;
  private channelId: string;
  private localStream: MediaStream;
  private callbacks: WebRtcCallbacks;
  private peers = new Map<string, RTCPeerConnection>();
  private signalingUnsub: (() => void) | null = null;

  constructor(
    crewId: string,
    channelId: string,
    myUid: string,
    localStream: MediaStream,
    callbacks: WebRtcCallbacks,
  ) {
    this.crewId = crewId;
    this.channelId = channelId;
    this.myUid = myUid;
    this.localStream = localStream;
    this.callbacks = callbacks;

    // Watch les signaux entrants (offers / answers / ICE) — c'est le
    // canal réseau pour la négociation peer-to-peer via Firestore.
    this.signalingUnsub = watchIncomingSignals(
      crewId,
      channelId,
      myUid,
      (signal) => void this.handleIncomingSignal(signal),
    );
  }

  /**
   * Notifie le mesh qu'un nouveau peer a join le channel. Décide si
   * c'est nous qui initions l'offer (uid < lexico) ou si on attend.
   */
  async addPeer(peerUid: string): Promise<void> {
    if (peerUid === this.myUid) return;
    if (this.peers.has(peerUid)) return;
    const pc = this.makePeerConnection(peerUid);
    this.peers.set(peerUid, pc);

    // Si MON uid est lexicographiquement plus petit → j'initie l'offer.
    // Sinon, j'attends que l'autre m'envoie son offer.
    if (this.myUid < peerUid) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendVoiceSignal(this.crewId, this.channelId, peerUid, this.myUid, {
          kind: "offer",
          payload: offer,
        });
      } catch (err) {
        console.warn(`[webrtc] createOffer to ${peerUid} failed:`, err);
        this.callbacks.onError(peerUid, "Échec négociation");
      }
    }
  }

  /** Retire un peer du mesh — close la connection + cleanup. */
  removePeer(peerUid: string): void {
    const pc = this.peers.get(peerUid);
    if (!pc) return;
    try {
      pc.close();
    } catch {
      /* silent */
    }
    this.peers.delete(peerUid);
    this.callbacks.onRemoteLeave(peerUid);
  }

  /** Mute / unmute le mic local — propagé immédiatement aux peers. */
  setMicMuted(muted: boolean): void {
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  /** Tear down complet — close tout, stop le watcher signaling. */
  destroy(): void {
    if (this.signalingUnsub) {
      try {
        this.signalingUnsub();
      } catch {
        /* silent */
      }
      this.signalingUnsub = null;
    }
    for (const [uid, pc] of this.peers) {
      try {
        pc.close();
      } catch {
        /* silent */
      }
      this.callbacks.onRemoteLeave(uid);
    }
    this.peers.clear();
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private makePeerConnection(peerUid: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add tracks locales (le mic).
    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }

    // Quand on reçoit un track distant → emit au callback.
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.callbacks.onRemoteStream(peerUid, remoteStream);
      }
    };

    // ICE candidates générés localement → les envoyer au peer.
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendVoiceSignal(this.crewId, this.channelId, peerUid, this.myUid, {
        kind: "ice-candidate",
        payload: event.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        console.warn(`[webrtc] peer ${peerUid} ${pc.connectionState}`);
        // Tentative de re-negotiation (perfect negotiation gère ça
        // automatiquement si l'autre côté est encore là). Pour MVP :
        // log + on garde la connexion ouverte ; le user peut re-join.
      }
    };

    return pc;
  }

  private async handleIncomingSignal(signal: VoiceSignal): Promise<void> {
    try {
      switch (signal.kind) {
        case "offer":
          await this.handleOffer(signal.fromUid, signal.payload as RTCSessionDescriptionInit);
          break;
        case "answer":
          await this.handleAnswer(signal.fromUid, signal.payload as RTCSessionDescriptionInit);
          break;
        case "ice-candidate":
          await this.handleIceCandidate(signal.fromUid, signal.payload as RTCIceCandidateInit);
          break;
      }
    } catch (err) {
      console.warn(`[webrtc] handle ${signal.kind} from ${signal.fromUid}:`, err);
    } finally {
      // Cleanup du signal après application — évite que le watcher
      // re-emit + libère la quota Firestore.
      void consumeVoiceSignal(this.crewId, this.channelId, this.myUid, signal.id);
    }
  }

  private async handleOffer(
    fromUid: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    let pc = this.peers.get(fromUid);
    if (!pc) {
      pc = this.makePeerConnection(fromUid);
      this.peers.set(fromUid, pc);
    }
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendVoiceSignal(this.crewId, this.channelId, fromUid, this.myUid, {
      kind: "answer",
      payload: answer,
    });
  }

  private async handleAnswer(
    fromUid: string,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const pc = this.peers.get(fromUid);
    if (!pc) {
      console.warn(`[webrtc] received answer from unknown peer ${fromUid}`);
      return;
    }
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(
    fromUid: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const pc = this.peers.get(fromUid);
    if (!pc) {
      // Le candidate est arrivé avant l'offer/answer — log mais pas
      // grave, l'autre côté re-tente et le candidate-pair vient.
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`[webrtc] addIceCandidate from ${fromUid}:`, err);
    }
  }
}
