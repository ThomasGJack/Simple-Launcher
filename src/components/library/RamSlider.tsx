import { motion } from "framer-motion";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/cn";

/** Min RAM the picker exposes — anything < 512 MiB is mapped to "default". */
export const RAM_MIN = 0;
/** Cap at 16 GiB; admins / users with more than that for vanilla MC are
 *  in pure overkill territory and we don't want to encourage it. */
export const RAM_MAX = 16384;
const STEP = 256;

const PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Défaut" },
  { value: 4096, label: "4 Go" },
  { value: 6144, label: "6 Go" },
  { value: 8192, label: "8 Go" },
  { value: 12288, label: "12 Go" },
];

export function ramTone(value: number): { tone: "neutral" | "warn" | "danger"; tip: string } {
  if (value === 0) {
    return {
      tone: "warn",
      tip: "« Défaut » = Prism décide tout seul (~1–2 Go). Pour la plupart des modpacks il faut au moins 4 Go pour éviter les freezes.",
    };
  }
  if (value < 3072) {
    return {
      tone: "warn",
      tip: "Très peu pour un modpack — risque de lags / crashes au-delà de quelques chunks. 4 Go minimum recommandé.",
    };
  }
  if (value <= 6144) {
    return {
      tone: "neutral",
      tip: "Solide pour la majorité des modpacks vanilla-ish ou allégés (jusqu'à ~150 mods).",
    };
  }
  if (value <= 10240) {
    return {
      tone: "neutral",
      tip: "Confortable pour les gros modpacks (200+ mods, exploration / tech / magic) avec shaders.",
    };
  }
  return {
    tone: "danger",
    tip: "Très élevé. Vérifie d'avoir au moins cette quantité de RAM physique disponible, sinon Java va swap et lagger pire.",
  };
}

/**
 * Reusable RAM allocation slider used by both the admin form (to set the
 * default for everyone) and the module detail page (to let each player
 * override the default for their own machine). The visuals are intentionally
 * identical between the two contexts so the UX feels consistent.
 */
export function RamSlider({
  value,
  onChange,
  /** Optional reference value rendered next to the live readout (e.g. "default 8 Go"). */
  defaultRef,
  /** Whether to render the explanatory tip block under the slider. */
  showTip = true,
}: {
  value: number;
  onChange: (v: number) => void;
  defaultRef?: number;
  showTip?: boolean;
}) {
  const pct =
    RAM_MAX > 0 ? Math.min(100, Math.max(0, ((value - RAM_MIN) / (RAM_MAX - RAM_MIN)) * 100)) : 0;
  const gb = (mb: number) => (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1);
  const { tone, tip } = ramTone(value);

  return (
    <div className="space-y-3 rounded-2xl bg-bg-base/30 p-4 ring-1 ring-white/[0.04]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent">
          <Cpu className="size-3" />
          RAM allouée à Minecraft
        </div>
        <div className="font-display text-2xl tabular-nums text-fg-primary">
          {value === 0 ? (
            <span className="text-fg-muted">Défaut</span>
          ) : (
            <>
              {gb(value)} <span className="text-sm text-fg-muted">Go</span>
            </>
          )}
          {defaultRef !== undefined && defaultRef !== value && defaultRef >= 512 && (
            <span className="ml-2 text-xs font-normal text-fg-dim">
              (défaut {gb(defaultRef)} Go)
            </span>
          )}
        </div>
      </div>

      {/* Custom slider track */}
      <div className="relative pt-1.5">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.04] ring-1 ring-white/[0.04]">
          {/* Tick marks at common GB stops */}
          {[2048, 4096, 6144, 8192, 10240, 12288, 14336].map((tick) => (
            <div
              key={tick}
              className="absolute top-0 h-full w-px bg-white/[0.08]"
              style={{ left: `${(tick / RAM_MAX) * 100}%` }}
            />
          ))}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/70 to-accent shadow-[0_0_14px_var(--color-accent-glow)]"
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
          />
        </div>
        <input
          type="range"
          min={RAM_MIN}
          max={RAM_MAX}
          step={STEP}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="no-drag absolute inset-0 size-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:size-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-accent
            [&::-webkit-slider-thumb]:bg-bg-base
            [&::-webkit-slider-thumb]:shadow-[0_0_12px_var(--color-accent-glow)]
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:size-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-accent
            [&::-moz-range-thumb]:bg-bg-base"
          aria-label="RAM allouée à Minecraft"
        />
      </div>

      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={cn(
                "no-drag rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition-all",
                active
                  ? "bg-accent text-bg-base ring-accent shadow-[0_0_12px_var(--color-accent-soft)]"
                  : "bg-white/[0.03] text-fg-muted ring-white/[0.06] hover:bg-white/[0.06] hover:text-fg-primary",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Contextual hint */}
      {showTip && (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-xs leading-relaxed ring-1",
            tone === "warn" && "bg-amber-500/[0.08] text-amber-200 ring-amber-500/20",
            tone === "danger" && "bg-rose-500/[0.08] text-rose-200 ring-rose-500/20",
            tone === "neutral" && "bg-white/[0.02] text-fg-muted ring-white/[0.04]",
          )}
        >
          {tip}
        </p>
      )}
    </div>
  );
}
