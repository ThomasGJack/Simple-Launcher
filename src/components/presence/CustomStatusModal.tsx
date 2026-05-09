import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle, Loader2 } from "lucide-react";
import { setCustomStatus } from "@/firebase/presence";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const PRESETS = [
  { emoji: "💤", text: "AFK" },
  { emoji: "🍔", text: "Pause repas" },
  { emoji: "🎯", text: "Concentré" },
  { emoji: "💼", text: "Au boulot" },
  { emoji: "🎮", text: "En jeu, ne pas déranger" },
  { emoji: "📚", text: "En train d'étudier" },
  { emoji: "🛌", text: "Dodo" },
  { emoji: "📞", text: "En appel" },
];

const MAX_LEN = 80;

/**
 * Modal pour set/clear son statut custom (AFK, Travaille, etc.).
 * Le statut override l'affichage "joue à X" / "online" dans MembersList,
 * Communauté, PiP, sidebar etc.
 *
 * Pas de date d'expiration auto pour le MVP — l'user clear lui-même.
 */
export function CustomStatusModal({
  uid,
  currentStatus,
  onClose,
}: {
  uid: string;
  currentStatus: string | null;
  onClose: () => void;
}) {
  const [text, setText] = useState(currentStatus ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const handleSave = async () => {
    if (busy) return;
    sounds.click();
    setBusy(true);
    setError(null);
    try {
      await setCustomStatus(uid, text.trim() || null);
      sounds.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (busy) return;
    sounds.click();
    setBusy(true);
    setError(null);
    try {
      await setCustomStatus(uid, null);
      sounds.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    sounds.click();
    setText(`${preset.emoji} ${preset.text}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/75 p-6 backdrop-blur-md"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-bg-soft ring-1 ring-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg text-fg-primary">
                Définir un statut
              </h2>
              <p className="text-[11px] text-fg-muted">
                Dis aux autres ce que tu fais (override "joue à X").
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col gap-4 p-5">
          {/* Input */}
          <div>
            <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Ton statut ({text.length}/{MAX_LEN})
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              placeholder="Ex: 💤 AFK 30 min"
              autoFocus
              maxLength={MAX_LEN}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className="w-full rounded-lg bg-bg-base/60 px-3 py-2.5 text-sm text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
          </div>

          {/* Presets */}
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Suggestions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.text}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 text-xs text-fg-muted ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-fg-primary",
                  )}
                >
                  <span>{preset.emoji}</span>
                  <span>{preset.text}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-danger/10 p-3 text-xs text-danger ring-1 ring-danger/30">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            {currentStatus && (
              <button
                type="button"
                onClick={handleClear}
                disabled={busy}
                className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              >
                Effacer
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl px-3 py-2 text-xs text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-medium text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Enregistrer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CustomStatusModalHost({
  uid,
  currentStatus,
  open,
  onClose,
}: {
  uid: string;
  currentStatus: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <CustomStatusModal
          uid={uid}
          currentStatus={currentStatus}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}
