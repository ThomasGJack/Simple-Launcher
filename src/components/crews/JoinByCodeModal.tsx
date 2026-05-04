import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, KeyRound, X } from "lucide-react";
import { joinCrewByCode } from "@/firebase/crews";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";

/**
 * Modal to paste an 8-char invite code and resolve it to a crew.
 * Server-side rules + the lookup-then-write pattern in
 * `joinCrewByCode` mean the user can't fish around for codes — only
 * exact matches work.
 */
export function JoinByCodeModal({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  onJoined: (crewId: string) => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!me) return;
    if (!code.trim()) {
      setError("Tape ton code d'invitation");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const crewId = await joinCrewByCode(
        code.trim(),
        me.uid,
        me.displayName ?? null,
        me.photoURL ?? null,
      );
      sounds.success();
      onJoined(crewId);
      onClose();
      setCode("");
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-base/80 p-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="no-drag w-full max-w-md overflow-hidden rounded-3xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <header className="flex items-center justify-between border-b border-white/[0.06] p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30">
                  <KeyRound className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl text-fg-primary">Rejoindre par code</h2>
                  <p className="text-xs text-fg-muted">
                    Colle le code d'invitation que ton ami t'a donné.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06]"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="ABC23DEF"
                maxLength={12}
                className="no-drag w-full rounded-xl bg-bg-base/40 px-4 py-3 text-center font-mono text-2xl tracking-widest text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                autoFocus
              />

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm ring-1 ring-danger/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                  <p className="text-fg-primary">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !code.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-medium text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] hover:shadow-[0_0_36px_var(--color-accent-glow)] disabled:opacity-50"
              >
                {submitting ? "Vérification…" : "Rejoindre"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
