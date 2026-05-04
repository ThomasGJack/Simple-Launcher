import { motion, AnimatePresence } from "framer-motion";
import { Folder, Gem, X } from "lucide-react";
import { sounds } from "@/lib/sounds";

/**
 * Step 1 of the "Ajouter un jeu" flow — pick which kind of entry the
 * user wants to create. Two cards :
 *
 *  - **Raccourci** : an arbitrary local .exe (existing path, reuses
 *    `ShortcutForm` once selected).
 *  - **Instance Minecraft** : a personal MC instance the user
 *    configures (version + loader + mods folder), launched via the
 *    same native chain as hosted MC modules but stored privately.
 */
export function AddGameTypePicker({
  open,
  onClose,
  onPickShortcut,
  onPickCustomMinecraft,
}: {
  open: boolean;
  onClose: () => void;
  onPickShortcut: () => void;
  onPickCustomMinecraft: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-bg-base/70 p-6 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="no-drag relative w-full max-w-2xl overflow-hidden rounded-3xl glass-strong p-7 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
            >
              <X className="size-5" />
            </button>

            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.25em] text-accent">Ajouter un jeu</p>
              <h2 className="mt-1 font-display text-2xl text-fg-primary">
                Choisis le type d'entrée
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Tu peux ajouter un raccourci vers un .exe local OU créer une instance
                Minecraft custom (version + loader + tes mods).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PickerCard
                icon={Folder}
                title="Raccourci"
                description="N'importe quel jeu / .exe déjà installé sur ton PC."
                accent="text-accent"
                ring="ring-accent/30"
                glow="hover:shadow-[0_0_28px_var(--color-accent-soft)]"
                onClick={() => {
                  sounds.click();
                  onPickShortcut();
                }}
              />
              <PickerCard
                icon={Gem}
                title="Instance Minecraft"
                description="Crée ton propre modpack : version + loader + mods perso."
                accent="text-emerald-300"
                ring="ring-emerald-500/30"
                glow="hover:shadow-[0_0_28px_rgba(16,185,129,0.35)]"
                onClick={() => {
                  sounds.click();
                  onPickCustomMinecraft();
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PickerCard({
  icon: Icon,
  title,
  description,
  accent,
  ring,
  glow,
  onClick,
}: {
  icon: typeof Folder;
  title: string;
  description: string;
  accent: string;
  ring: string;
  glow: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => sounds.hover()}
      className={`group relative flex flex-col gap-3 rounded-2xl bg-white/[0.02] p-5 text-left ring-1 transition-all hover:bg-white/[0.04] ${ring} ${glow}`}
    >
      <div
        className={`grid size-12 place-items-center rounded-xl bg-bg-base/40 ring-1 ${ring} ${accent}`}
      >
        <Icon className="size-6" strokeWidth={2} />
      </div>
      <div>
        <div className="text-base font-semibold text-fg-primary">{title}</div>
        <p className="mt-1 text-xs text-fg-muted leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
