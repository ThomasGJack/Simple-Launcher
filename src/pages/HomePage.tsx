import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Library, Gamepad2, Zap, Newspaper } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { PlayButton } from "@/components/ui/PlayButton";
import { watchModules } from "@/firebase/modules";
import { getModuleState, deriveStatus, type DerivedStatus } from "@/lib/modules";
import type { LauncherModule } from "@/types/module";
import { cn } from "@/lib/cn";

export function HomePage() {
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const [modules, setModules] = useState<LauncherModule[]>([]);
  const [installedCount, setInstalledCount] = useState<number>(0);

  useEffect(() => {
    return watchModules(setModules);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hosted = modules.filter((m) => m.type === "hosted");
    Promise.all(hosted.map((m) => getModuleState(m.id))).then((states) => {
      if (cancelled) return;
      const installed = states.filter(Boolean).length;
      setInstalledCount(installed + modules.filter((m) => m.type === "shortcut").length);
    });
    return () => {
      cancelled = true;
    };
  }, [modules]);

  const featured = modules.slice(0, 3);
  const firstName = (user?.displayName ?? "").split(" ")[0] || "joueur";

  return (
    <div className="relative h-full overflow-y-auto">
      <section className="relative px-12 pt-12 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-accent">
            <Sparkles className="size-3" />
            <span>Bienvenue, {firstName}</span>
          </div>

          <h1 className="font-display text-7xl leading-[0.95] text-fg-primary text-glow-accent">
            SIMPLE
            <br />
            LAUNCHER
          </h1>
          <p className="mt-6 max-w-xl text-lg text-fg-muted">
            Tous tes jeux et serveurs réunis dans une seule interface. Lance, mets à jour, partage avec tes amis.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <PlayButton label={modules.length > 0 ? "BIBLIOTHÈQUE" : "COMMENCER"} onClick={() => navigate({ name: "library" })} />
            {modules.length > 0 && (
              <button
                onClick={() => navigate({ name: "module", moduleId: modules[0].id })}
                className="no-drag rounded-2xl glass px-6 py-5 text-sm font-medium uppercase tracking-[0.18em] text-fg-primary transition-colors hover:bg-white/[0.08]"
              >
                Premier jeu
              </button>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
          className="mt-12 flex flex-wrap gap-3"
        >
          <Stat icon={Library} value={modules.length} label={`Jeu${modules.length > 1 ? "x" : ""} disponible${modules.length > 1 ? "s" : ""}`} />
          <Stat icon={Gamepad2} value={installedCount} label={`Installé${installedCount > 1 ? "s" : ""} chez toi`} />
        </motion.div>
      </section>

      {featured.length > 0 && (
        <section className="px-12 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-5 flex items-end justify-between"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-accent">À l'affiche</p>
              <h2 className="mt-1 font-display text-3xl text-fg-primary">Modules récents</h2>
            </div>
            <button
              onClick={() => navigate({ name: "library" })}
              className="no-drag rounded-lg bg-white/[0.04] px-4 py-2 text-xs font-medium text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
            >
              Tout voir →
            </button>
          </motion.div>

          <div className="grid grid-cols-3 gap-5">
            {featured.map((m, i) => (
              <FeaturedCard key={m.id} module={m} index={i} onClick={() => navigate({ name: "module", moduleId: m.id })} />
            ))}
          </div>
        </section>
      )}

      <section className="px-12 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-3 gap-4"
        >
          <FeatureCard
            icon={Newspaper}
            title="Auto-update"
            description="Le launcher se met à jour automatiquement à chaque démarrage."
          />
          <FeatureCard
            icon={Zap}
            title="Lancement instant"
            description="Un clic et c'est parti — exécutables locaux ou téléchargements cloud."
          />
          <FeatureCard
            icon={Sparkles}
            title="Pages custom"
            description="Chaque jeu a sa propre page stylée avec son thème et ses animations."
          />
        </motion.div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Library; value: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl glass px-4 py-3">
      <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div>
        <div className="font-display text-2xl text-fg-primary">{value}</div>
        <div className="text-xs text-fg-muted">{label}</div>
      </div>
    </div>
  );
}

function FeaturedCard({
  module,
  index,
  onClick,
}: {
  module: LauncherModule;
  index: number;
  onClick: () => void;
}) {
  const [status, setStatus] = useState<DerivedStatus | null>(null);

  useEffect(() => {
    if (module.type === "shortcut") {
      setStatus(deriveStatus(module, null));
      return;
    }
    let cancelled = false;
    getModuleState(module.id).then((s) => {
      if (!cancelled) setStatus(deriveStatus(module, s));
    });
    return () => {
      cancelled = true;
    };
  }, [module]);

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.08 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="no-drag group relative aspect-[16/9] overflow-hidden rounded-2xl glass text-left"
    >
      {module.bannerUrl ? (
        <img
          src={module.bannerUrl}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-bg-soft to-fuchsia-500/20" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="flex items-end gap-3">
          {module.iconUrl && <img src={module.iconUrl} alt="" className="size-10 rounded-lg ring-1 ring-white/10" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-fg-primary">{module.name}</div>
            <div className="text-xs text-fg-muted line-clamp-1">{module.shortDescription ?? "—"}</div>
          </div>
          <StatusChip status={status} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04] transition-all group-hover:ring-accent/30 group-hover:shadow-[inset_0_0_30px_var(--color-accent-soft)]" />
    </motion.button>
  );
}

function StatusChip({ status }: { status: DerivedStatus | null }) {
  if (!status) return null;
  const labels: Record<DerivedStatus["kind"], { text: string; cls: string }> = {
    shortcut: { text: "Local", cls: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30" },
    minecraft: { text: "Minecraft", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
    "not-installed": { text: "Installer", cls: "bg-white/[0.05] text-fg-muted ring-white/[0.08]" },
    installed: { text: "Prêt", cls: "bg-success/15 text-success ring-success/30" },
    "update-available": { text: "MAJ dispo", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  };
  const meta = labels[status.kind];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1",
        meta.cls,
      )}
    >
      {meta.text}
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="group relative overflow-hidden rounded-2xl glass p-6"
    >
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 transition-shadow group-hover:shadow-[0_0_24px_var(--color-accent-soft)]">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <h3 className="font-medium text-fg-primary">{title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
    </motion.div>
  );
}
