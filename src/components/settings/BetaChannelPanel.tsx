import { motion } from "framer-motion";
import { TestTube } from "lucide-react";
import { useSettingsStore } from "@/store/settings";
import { sounds } from "@/lib/sounds";

/**
 * Toggle simple pour activer le canal beta des modules. Quand activé,
 * le user voit aussi les modules `prereleaseChannel: "beta"` pour
 * lesquels il est dans la whitelist `prereleaseTesterUids` côté admin
 * Firestore. Les admins du launcher voient tous les beta sans
 * activer ce toggle.
 */
export function BetaChannelPanel() {
  const enabled = useSettingsStore((s) => s.enableBetaChannel);
  const toggle = useSettingsStore((s) => s.toggleBetaChannel);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
    >
      <div className="grid size-10 place-items-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
        <TestTube className="size-5" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-fg-primary">Canal beta</div>
        <p className="text-xs text-fg-muted">
          Active pour voir les modules en pré-release que l'admin t'a invité
          à tester. Sans, tu ne vois que les modules stable.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => {
          toggle();
          sounds.click();
        }}
        className={
          "relative h-6 w-11 shrink-0 rounded-full transition " +
          (enabled
            ? "bg-amber-500"
            : "bg-white/[0.1] ring-1 ring-white/[0.06]")
        }
      >
        <span
          className={
            "absolute top-0.5 size-5 rounded-full bg-white transition-transform " +
            (enabled ? "translate-x-5" : "translate-x-0.5")
          }
        />
      </button>
    </motion.section>
  );
}
