import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Users } from "lucide-react";
import { useVoiceStore } from "@/store/voice";
import { useAuthStore } from "@/store/auth";
import { useUsers } from "@/store/firebaseStores";
import { watchVoiceSession, type VoiceSession } from "@/firebase/voiceCalls";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { VoiceParticipant } from "./VoiceParticipant";
import { AudioMixer } from "./AudioMixer";

const MAX_PARTICIPANTS = 8;

/**
 * Voice panel — affiché en sticky sous le header du channel quand
 * l'user clique "Vocal". Comporte :
 *   - État compact : peer list horizontal + bouton Rejoindre / Quitter
 *     + boutons mute/deafen
 *   - Si pas en vocal mais session existe → "X personnes en vocal" +
 *     bouton "Rejoindre"
 *   - Si pas de session → "Rejoindre le vocal de #channel"
 *
 * Audio mixer (les <audio> des streams remote) vit dans AudioMixer
 * comme composant séparé pour pouvoir le mount sur la racine de l'app
 * (plus haut que le panel) → l'audio continue de jouer même si on
 * navigue ailleurs et que le panel disparaît.
 */
export function VoicePanel({
  crewId,
  channelId,
  crewName,
  channelName,
}: {
  crewId: string;
  channelId: string;
  crewName: string;
  channelName: string;
}) {
  const me = useAuthStore((s) => s.user);
  const usersList = useUsers();
  const voice = useVoiceStore();
  const [session, setSession] = useState<VoiceSession | null>(null);

  // Watch session active dans ce channel — pour afficher "X en vocal"
  // quand on n'a pas encore rejoint.
  useEffect(() => {
    return watchVoiceSession(crewId, channelId, setSession);
  }, [crewId, channelId]);

  const isInThisChannel =
    voice.active?.crewId === crewId && voice.active?.channelId === channelId;
  const isInOtherChannel = voice.active && !isInThisChannel;
  const remotePeerCount = session?.participantUids.length ?? 0;
  const isFull = remotePeerCount >= MAX_PARTICIPANTS && !isInThisChannel;

  const handleJoin = async () => {
    if (!me || isFull) return;
    sounds.click();
    await voice.joinChannel(crewId, channelId, crewName, channelName, me.uid);
  };

  const handleLeave = async () => {
    sounds.click();
    await voice.leaveChannel();
  };

  // Build user lookup by uid pour résoudre les peer infos (avatar/name).
  const userByUid = new Map(usersList.map((u) => [u.uid, u]));

  return (
    <>
      {/* Mixer audio — toujours mount, même quand le panel n'est pas
          rendu, pour que l'audio survive aux navigations. */}
      <AudioMixer />

      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden border-b border-white/[0.06] bg-bg-soft/40"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl ring-1 transition-all",
              isInThisChannel
                ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40 shadow-[0_0_18px_rgba(74,222,128,0.3)]"
                : "bg-white/[0.04] text-fg-muted ring-white/[0.06]",
            )}
          >
            <Mic className="size-4" strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Salon vocal
            </div>
            <div className="text-sm font-medium text-fg-primary">
              {isInThisChannel
                ? `Connecté · ${voice.peers.length} en ligne`
                : remotePeerCount > 0
                  ? `${remotePeerCount} en vocal`
                  : "Personne en vocal"}
            </div>
          </div>

          {isInThisChannel ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => voice.toggleMic()}
                title={voice.micMuted ? "Démuter le micro" : "Muter le micro"}
                className={cn(
                  "grid size-9 place-items-center rounded-lg transition",
                  voice.micMuted
                    ? "bg-danger/15 text-danger ring-1 ring-danger/30 hover:bg-danger/25"
                    : "bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary",
                )}
              >
                {voice.micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
              <button
                onClick={() => voice.toggleDeafen()}
                title={voice.deafened ? "Réactiver le son" : "Couper le son"}
                className={cn(
                  "grid size-9 place-items-center rounded-lg transition",
                  voice.deafened
                    ? "bg-danger/15 text-danger ring-1 ring-danger/30 hover:bg-danger/25"
                    : "bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary",
                )}
              >
                {voice.deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
              </button>
              <button
                onClick={handleLeave}
                title="Quitter le vocal"
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-3 py-2 text-xs font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger/25"
              >
                <PhoneOff className="size-3.5" />
                Quitter
              </button>
            </div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={!me || isFull}
              title={
                !me
                  ? "Connecte-toi pour rejoindre le vocal"
                  : isFull
                    ? `Salon plein (${MAX_PARTICIPANTS} max)`
                    : isInOtherChannel
                      ? "Va te déconnecter de ton vocal actif d'abord"
                      : undefined
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-400/25 hover:shadow-[0_0_18px_rgba(74,222,128,0.3)]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-400/15 disabled:hover:shadow-none",
              )}
            >
              <Mic className="size-3.5" />
              {isInOtherChannel
                ? "Déjà en vocal ailleurs"
                : isFull
                  ? "Plein"
                  : "Rejoindre"}
            </button>
          )}
        </div>

        {/* Liste participants — affichée seulement quand on est connecté
            ou qu'il y a des gens en vocal. */}
        {(isInThisChannel || remotePeerCount > 0) && (
          <div className="border-t border-white/[0.04] px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              <Users className="size-3" />
              Participants ({voice.peers.length || remotePeerCount}/{MAX_PARTICIPANTS})
            </div>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {(isInThisChannel
                  ? voice.peers
                  : (session?.participantUids ?? []).map((uid) => ({
                      uid,
                      joinedAt: 0,
                      micMuted: false,
                      deafened: false,
                    }))
                ).map((peer) => {
                  const user = userByUid.get(peer.uid);
                  const stream = voice.remoteStreams.get(peer.uid);
                  const isMe = peer.uid === me?.uid;
                  return (
                    <VoiceParticipant
                      key={peer.uid}
                      uid={peer.uid}
                      displayName={user?.displayName ?? null}
                      avatarUrl={user?.avatarUrl ?? null}
                      micMuted={peer.micMuted || (isMe && voice.micMuted)}
                      deafened={peer.deafened || (isMe && voice.deafened)}
                      isMe={isMe}
                      isSpeaking={voice.speakingUids.has(peer.uid)}
                      stream={stream ?? null}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Erreur — affichée à la moindre erreur, peu importe l'état
            de la session (sinon les échecs de join restent invisibles
            à l'user, le bouton « Rejoindre » a juste l'air de ne rien
            faire). */}
        {voice.error && (
          <div className="border-t border-danger/20 bg-danger/[0.06] px-4 py-2 text-xs text-danger">
            ⚠ {voice.error}{" "}
            <button
              type="button"
              onClick={() => voice.clearError()}
              className="ml-2 underline opacity-70 hover:opacity-100"
            >
              fermer
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
