import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Keyboard, X, RotateCcw } from "lucide-react";
import {
  SHORTCUT_ACTIONS,
  loadBindings,
  setBinding,
} from "@/lib/customShortcuts";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Settings card pour rebinder les raccourcis clavier custom. Pour
 * chaque action du registry, affiche une row avec input "rebinder"
 * qui capture la prochaine combo pressée.
 */
export function ShortcutsPanel() {
  const [bindings, setBindings] = useState<Record<string, string>>(loadBindings());
  const [recording, setRecording] = useState<string | null>(null);

  const handleStartRecord = (actionId: string) => {
    setRecording(actionId);
  };

  const handleClear = async (actionId: string) => {
    await setBinding(actionId, "");
    setBindings(loadBindings());
    sounds.click();
  };

  const handleRecorded = async (actionId: string, spec: string) => {
    if (!spec) {
      setRecording(null);
      return;
    }
    // Détecte les conflits côté UI
    const conflict = Object.entries(bindings).find(
      ([id, s]) => id !== actionId && s === spec,
    );
    if (conflict) {
      const lbl =
        SHORTCUT_ACTIONS.find((a) => a.id === conflict[0])?.label ?? conflict[0];
      if (
        !confirm(
          `Le raccourci « ${spec} » est déjà utilisé par « ${lbl} ». L'écraser et libérer l'autre ?`,
        )
      ) {
        setRecording(null);
        return;
      }
      await setBinding(conflict[0], "");
    }
    await setBinding(actionId, spec);
    setBindings(loadBindings());
    setRecording(null);
    sounds.success();
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
          <Keyboard className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-fg-primary">Raccourcis clavier</h3>
          <p className="text-xs text-fg-muted">
            Customise les raccourcis globaux. Cliquer sur la case puis
            appuyer la combo voulue.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        {SHORTCUT_ACTIONS.map((action) => {
          const current = bindings[action.id] ?? "";
          const isRecording = recording === action.id;
          return (
            <div
              key={action.id}
              className="flex items-start gap-3 rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg-primary">
                  {action.label}
                </div>
                {action.hint && (
                  <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                    {action.hint}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isRecording ? (
                  <RecorderInput
                    onCancel={() => setRecording(null)}
                    onCapture={(spec) => handleRecorded(action.id, spec)}
                  />
                ) : (
                  <button
                    onClick={() => handleStartRecord(action.id)}
                    className={cn(
                      "min-w-[120px] rounded-lg px-3 py-1.5 text-xs font-mono transition",
                      current
                        ? "bg-accent/15 text-accent ring-1 ring-accent/30 hover:bg-accent/20"
                        : "bg-white/[0.04] text-fg-dim ring-1 ring-white/[0.06] hover:bg-white/[0.08]",
                    )}
                  >
                    {current || "(non assigné)"}
                  </button>
                )}
                {current && !isRecording && (
                  <button
                    onClick={() => handleClear(action.id)}
                    title="Retirer le raccourci"
                    className="rounded-lg p-1.5 text-fg-dim hover:bg-white/[0.06] hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

/**
 * Input "recorder" : capture le prochain keydown comme nouveau spec.
 * Affiche les modifs en cours en live (ex: "Ctrl + …" pendant que
 * l'user maintient Ctrl).
 */
function RecorderInput({
  onCapture,
  onCancel,
}: {
  onCapture: (spec: string) => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState("Tape une combo…");
  const inputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Win");
      const k = e.key;
      // Si pas de touche "non-modifier" pressée, juste preview
      if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta") {
        setPreview(parts.length ? parts.join(" + ") + " + …" : "Tape une combo…");
        return;
      }
      // Normaliser la touche : F1-F12, lettres en lower
      let mainKey = k;
      if (k.length === 1) mainKey = k.toUpperCase();
      else if (/^F\d+$/i.test(k)) mainKey = k.toUpperCase();
      else if (k === " ") mainKey = "Space";
      else if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
        // Pas supporté par le parser Rust pour l'instant
        setPreview("Touche non supportée — essaye F1-F12 ou une lettre");
        return;
      }
      const spec = [...parts, mainKey].join("+");
      onCapture(spec);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCapture, onCancel]);

  return (
    <div
      ref={inputRef}
      tabIndex={0}
      className="min-w-[180px] rounded-lg bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent ring-1 ring-accent/40 outline-none animate-pulse"
    >
      <RotateCcw className="mr-1.5 inline size-3" />
      {preview}
    </div>
  );
}
