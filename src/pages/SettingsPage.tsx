import { motion } from "framer-motion";
import { Cog, Palette, Volume2, VolumeX, FolderDown } from "lucide-react";
import { useSettingsStore } from "@/store/settings";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

export function SettingsPage() {
  const { soundsEnabled, toggleSounds } = useSettingsStore();

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Paramètres</p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Configuration</h1>
      </motion.div>

      <div className="grid max-w-3xl gap-4">
        <SettingToggle
          icon={soundsEnabled ? Volume2 : VolumeX}
          title="Sons d'interface"
          description="Petits effets audio sur les boutons, hover, lancement et notifications."
          value={soundsEnabled}
          onToggle={() => {
            toggleSounds();
            if (!soundsEnabled) {
              setTimeout(() => sounds.success(), 60);
            }
          }}
        />
        <SettingCard
          icon={Palette}
          title="Apparence"
          description="Thème global, couleurs d'accent, animations."
          status="Bientôt"
        />
        <SettingCard
          icon={FolderDown}
          title="Téléchargements"
          description="Dossier d'installation des jeux, limite de bande passante."
          status="Bientôt"
        />
        <SettingCard icon={Cog} title="Avancé" description="Cache, logs, version du launcher." status="Bientôt" />
      </div>
    </div>
  );
}

function SettingToggle({
  icon: Icon,
  title,
  description,
  value,
  onToggle,
}: {
  icon: typeof Cog;
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="no-drag flex items-center gap-4 rounded-2xl glass p-5"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-fg-primary">{title}</div>
        <div className="text-sm text-fg-muted">{description}</div>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={value}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ring-1",
          value ? "bg-accent/30 ring-accent/40 shadow-[0_0_18px_var(--color-accent-soft)]" : "bg-white/[0.06] ring-white/[0.08]",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "absolute top-0.5 size-6 rounded-full",
            value ? "left-[calc(100%-1.625rem)] bg-accent shadow-[0_0_10px_var(--color-accent-glow)]" : "left-0.5 bg-fg-muted",
          )}
        />
      </button>
    </motion.div>
  );
}

function SettingCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof Cog;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="no-drag flex items-center gap-4 rounded-2xl glass p-5"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-fg-primary">{title}</div>
        <div className="text-sm text-fg-muted">{description}</div>
      </div>
      {status && (
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-fg-muted ring-1 ring-white/[0.06]">
          {status}
        </span>
      )}
    </motion.div>
  );
}
