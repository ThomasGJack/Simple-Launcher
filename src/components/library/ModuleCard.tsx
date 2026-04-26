import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Download, RefreshCw, Gamepad2, Trash2, AlertTriangle, Folder } from "lucide-react";
import {
  deriveStatus,
  getModuleState,
  installOrUpdate,
  launchModule,
  subscribeProgress,
  uninstallModule,
  type ModuleProgress,
  type ModuleStateLocal,
  type DerivedStatus,
} from "@/lib/modules";
import type { LauncherModule } from "@/types/module";
import { useUIStore } from "@/store/ui";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { MinecraftStatusBadge } from "@/components/library/MinecraftStatusBadge";

type Action =
  | { kind: "idle" }
  | { kind: "installing"; progress?: ModuleProgress }
  | { kind: "launching" }
  | { kind: "error"; message: string };

export function ModuleCard({ module, index }: { module: LauncherModule; index: number }) {
  const navigate = useUIStore((s) => s.navigate);
  const [local, setLocal] = useState<ModuleStateLocal | null>(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [action, setAction] = useState<Action>({ kind: "idle" });
  const cleanupRef = useRef<(() => void) | null>(null);

  const openDetail = () => navigate({ name: "module", moduleId: module.id });

  useEffect(() => {
    if (module.type === "shortcut") {
      setStateLoaded(true);
      return;
    }
    let cancelled = false;
    getModuleState(module.id)
      .then((s) => {
        if (!cancelled) {
          setLocal(s);
          setStateLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setStateLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [module.id, module.type]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const status: DerivedStatus = deriveStatus(module, local);

  const handlePrimary = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (action.kind === "installing" || action.kind === "launching") return;

    if (status.kind === "shortcut" || status.kind === "installed") {
      setAction({ kind: "launching" });
      sounds.launch();
      try {
        await launchModule(module);
      } catch (err) {
        sounds.error();
        setAction({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        return;
      }
      setTimeout(() => setAction({ kind: "idle" }), 1200);
      return;
    }

    if (module.type === "hosted") {
      setAction({ kind: "installing" });
      const unlistenPromise = subscribeProgress(module.id, (progress) => {
        setAction({ kind: "installing", progress });
      });
      cleanupRef.current = () => {
        unlistenPromise.then((u) => u()).catch(() => {});
      };
      try {
        await installOrUpdate(module);
        const fresh = await getModuleState(module.id);
        setLocal(fresh);
        setAction({ kind: "idle" });
        sounds.success();
      } catch (err) {
        sounds.error();
        setAction({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        cleanupRef.current?.();
        cleanupRef.current = null;
      }
    }
  };

  const handleUninstall = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (module.type !== "hosted") return;
    if (!confirm(`Désinstaller "${module.name}" ? Le jeu sera supprimé du disque.`)) return;
    try {
      await uninstallModule(module.id);
      setLocal(null);
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      whileHover={{ y: -6 }}
      onClick={openDetail}
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl glass cursor-pointer"
    >
      {module.bannerUrl ? (
        <img
          src={module.bannerUrl}
          alt={module.name}
          className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-fuchsia-500/20" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent" />

      {!module.bannerUrl && (
        <div className="absolute inset-0 grid place-items-center text-fg-dim">
          <Gamepad2 className="size-12" strokeWidth={1.5} />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <div className="flex flex-wrap items-start gap-1.5">
          <StatusBadge module={module} status={status} loaded={stateLoaded} action={action} />
          {module.server?.type === "minecraft" && (
            <MinecraftStatusBadge address={module.server.address} compact />
          )}
        </div>
        {module.type === "hosted" && status.kind !== "not-installed" && action.kind === "idle" && (
          <button
            onClick={handleUninstall}
            className="rounded-md bg-bg-base/60 p-1.5 text-fg-dim opacity-0 backdrop-blur-md transition-all hover:text-danger group-hover:opacity-100"
            title="Désinstaller"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        {module.iconUrl && (
          <img src={module.iconUrl} alt="" className="mb-2 size-10 rounded-lg ring-1 ring-white/10" />
        )}
        <div className="text-base font-semibold text-fg-primary line-clamp-1">{module.name}</div>
        {module.shortDescription && (
          <p className="mt-0.5 text-xs text-fg-muted line-clamp-2">{module.shortDescription}</p>
        )}

        <div className="mt-3">
          {action.kind === "installing" ? (
            <ProgressBar progress={action.progress} />
          ) : action.kind === "error" ? (
            <ErrorBanner message={action.message} onDismiss={() => setAction({ kind: "idle" })} />
          ) : (
            <PrimaryButton status={status} action={action} onClick={handlePrimary} />
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04] transition-all duration-300 group-hover:ring-accent/30 group-hover:shadow-[inset_0_0_30px_var(--color-accent-soft)]" />
    </motion.div>
  );
}

function StatusBadge({
  module,
  status,
  loaded,
  action,
}: {
  module: LauncherModule;
  status: DerivedStatus;
  loaded: boolean;
  action: Action;
}) {
  if (!loaded) return null;
  if (action.kind === "installing") {
    const phase = action.progress?.phase ?? "downloading";
    const label = phase === "extracting" ? "Extraction" : phase === "ready" ? "Prêt" : "Téléchargement";
    return <Pill color="accent" pulsing>{label}</Pill>;
  }
  if (action.kind === "launching") return <Pill color="accent">Lancement…</Pill>;

  switch (status.kind) {
    case "shortcut":
      return (
        <Pill color="fuchsia">
          <Folder className="size-3" /> Local
        </Pill>
      );
    case "not-installed":
      return <Pill color="muted">Non installé</Pill>;
    case "installed":
      return <Pill color="success">v{status.localVersion}</Pill>;
    case "update-available":
      return (
        <Pill color="amber">
          v{status.localVersion} → v{status.remoteVersion}
        </Pill>
      );
    default:
      return module.type === "hosted" ? <Pill color="muted">Inconnu</Pill> : null;
  }
}

function Pill({
  color,
  pulsing,
  children,
}: {
  color: "accent" | "fuchsia" | "muted" | "success" | "amber";
  pulsing?: boolean;
  children: React.ReactNode;
}) {
  const map = {
    accent: "bg-accent/15 text-accent ring-accent/30",
    fuchsia: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
    muted: "bg-white/[0.05] text-fg-muted ring-white/[0.08]",
    success: "bg-success/15 text-success ring-success/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1 backdrop-blur-md",
        map[color],
        pulsing && "animate-pulse",
      )}
    >
      {children}
    </span>
  );
}

function PrimaryButton({
  status,
  action,
  onClick,
}: {
  status: DerivedStatus;
  action: Action;
  onClick: () => void;
}) {
  const launching = action.kind === "launching";
  let label = "Jouer";
  let Icon = Play;
  let glow = true;

  switch (status.kind) {
    case "not-installed":
      label = "Installer";
      Icon = Download;
      break;
    case "update-available":
      label = "Mettre à jour";
      Icon = RefreshCw;
      break;
    case "installed":
    case "shortcut":
      label = launching ? "Lancement…" : "Jouer";
      Icon = Play;
      break;
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={launching}
      className={cn(
        "no-drag flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
        glow
          ? "bg-accent text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]"
          : "bg-white/[0.06] text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.1]",
        "disabled:opacity-60",
      )}
    >
      <Icon className="size-4" strokeWidth={2.5} />
      {label}
    </motion.button>
  );
}

function ProgressBar({ progress }: { progress?: ModuleProgress }) {
  const phase = progress?.phase ?? "downloading";
  const total = progress?.bytesTotal ?? 0;
  const done = progress?.bytesDownloaded ?? 0;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : phase === "extracting" ? 100 : 5;

  return (
    <div className="rounded-xl bg-bg-base/80 p-2.5 ring-1 ring-white/[0.06]">
      <div className="mb-1.5 flex justify-between text-[10px] uppercase tracking-wider">
        <span className="text-accent">
          {phase === "extracting" ? "Extraction…" : phase === "ready" ? "Prêt" : "Téléchargement"}
        </span>
        <span className="text-fg-muted">
          {total > 0 ? `${(done / 1_048_576).toFixed(1)}/${(total / 1_048_576).toFixed(1)} Mo` : "…"}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full bg-accent shadow-[0_0_12px_var(--color-accent-glow)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      className="flex w-full items-start gap-2 rounded-xl bg-danger/10 p-2.5 text-left text-xs text-fg-primary ring-1 ring-danger/30"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" strokeWidth={2.5} />
      <span className="line-clamp-2">{message}</span>
    </button>
  );
}
