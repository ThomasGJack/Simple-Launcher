import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getMicStream, stopStream } from "@/lib/audioDevices";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Modal de test du micro avant de rejoindre un vocal. Acquiert le
 * mic via getUserMedia (déclenche la permission Windows si nécessaire),
 * analyse le niveau en temps réel via Web Audio API, et affiche une
 * barre de niveau qui réagit à la voix de l'user.
 *
 * Permet de vérifier :
 *   - Que la permission micro est OK
 *   - Que le bon device est sélectionné (cf. lib/audioDevices)
 *   - Que le niveau d'entrée est convenable (pas trop bas, pas saturé)
 *
 * Bouton "Fermer" libère le mic + close.
 */
export function MicTestModal({ onClose }: { onClose: () => void }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // 0..1 RMS
  const [peakLevel, setPeakLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getMicStream();
        if (cancelled) {
          stopStream(s);
          return;
        }
        setStream(s);
        // Init analyser
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        let peak = 0;
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(rms);
          if (rms > peak) peak = rms;
          setPeakLevel(peak);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup à la fermeture — release le mic + close audio context.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopStream(stream);
      try {
        ctxRef.current?.close();
      } catch {
        /* silent */
      }
    };
  }, [stream]);

  const status = (() => {
    if (error) return { label: "Erreur d'accès", color: "danger" as const };
    if (!stream) return { label: "Connexion…", color: "muted" as const };
    if (peakLevel < 0.02)
      return { label: "Mic silencieux — parle un peu", color: "muted" as const };
    if (peakLevel > 0.4)
      return { label: "Niveau bon", color: "success" as const };
    return { label: "Niveau OK", color: "success" as const };
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/75 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-bg-soft ring-1 ring-white/[0.08]"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
              <Mic className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg text-fg-primary">
                Tester ton micro
              </h2>
              <p className="text-[11px] text-fg-muted">
                Parle pour voir si Windows capte ta voix.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.click();
              onClose();
            }}
            className="rounded-lg p-2 text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col gap-4 p-5">
          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger ring-1 ring-danger/30">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <strong>Impossible d'accéder au micro</strong>
                <div className="mt-1 text-xs">{error}</div>
                <div className="mt-2 text-[11px] text-fg-muted">
                  Vérifie que tu as autorisé l'accès au micro pour Simple
                  Launcher dans Paramètres Windows → Confidentialité.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Live level meter */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-fg-dim">Niveau micro</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      status.color === "success" && "text-emerald-300",
                      status.color === "danger" && "text-danger",
                      status.color === "muted" && "text-fg-muted",
                    )}
                  >
                    {status.color === "success" && <CheckCircle2 className="size-3" />}
                    {status.label}
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-bg-base/60 ring-1 ring-white/[0.06]">
                  {/* Peak indicator (lent) */}
                  <div
                    className="absolute inset-y-0 left-0 bg-emerald-400/30 transition-all duration-300"
                    style={{ width: `${Math.min(100, peakLevel * 200)}%` }}
                  />
                  {/* Niveau live (rapide) */}
                  <motion.div
                    className={cn(
                      "absolute inset-y-0 left-0 transition-colors",
                      level > 0.7
                        ? "bg-rose-400"
                        : level > 0.4
                          ? "bg-amber-400"
                          : "bg-emerald-400",
                    )}
                    animate={{ width: `${Math.min(100, level * 200)}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-fg-dim">
                  <span>Silence</span>
                  <span>OK</span>
                  <span>Saturé</span>
                </div>
              </div>

              <p className="text-[11px] text-fg-muted">
                💡 Si le niveau ne bouge pas quand tu parles, vérifie que tu es
                connecté au bon device (cf. Paramètres Windows ou panneau de
                contrôle Realtek/Voicemeeter). Tu peux aussi changer le mic
                actif via{" "}
                <strong className="text-fg-muted">
                  Paramètres → Apparence → Périphérique audio
                </strong>
                .
              </p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MicTestModalHost({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && <MicTestModal onClose={onClose} />}
    </AnimatePresence>
  );
}
