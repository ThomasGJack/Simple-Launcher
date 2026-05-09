import { useMemo } from "react";
import { useVoiceStore } from "@/store/voice";
import { applyOutputDevice } from "@/lib/audioDevices";

/**
 * Render hidden <audio> elements for each remote stream — ce qui les
 * fait jouer dans le device output du user. setSinkId() appliqué si
 * supporté pour utiliser le device choisi (sinon défault système).
 *
 * Le `volume` global respecte le state `deafened` — si l'user est
 * sourd, on coupe tous les audio à 0.
 *
 * Mounted depuis VoicePanel (donc se démonte si l'user navigue ailleurs
 * et que VoicePanel disparaît) — comportement OK pour MVP : si tu pars
 * en navigation pendant un vocal actif, les autres restent connectés
 * mais tu ne les entends plus le temps de revenir au channel. Audio
 * persistant cross-page = future amélioration (nécessite un layer plus
 * haut dans l'arbre composant — App.tsx racine).
 */
export function AudioMixer() {
  const remoteStreams = useVoiceStore((s) => s.remoteStreams);
  const deafened = useVoiceStore((s) => s.deafened);

  // Convert Map → array stable pour iteration JSX. useMemo pour éviter
  // les re-renders de chaque <RemoteAudio> à chaque change non-pertinent.
  const entries = useMemo(
    () => Array.from(remoteStreams.entries()),
    [remoteStreams],
  );

  return (
    <div aria-hidden style={{ display: "none" }}>
      {entries.map(([uid, stream]) => (
        <RemoteAudio key={uid} stream={stream} muted={deafened} />
      ))}
    </div>
  );
}

function RemoteAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  return (
    <audio
      autoPlay
      playsInline
      muted={muted}
      ref={(el) => {
        if (!el) return;
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        // Apply chosen output device (asynchrone — silently fail si
        // setSinkId() pas supporté ou device introuvable).
        void applyOutputDevice(el);
      }}
    />
  );
}

/**
 * Hook utilitaire pour les composants qui veulent exposer un toggle
 * "Tester ma sortie audio" — joue un bip court via Web Audio sur le
 * device output choisi, pour vérifier que l'user entend bien.
 *
 * Utilisé dans Settings → onglet Apparence (à côté de l'aperçu sons),
 * ou dans le panel voice avant join. Pas couplé au store voice.
 */
export function useAudioOutputTest() {
  // Lazy import du sons module pour éviter de charger Web Audio
  // au mount d'un composant qui ne l'utilise pas.
  return {
    test: async () => {
      const { sounds } = await import("@/lib/sounds");
      sounds.notification();
    },
  };
}
