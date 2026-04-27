import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, RotateCcw, Check } from "lucide-react";
import { RamSlider } from "./RamSlider";
import { getUserRamOverride, setUserRamOverride } from "@/lib/minecraft";
import type { MinecraftModule } from "@/types/module";
import { sounds } from "@/lib/sounds";

/**
 * User-facing RAM allocation widget shown on a Minecraft module's detail
 * page. Lets each player override the admin-configured `maxRamMb` with their
 * own value (saved per-machine via localStorage), without affecting other
 * users of the same modpack. The override is picked up at the next install
 * or launch — the Rust side patches `instance.cfg` in place so no reinstall
 * is needed when the player bumps it later.
 */
export function MinecraftRamControl({ module }: { module: MinecraftModule }) {
  const adminDefault = module.maxRamMb && module.maxRamMb >= 512 ? module.maxRamMb : 0;
  const initialOverride = getUserRamOverride(module.id);
  const [value, setValue] = useState<number>(initialOverride ?? adminDefault);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync when navigating between different modules (component remounts but
  // useState initializer also re-runs, this is just defensive).
  useEffect(() => {
    const override = getUserRamOverride(module.id);
    setValue(override ?? adminDefault);
  }, [module.id, adminDefault]);

  const isOverridden =
    initialOverride !== null && initialOverride !== adminDefault;
  const hasUnsavedChange = value !== (initialOverride ?? adminDefault);

  const handleSave = () => {
    // If the user dragged it back exactly to the admin's default, treat that
    // as "no override" rather than saving a duplicate value. Cleaner state.
    if (value === adminDefault || value < 512) {
      setUserRamOverride(module.id, null);
    } else {
      setUserRamOverride(module.id, value);
    }
    setSavedAt(Date.now());
    sounds.success();
  };

  const handleReset = () => {
    setUserRamOverride(module.id, null);
    setValue(adminDefault);
    setSavedAt(Date.now());
    sounds.click();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-3xl glass p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-muted">
          <Cpu className="size-3" />
          RAM allouée
        </h3>
        {isOverridden ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-amber-500/20">
            <span className="size-1.5 rounded-full bg-amber-300" />
            Réglage perso actif
          </span>
        ) : adminDefault > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.06]">
            Défaut admin
          </span>
        ) : null}
      </div>

      <p className="mb-4 text-xs leading-relaxed text-fg-muted">
        Ajuste la RAM à ta machine. {adminDefault > 0 ? (
          <>
            Le préréglage de l'admin est{" "}
            <strong className="text-fg-primary">
              {(adminDefault / 1024).toFixed(adminDefault % 1024 === 0 ? 0 : 1)} Go
            </strong>
            . Ton réglage est sauvegardé localement et ne change rien pour les autres potes.
          </>
        ) : (
          <>
            L'admin n'a pas configuré de défaut, donc Prism utilise sa valeur système (souvent 1–2 Go) si tu ne touches à rien. Pour un modpack, mets au moins 4 Go.
          </>
        )}
      </p>

      <RamSlider value={value} onChange={setValue} defaultRef={adminDefault} />

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChange}
          className={
            "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all " +
            (hasUnsavedChange
              ? "bg-accent text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]"
              : "bg-white/[0.03] text-fg-dim ring-1 ring-white/[0.04] cursor-not-allowed")
          }
        >
          {savedAt && !hasUnsavedChange ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4" /> Sauvegardé
            </span>
          ) : (
            "Appliquer au prochain JOUER"
          )}
        </button>
        {isOverridden && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-fg-primary"
            title="Revenir au défaut admin"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        )}
      </div>
    </motion.div>
  );
}
