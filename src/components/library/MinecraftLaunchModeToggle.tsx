import { motion } from "framer-motion";
import { Rocket, Package, Info } from "lucide-react";
import { useLaunchMode, type LaunchMode } from "@/lib/minecraft";
import type { MinecraftModule } from "@/types/module";
import { sounds } from "@/lib/sounds";

/**
 * Per-machine launch backend toggle for Minecraft modules. Only shown
 * for modules where the admin enabled `nativeMc: true` (Prism-only
 * modules don't have the native source data, so the toggle would have
 * nothing to flip to).
 *
 * Why the toggle exists: the native MC pipeline currently has a known
 * regression on certain AMD-iGPU laptops (world renders as colored
 * noise while HUD stays intact). Until that's fixed at the chain level,
 * we let users pick between:
 *
 * - **Prism** (default for now): launches via the bundled Prism
 *   backend. Slower boot but known to work on every GPU profile we've
 *   tested.
 * - **Natif**: launches via the in-house JVM-spawning chain. Faster
 *   boot, no Prism dependency. Currently broken on certain AMD iGPUs.
 *
 * The override is stored per-machine in localStorage (no Firestore
 * write, no impact on other players of the same modpack). When unset,
 * `getEffectiveLaunchMode()` returns "prism" as the temporary fallback.
 */
export function MinecraftLaunchModeToggle({ module }: { module: MinecraftModule }) {
  const { effective, adminDefault, setOverride } = useLaunchMode(module);

  // Don't bother showing the toggle when the admin didn't configure
  // a native source — there'd be nothing to switch TO.
  if (adminDefault !== "native") return null;

  const pick = (mode: LaunchMode) => {
    sounds.click();
    setOverride(mode);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="rounded-3xl glass p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-muted">
          <Rocket className="size-3" />
          Mode de lancement
        </h3>
        {effective !== adminDefault ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-amber-500/20">
            <span className="size-1.5 rounded-full bg-amber-300" />
            Override actif
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.06]">
            Défaut
          </span>
        )}
      </div>

      <p className="mb-4 text-xs leading-relaxed text-fg-muted">
        Choisis le moteur qui lance Minecraft. Par défaut on tape sur Prism
        (compatibilité maximale, marche sur tous les iGPU testés). Le mode
        Natif est plus rapide mais a une régression connue sur certains
        portables AMD (rendu en bruit coloré) — utile pour tester / debug
        si tu sais ce que tu fais.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => pick("prism")}
          className={
            "flex flex-col items-start gap-1.5 rounded-xl px-3 py-3 text-left transition-all " +
            (effective === "prism"
              ? "bg-accent/10 text-fg-primary ring-2 ring-accent shadow-[0_0_20px_var(--color-accent-soft)]"
              : "bg-white/[0.03] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.06] hover:text-fg-primary")
          }
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Package className="size-3.5" />
            Prism
          </span>
          <span className="text-[10px] leading-tight text-fg-dim">
            Compatibilité max
          </span>
        </button>

        <button
          type="button"
          onClick={() => pick("native")}
          className={
            "flex flex-col items-start gap-1.5 rounded-xl px-3 py-3 text-left transition-all " +
            (effective === "native"
              ? "bg-accent/10 text-fg-primary ring-2 ring-accent shadow-[0_0_20px_var(--color-accent-soft)]"
              : "bg-white/[0.03] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.06] hover:text-fg-primary")
          }
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Rocket className="size-3.5" />
            Natif
          </span>
          <span className="text-[10px] leading-tight text-fg-dim">
            Rapide · expérimental
          </span>
        </button>
      </div>

      {effective === "native" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-200/90 ring-1 ring-amber-500/15">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Mode natif activé. Si tu vois du bruit coloré sur le monde 3D
            (HUD intact), repasse sur Prism — c'est le bug iGPU AMD connu.
          </span>
        </div>
      )}
    </motion.div>
  );
}
