import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Download,
  RefreshCw,
  Folder,
  Sparkles,
  Gamepad2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { DemoModule, DemoModuleStatus } from "../data/mockModules";

/**
 * Recréation visuelle (pas fonctionnelle) du ModuleCard du launcher
 * pour la démo Library du site web. ~120 LOC. Reprend le rendu du
 * ModuleCard (banner, glass, pills, primary button) sans tirer les
 * 6 stores Zustand + Firebase + Tauri du composant launcher.
 *
 * Quand `cycleDemo` est true sur le module, la card boucle :
 *   not-installed (3s) → downloading (5s avec progress 0→100) →
 *   installed (3s) → not-installed
 * Démontre visuellement ce qui se passe quand on installe un module.
 */
export function ModuleCardDemo({
  module: mod,
  index = 0,
}: {
  module: DemoModule;
  index?: number;
}) {
  const [demoStatus, setDemoStatus] = useState<DemoModuleStatus>(mod.status);
  const [demoPct, setDemoPct] = useState(0);

  useEffect(() => {
    if (!mod.cycleDemo) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;

    function nextPhase() {
      if (cancelled) return;
      setDemoStatus("not-installed");
      setDemoPct(0);
      timer = setTimeout(() => {
        if (cancelled) return;
        setDemoStatus("downloading");
        let pct = 0;
        progressTimer = setInterval(() => {
          if (cancelled) return;
          pct += 4 + Math.random() * 6;
          if (pct >= 100) {
            pct = 100;
            if (progressTimer) clearInterval(progressTimer);
            setDemoPct(100);
            timer = setTimeout(() => {
              if (cancelled) return;
              setDemoStatus("installed");
              timer = setTimeout(() => {
                if (cancelled) return;
                nextPhase();
              }, 3000);
            }, 600);
          } else {
            setDemoPct(pct);
          }
        }, 280);
      }, 3000);
    }
    nextPhase();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (progressTimer) clearInterval(progressTimer);
    };
  }, [mod.cycleDemo]);

  const status = mod.cycleDemo ? demoStatus : mod.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: Math.min(index, 6) * 0.05, duration: 0.4 }}
      whileHover={{ y: -6 }}
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl glass"
    >
      {mod.bannerUrl ? (
        <img
          src={mod.bannerUrl}
          alt={mod.name}
          className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-fuchsia-500/20" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent" />

      {!mod.bannerUrl && (
        <div className="absolute inset-0 grid place-items-center text-fg-dim">
          <Gamepad2 className="size-12" strokeWidth={1.5} />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start gap-1.5 p-4">
        <SourceBadge source={mod.source} />
        <StatusBadge status={status} version={mod.version} remote={mod.remoteVersion} />
        {mod.tag && status !== "downloading" && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-bg-base/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.08] backdrop-blur-md">
            {mod.tag}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="text-base font-semibold text-fg-primary line-clamp-1">
          {mod.name}
        </div>
        {mod.shortDescription && (
          <p className="mt-0.5 text-xs text-fg-muted line-clamp-2">
            {mod.shortDescription}
          </p>
        )}
        <div className="mt-3">
          {status === "downloading" ? (
            <DemoProgressBar pct={mod.cycleDemo ? demoPct : 32} />
          ) : (
            <DemoPrimaryButton status={status} />
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04] transition-all duration-300 group-hover:ring-accent/30 group-hover:shadow-[inset_0_0_30px_var(--color-accent-soft)]" />
    </motion.div>
  );
}

function SourceBadge({ source }: { source: DemoModule["source"] }) {
  if (source === "shortcut") {
    return (
      <Pill color="fuchsia">
        <Folder className="size-3" /> Local
      </Pill>
    );
  }
  if (source === "custom-mc") {
    return (
      <Pill color="emerald">
        <Folder className="size-3" /> Mon MC
      </Pill>
    );
  }
  return (
    <Pill color="cyan">
      <Sparkles className="size-3" /> Officiel
    </Pill>
  );
}

function StatusBadge({
  status,
  version,
  remote,
}: {
  status: DemoModuleStatus;
  version?: string;
  remote?: string;
}) {
  switch (status) {
    case "downloading":
      return <Pill color="accent" pulsing>Téléchargement</Pill>;
    case "playing":
      return <Pill color="accent" pulsing>En jeu</Pill>;
    case "not-installed":
      return <Pill color="muted">Non installé</Pill>;
    case "installed":
      return <Pill color="success">{version ? `v${version}` : "Installé"}</Pill>;
    case "update-available":
      return (
        <Pill color="amber">
          v{version} → v{remote}
        </Pill>
      );
  }
}

function Pill({
  color,
  pulsing,
  children,
}: {
  color: "accent" | "fuchsia" | "muted" | "success" | "amber" | "emerald" | "cyan";
  pulsing?: boolean;
  children: React.ReactNode;
}) {
  const map = {
    accent: "bg-accent/15 text-accent ring-accent/30",
    fuchsia: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
    muted: "bg-white/[0.05] text-fg-muted ring-white/[0.08]",
    success: "bg-success/15 text-success ring-success/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
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

function DemoPrimaryButton({ status }: { status: DemoModuleStatus }) {
  let label = "Jouer";
  let Icon = Play;
  switch (status) {
    case "not-installed":
      label = "Installer";
      Icon = Download;
      break;
    case "update-available":
      label = "Mettre à jour";
      Icon = RefreshCw;
      break;
    case "playing":
      label = "En jeu…";
      Icon = Star;
      break;
  }
  return (
    <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)]">
      <Icon className="size-4" strokeWidth={2.5} />
      {label}
    </div>
  );
}

function DemoProgressBar({ pct }: { pct: number }) {
  return (
    <div className="rounded-xl bg-bg-base/80 p-2.5 ring-1 ring-white/[0.06]">
      <div className="mb-1.5 flex justify-between text-[10px] uppercase tracking-wider">
        <span className="text-accent">Téléchargement</span>
        <span className="text-fg-muted tabular-nums">{Math.round(pct)} %</span>
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
