import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Check, Loader2 } from "lucide-react";
import {
  applySeasonalTheme,
  resolveSeasonalTheme,
  SEASONAL_THEMES,
  type SeasonalMode,
} from "@/lib/seasonal";
import {
  watchSeasonalConfig,
  setSeasonalConfig,
  type SeasonalConfig,
} from "@/firebase/seasonalConfig";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const OPTIONS: { value: SeasonalMode; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto (par défaut)",
    hint: "Halloween du 15 oct au 5 nov, Noël du 15 déc au 5 jan, sinon palette par défaut.",
  },
  {
    value: "halloween",
    label: "🎃 Halloween (forcé)",
    hint: "Active le thème Halloween toute l'année — utile pour tester ou pour une event surprise.",
  },
  {
    value: "christmas",
    label: "🎄 Noël (forcé)",
    hint: "Active le thème Noël toute l'année — utile pour tester ou prolonger les fêtes.",
  },
  {
    value: "off",
    label: "Désactivé",
    hint: "Aucun thème saisonnier ne s'applique, même pendant les périodes Halloween / Noël.",
  },
];

/**
 * Onglet admin "Saisons" — pilote le mode saisonnier global de TOUS
 * les launchers connectés. Avant Phase J, c'était un toggle par-user
 * en localStorage, mais le user n'aurait jamais cliqué dessus → on
 * en fait un override admin centralisé qui applique la même palette
 * à toute la communauté pour les events.
 *
 * Live preview : le panel applique le thème immédiatement au moment
 * du click, AVANT de persister. Si la write Firestore échoue, le watcher
 * remettra la valeur précédente — pas de divergence.
 */
export function SeasonalAdminPanel() {
  const me = useAuthStore((s) => s.user);
  const [config, setConfig] = useState<SeasonalConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return watchSeasonalConfig((c) => {
      setConfig(c);
    });
  }, []);

  const handleChange = async (next: SeasonalMode) => {
    if (!me || busy) return;
    sounds.click();
    setBusy(true);
    setError(null);
    // Optimistic preview — applique immédiatement pour l'admin pendant
    // que la write part. Le watcher remettra la vraie valeur si la
    // persist échoue (côté admin uniquement — les autres users voient
    // déjà la valeur live via leur watcher).
    applySeasonalTheme(resolveSeasonalTheme(next));
    try {
      await setSeasonalConfig(next, me.uid);
      sounds.success();
    } catch (err) {
      console.warn("[seasonal-admin] persist failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  const active = config ? resolveSeasonalTheme(config.mode) : null;
  const currentMode = config?.mode ?? "auto";

  return (
    <div className="space-y-6">
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
              Mode saisonnier global
            </h3>
            <p className="text-xs text-fg-muted">
              Pilote l'apparence de TOUS les launchers de la communauté.
              Le user ne peut pas overrider ce choix.
            </p>
          </div>
          {config === null ? (
            <Loader2 className="size-4 animate-spin text-fg-muted" />
          ) : active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-success/30">
              <Check className="size-3" /> {active.emoji} {active.label} actif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-fg-muted ring-1 ring-white/[0.08]">
              Aucun thème actif
            </span>
          )}
        </header>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map((opt) => {
            const isCurrent = currentMode === opt.value;
            return (
              <button
                key={opt.value}
                disabled={busy || config === null}
                onClick={() => handleChange(opt.value)}
                className={cn(
                  "rounded-xl p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                  isCurrent
                    ? "bg-accent/10 text-fg-primary ring-1 ring-accent/40"
                    : "bg-white/[0.03] text-fg-muted ring-1 ring-white/[0.05] hover:bg-white/[0.06]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{opt.label}</span>
                  {isCurrent && <Check className="size-3.5 text-accent" />}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-fg-dim">
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger ring-1 ring-danger/30">
            {error}
          </div>
        )}

        {config?.updatedAt && (
          <div className="mt-3 text-[11px] text-fg-dim">
            Dernière modif :{" "}
            {new Date(config.updatedAt).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </div>
        )}
      </motion.section>

      {/* Aperçu palettes des 2 thèmes */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
      >
        <h3 className="mb-3 font-display text-base text-fg-primary">Palettes disponibles</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.values(SEASONAL_THEMES).map((theme) => (
            <div
              key={theme.id}
              className="rounded-xl bg-bg-base/40 p-4 ring-1 ring-white/[0.04]"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg-primary">
                <span className="text-base">{theme.emoji}</span>
                {theme.label}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="size-9 rounded-lg ring-1 ring-white/10"
                  style={{ background: theme.accent }}
                  title={`Accent : ${theme.accent}`}
                />
                <div
                  className="size-9 rounded-lg ring-1 ring-white/10"
                  style={{ background: theme.accentSecondary }}
                  title={`Secondaire : ${theme.accentSecondary}`}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
