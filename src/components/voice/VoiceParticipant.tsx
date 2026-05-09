import { useEffect } from "react";
import { motion } from "framer-motion";
import { MicOff, HeadphoneOff } from "lucide-react";
import { useVoiceStore } from "@/store/voice";
import { createVoiceActivityDetector } from "@/lib/audioDevices";
import { cn } from "@/lib/cn";

/**
 * Avatar d'un participant du vocal avec :
 *   - Anneau cyan animé qui pulse quand il parle (VAD)
 *   - Icône mic-off en bas à droite si muted
 *   - Icône headphone-off si deafened (sourd : n'entend personne)
 *   - Tooltip avec son name + status
 *
 * VAD : si on a un stream remote pour ce peer, on attache un AnalyserNode
 * pour détecter quand il parle. Pour "soi-même", pas de VAD pour
 * l'instant (le mic local n'est pas re-injecté en stream local pour
 * éviter le feedback) — affichage d'un ring statique cyan.
 */
export function VoiceParticipant({
  uid,
  displayName,
  avatarUrl,
  micMuted,
  deafened,
  isMe,
  isSpeaking,
  stream,
}: {
  uid: string;
  displayName: string | null;
  avatarUrl: string | null;
  micMuted: boolean;
  deafened: boolean;
  isMe: boolean;
  isSpeaking: boolean;
  stream: MediaStream | null;
}) {
  const setSpeaking = useVoiceStore((s) => s.setSpeaking);

  // VAD — attach analyser sur le stream remote. Cleanup au unmount.
  useEffect(() => {
    if (!stream || isMe) return;
    const cleanup = createVoiceActivityDetector(stream, (speaking) => {
      setSpeaking(uid, speaking);
    });
    return cleanup;
  }, [stream, uid, isMe, setSpeaking]);

  const initial = (displayName ?? "?").trim().charAt(0).toUpperCase();
  const subtitle = micMuted ? "Muté" : deafened ? "Sourd" : isSpeaking ? "Parle" : "Écoute";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="relative flex flex-col items-center gap-1"
      title={`${displayName ?? "Anonyme"} · ${subtitle}`}
    >
      <div className="relative">
        {/* Pulse ring — visible uniquement quand le peer parle */}
        {isSpeaking && !micMuted && (
          <motion.div
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.25, 0.6] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full ring-2 ring-emerald-400/50"
          />
        )}

        <div
          className={cn(
            "grid size-12 place-items-center rounded-full ring-2 transition-all",
            micMuted
              ? "ring-fg-dim/30 grayscale"
              : isSpeaking
                ? "ring-emerald-400/60 shadow-[0_0_18px_rgba(74,222,128,0.4)]"
                : "ring-white/10",
          )}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-12 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="font-display text-base text-accent">{initial}</span>
          )}
        </div>

        {/* Mic-off badge */}
        {micMuted && (
          <div className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-danger ring-2 ring-bg-soft">
            <MicOff className="size-2.5 text-bg-base" strokeWidth={3} />
          </div>
        )}
        {/* Deafened badge — affiché à gauche si dispo, à la place du mic-off
            si le peer a aussi mute (deafened => mic_muted aussi par convention) */}
        {deafened && !micMuted && (
          <div className="absolute -bottom-0.5 -left-0.5 grid size-5 place-items-center rounded-full bg-danger ring-2 ring-bg-soft">
            <HeadphoneOff className="size-2.5 text-bg-base" strokeWidth={3} />
          </div>
        )}
        {isMe && (
          <div className="absolute -top-1 -right-1 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-bg-base ring-2 ring-bg-soft">
            Toi
          </div>
        )}
      </div>

      <div className="max-w-[5rem] truncate text-[10px] text-fg-muted">
        {displayName ?? "Anon"}
      </div>
    </motion.div>
  );
}
