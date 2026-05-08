import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Check } from "lucide-react";
import {
  applySeasonalTheme,
  loadSeasonalMode,
  resolveSeasonalTheme,
  saveSeasonalMode,
  type SeasonalMode,
} from "@/lib/seasonal";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const OPTIONS: { value: SeasonalMode; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Automatique",
    hint: "Halloween du 15 oct au 5 nov, Noël du 15 déc au 5 jan.",
  },
  { value: "halloween", label: "🎃 Halloween", hint: "Force le thème Halloween." },
  { value: "christmas", label: "🎄 Noël", hint: "Force le thème Noël." },
  { value: "off", label: "Désactivé", hint: "Garder ma palette par défaut." },
];

/**
 * Settings card pour choisir le mode saisonnier (auto / forcé / off).
 * Au changement, applique le thème immédiatement et persiste en
 * localStorage pour le boot suivant.
 */
export function SeasonalPanel() {
  const [mode, setMode] = useState<SeasonalMode>(loadSeasonalMode());

  const handleChange = (next: SeasonalMode) => {
    setMode(next);
    saveSeasonalMode(next);
    applySeasonalTheme(resolveSeasonalTheme(next));
    sounds.click();
  };

  const active = resolveSeasonalTheme(mode);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-fg-primary">
            Thèmes saisonniers
          </h3>
          <p className="text-xs text-fg-muted">
            Habille le launcher pour Halloween ou Noël.
          </p>
        </div>
        {active && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-success/30">
            <Check className="size-3" /> {active.emoji} {active.label}
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const isActive = mode === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              className={cn(
                "rounded-xl p-3 text-left transition",
                isActive
                  ? "bg-accent/10 text-fg-primary ring-1 ring-accent/40"
                  : "bg-white/[0.03] text-fg-muted ring-1 ring-white/[0.05] hover:bg-white/[0.06]",
              )}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg-dim">
                {opt.hint}
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview palette quand un thème est forcé/actif */}
      {active && (
        <div className="mt-4 rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            Palette {active.label}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="size-8 rounded-lg ring-1 ring-white/10"
              style={{ background: active.accent }}
            />
            <div
              className="size-8 rounded-lg ring-1 ring-white/10"
              style={{ background: active.accentSecondary }}
            />
            <span className="ml-2 text-xs text-fg-muted">
              Couleur d'accent + couleur secondaire (glows, halos).
            </span>
          </div>
        </div>
      )}
    </motion.section>
  );
}

/**
 * Boot helper — à appeler une fois au démarrage de l'app pour appliquer
 * le mode persisté avant que la première frame s'affiche.
 */
export function bootSeasonalTheme(): void {
  const mode = loadSeasonalMode();
  const theme = resolveSeasonalTheme(mode);
  applySeasonalTheme(theme);
}
