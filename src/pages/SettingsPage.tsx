import { motion } from "framer-motion";
import { Cog, Palette, Volume2, FolderDown } from "lucide-react";

export function SettingsPage() {
  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Paramètres</p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Configuration</h1>
      </motion.div>

      <div className="grid max-w-3xl gap-4">
        <SettingCard
          icon={Palette}
          title="Apparence"
          description="Thème global, couleurs d'accent, animations."
          status="Bientôt"
        />
        <SettingCard
          icon={Volume2}
          title="Sons & musique"
          description="Sons d'interface, volume, musique d'ambiance."
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
