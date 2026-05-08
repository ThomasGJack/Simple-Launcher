import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Plus, Trash2, X } from "lucide-react";
import { sounds } from "@/lib/sounds";

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

/**
 * Modal compact pour composer un sondage à insérer dans un message
 * channel. Question + 2 à 6 options. Validation : question non vide
 * + au moins 2 options remplies.
 */
export function PollComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (poll: { question: string; options: string[] }) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit =
    question.trim().length > 0 && validOptions.length >= MIN_OPTIONS && !busy;

  const handleAddOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions([...options, ""]);
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleChangeOption = (idx: number, value: string) => {
    setOptions(options.map((o, i) => (i === idx ? value : o)));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        question: question.trim(),
        options: validOptions,
      });
      sounds.success();
    } catch (err) {
      console.warn("[PollComposer] submit failed:", err);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/75 p-6 backdrop-blur-md"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-bg-soft p-6 ring-1 ring-white/[0.08]"
      >
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="size-4 text-accent" />
          <h3 className="font-display text-base text-fg-primary">
            Nouveau sondage
          </h3>
          <button
            onClick={onCancel}
            className="ml-auto rounded-md p-1 text-fg-dim hover:bg-white/[0.05] hover:text-fg-primary"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Question
            </label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Quelle est ta couleur préférée ?"
              maxLength={140}
              autoFocus
              className="w-full rounded-lg bg-bg-base/60 px-3 py-2 text-sm text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                Options ({validOptions.length}/{MAX_OPTIONS})
              </label>
              {options.length < MAX_OPTIONS && (
                <button
                  onClick={handleAddOption}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent/80"
                >
                  <Plus className="size-3" /> Ajouter une option
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">
                    {idx + 1}
                  </span>
                  <input
                    value={opt}
                    onChange={(e) => handleChangeOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}…`}
                    maxLength={80}
                    className="flex-1 rounded-lg bg-bg-base/60 px-3 py-1.5 text-sm text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
                  />
                  {options.length > MIN_OPTIONS && (
                    <button
                      onClick={() => handleRemoveOption(idx)}
                      className="rounded-md p-1 text-fg-dim hover:bg-danger/10 hover:text-danger"
                      aria-label="Supprimer cette option"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted hover:bg-white/[0.08]"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base shadow-[0_0_12px_var(--color-accent-soft)] disabled:opacity-50"
            >
              <BarChart3 className="size-3" /> Publier le sondage
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
