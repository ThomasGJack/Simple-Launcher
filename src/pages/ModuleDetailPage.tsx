import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Download, RefreshCw, Trash2, Folder, Loader2, AlertTriangle, Star, CheckCircle2, KeyRound, Archive } from "lucide-react";
import { MinecraftBackupsModal } from "@/components/library/MinecraftBackupsModal";
import { CrashReportModal } from "@/components/library/CrashReportModal";

/** Parses the "exit" line emitted by `mc_launch.rs` :
 *    "exit code: Some(0)"      → 0
 *    "exit code: Some(-1)"     → -1
 *    "exit code: None"         → null  (treated as crash)
 *    "wait failed: <error>"    → null  (treated as crash)
 *  Returns null on unparseable input — caller treats null as non-zero. */
function parseExitCode(line: string): number | null {
  const m = /Some\((-?\d+)\)/.exec(line);
  if (m) return parseInt(m[1], 10);
  return null;
}
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useFavoritesStore } from "@/store/favorites";
import { addFavorite, removeFavorite } from "@/firebase/favorites";
import { useModules } from "@/store/firebaseStores";
import { watchUserShortcuts } from "@/firebase/shortcuts";
import { watchUserCustomMinecraft } from "@/firebase/customMinecraft";
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
import { ModuleParticles } from "@/components/ui/Particles";
import { ModuleSections } from "@/components/library/ModuleSections";
import { BlockRenderer } from "@/components/module-blocks/BlockRenderer";
import { migrateModulePage } from "@/lib/modulePageMigration";
import { isModulePageV2 } from "@/types/module";
import { loadFontFace } from "@/lib/dynamicFont";
import { MinecraftRamControl } from "@/components/library/MinecraftRamControl";
import { MinecraftServerCard } from "@/components/library/MinecraftServerCard";
import { RconConsoleModal } from "@/components/admin/RconConsole";
import { isAdmin } from "@/lib/admin";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

type Action =
  | { kind: "idle" }
  | { kind: "installing"; progress?: ModuleProgress }
  | { kind: "launching" }
  | { kind: "error"; message: string };

export function ModuleDetailPage() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const hosted = useModules();
  const [shortcuts, setShortcuts] = useState<LauncherModule[]>([]);
  const [customMc, setCustomMc] = useState<LauncherModule[]>([]);
  const allModules = [...customMc, ...shortcuts, ...hosted];
  const [local, setLocal] = useState<ModuleStateLocal | null>(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [action, setAction] = useState<Action>({ kind: "idle" });
  const cleanupRef = useRef<(() => void) | null>(null);

  const moduleId = route.name === "module" ? route.moduleId : null;
  const module = allModules.find((m) => m.id === moduleId);

  useEffect(() => {
    if (!user) return;
    return watchUserShortcuts(user.uid, setShortcuts);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return watchUserCustomMinecraft(user.uid, setCustomMc);
  }, [user]);

  useEffect(() => {
    if (!module) return;
    if (
      module.type === "shortcut" ||
      module.type === "minecraft" ||
      module.type === "custom-minecraft"
    ) {
      setStateLoaded(true);
      setLocal(null);
      return;
    }
    let cancelled = false;
    getModuleState(module.id).then((s) => {
      if (!cancelled) {
        setLocal(s);
        setStateLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [module]);

  useEffect(() => () => cleanupRef.current?.(), []);

  const pageThemeFontDisplay = module?.page?.theme?.fontDisplay;
  const pageThemeFontDisplayUrl = isModulePageV2(module?.page) ? module?.page?.theme?.fontDisplayUrl : undefined;
  useEffect(() => {
    if (pageThemeFontDisplay && pageThemeFontDisplayUrl) {
      void loadFontFace(pageThemeFontDisplay, pageThemeFontDisplayUrl);
    }
  }, [pageThemeFontDisplay, pageThemeFontDisplayUrl]);

  if (!moduleId) {
    return null;
  }

  if (allModules.length === 0) {
    return (
      <div className="grid h-full place-items-center text-fg-dim">
        <Loader2 className="size-8 animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="rounded-2xl glass p-8 text-center">
          <p className="font-display text-xl text-fg-primary">Module introuvable</p>
          <p className="mt-2 text-sm text-fg-muted">Il a peut-être été supprimé.</p>
          <button
            onClick={() => navigate({ name: "library" })}
            className="mt-4 rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-fg-primary transition-colors hover:bg-white/[0.1]"
          >
            Retour à la bibliothèque
          </button>
        </div>
      </div>
    );
  }

  const status: DerivedStatus = deriveStatus(module, local);
  const usingV2Page = isModulePageV2(module.page);
  const migratedPage = usingV2Page ? migrateModulePage(module.page, module) : null;
  const themePrimary = module.page?.theme?.primary;
  const themeAccent = module.page?.theme?.accent;
  const fontDisplay = module.page?.theme?.fontDisplay;
  const heroIsBlock = migratedPage?.blocks[0]?.type === "hero-parallax";

  const handlePrimary = async () => {
    if (action.kind === "installing" || action.kind === "launching") return;
    if (status.kind === "shortcut" || status.kind === "installed") {
      setAction({ kind: "launching" });
      sounds.launch();
      try {
        await launchModule(module);
      } catch (e) {
        sounds.error();
        setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      setTimeout(() => setAction({ kind: "idle" }), 1400);
      return;
    }

    if (module.type === "hosted") {
      setAction({ kind: "installing" });
      const unlistenPromise = subscribeProgress(module.id, (progress) => {
        setAction({ kind: "installing", progress });
      });
      cleanupRef.current = () => unlistenPromise.then((u) => u()).catch(() => {});
      try {
        await installOrUpdate(module);
        const fresh = await getModuleState(module.id);
        setLocal(fresh);
        setAction({ kind: "idle" });
        sounds.success();
      } catch (e) {
        sounds.error();
        setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        cleanupRef.current?.();
        cleanupRef.current = null;
      }
    }
  };

  const handleUninstall = async () => {
    if (module.type !== "hosted") return;
    if (!confirm(`Désinstaller "${module.name}" ?`)) return;
    try {
      await uninstallModule(module.id);
      setLocal(null);
    } catch (e) {
      setAction({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const themeStyle: React.CSSProperties & Record<string, string | undefined> = {
    ...(themePrimary && { "--module-primary": themePrimary }),
    ...(themeAccent && { "--module-accent": themeAccent }),
    ...(fontDisplay && { "--module-font-display": fontDisplay }),
  };

  return (
    <div
      className="relative h-full overflow-y-auto"
      style={themeStyle}
    >
      {heroIsBlock && migratedPage ? (
        <BlockRenderer
          blocks={[migratedPage.blocks[0]]}
          module={module}
          onLaunch={handlePrimary}
        />
      ) : (
        <Hero module={module} themePrimary={themePrimary} fontDisplay={fontDisplay} />
      )}

      {module.page?.background && "particles" in module.page.background && (
        <ModuleParticles config={module.page.background.particles} />
      )}

      <button
        onClick={() => navigate({ name: "library" })}
        className="no-drag absolute left-6 top-6 z-30 inline-flex items-center gap-1.5 rounded-lg bg-bg-base/60 px-3 py-2 text-xs font-medium text-fg-primary backdrop-blur-md ring-1 ring-white/[0.08] transition-colors hover:bg-bg-base/80"
      >
        <ArrowLeft className="size-3.5" /> Bibliothèque
      </button>

      <FavoriteToggle moduleId={module.id} />


      <div className="relative z-20 -mt-32 px-12 pb-12">
        <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-3xl glass-strong p-7"
            >
              <div className="flex items-end gap-5">
                {module.iconUrl ? (
                  <img
                    src={module.iconUrl}
                    alt=""
                    className="size-24 shrink-0 rounded-2xl object-cover ring-2 ring-white/10 shadow-2xl"
                  />
                ) : (
                  <div className="grid size-24 shrink-0 place-items-center rounded-2xl bg-accent/20 ring-2 ring-accent/30 shadow-2xl">
                    <Folder className="size-10 text-accent" strokeWidth={1.5} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <StatusBadge module={module} status={status} loaded={stateLoaded} action={action} />
                  </div>
                  <h2
                    className="font-display text-3xl text-fg-primary line-clamp-2"
                    style={fontDisplay ? { fontFamily: fontDisplay } : undefined}
                  >
                    {module.name}
                  </h2>
                </div>
              </div>

              {module.shortDescription && (
                <p className="mt-6 leading-relaxed text-fg-muted">{module.shortDescription}</p>
              )}

              <div className="mt-6">
                {module.type === "minecraft" || module.type === "custom-minecraft" ? (
                  <MinecraftActionPanel module={module} themePrimary={themePrimary} />
                ) : action.kind === "installing" ? (
                  <ProgressDetailed progress={action.progress} />
                ) : action.kind === "error" ? (
                  <ErrorBanner message={action.message} onDismiss={() => setAction({ kind: "idle" })} />
                ) : (
                  <PrimaryButton
                    status={status}
                    action={action}
                    onClick={handlePrimary}
                    themePrimary={themePrimary}
                    customLabel={module.page?.playButton?.label}
                    sizeScale={isModulePageV2(module.page) ? module.page.playButton?.sizeScale : undefined}
                    style={module.page?.playButton?.style}
                  />
                )}
              </div>

              {module.type === "hosted" && local && action.kind === "idle" && (
                <button
                  onClick={handleUninstall}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-danger/10 hover:text-danger hover:ring-danger/30"
                >
                  <Trash2 className="size-3" /> Désinstaller
                </button>
              )}
            </motion.div>

            {migratedPage && migratedPage.blocks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6"
              >
                <BlockRenderer
                  blocks={heroIsBlock ? migratedPage.blocks.slice(1) : migratedPage.blocks}
                  module={module}
                  onLaunch={handlePrimary}
                />
              </motion.div>
            )}
          </div>

          <div className="col-span-12 space-y-6 lg:col-span-5">
            {module.server?.type === "minecraft" && (
              <>
                <MinecraftServerCard
                  address={module.server.address}
                  module={module.type === "minecraft" ? module : undefined}
                />
                {isAdmin(user) && (
                  <RconAdminLauncher
                    address={module.server.address}
                    serverDisplayName={module.name}
                  />
                )}
              </>
            )}
            {module.type === "minecraft" && <MinecraftRamControl module={module} />}
          </div>
        </div>

        {(!migratedPage || migratedPage.blocks.length === 0) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10"
          >
            <ModuleSections module={module} />
          </motion.div>
        )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny admin-only entry point that exposes the RCON console modal — splits
 * the host:port from the configured server address (defaulting port to
 * 25575 when the launch port is the standard 25565 game port). Hidden for
 * non-admin users.
 */
function RconAdminLauncher({
  address,
  serverDisplayName,
}: {
  address: string;
  serverDisplayName: string;
}) {
  const [open, setOpen] = useState(false);
  // Strip any trailing :port from the launcher's saved address — RCON has
  // its own port (default 25575) configured server-side via server.properties.
  const host = address.split(":")[0] ?? address;
  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={() => setOpen(true)}
        className="no-drag inline-flex w-full items-center gap-2 rounded-2xl bg-violet-500/10 px-4 py-3 text-xs font-medium text-violet-200 ring-1 ring-violet-500/30 transition-colors hover:bg-violet-500/20 hover:shadow-[0_0_18px_rgba(139,92,246,0.3)]"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/30">
          ⌘
        </span>
        <span className="flex-1 text-left">
          <span className="block">Console RCON admin</span>
          <span className="text-[10px] text-fg-dim">Contrôler le serveur Minecraft</span>
        </span>
      </motion.button>
      <RconConsoleModal
        open={open}
        onClose={() => setOpen(false)}
        serverHost={host}
        serverDisplayName={serverDisplayName}
      />
    </>
  );
}

function Hero({
  module,
  themePrimary,
  fontDisplay,
}: {
  module: LauncherModule;
  themePrimary?: string;
  fontDisplay?: string;
}) {
  const banner = module.bannerUrl ?? module.iconUrl;
  return (
    <div className="relative h-[420px] w-full overflow-hidden">
      {banner ? (
        <motion.img
          initial={{ scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          src={banner}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/40 via-bg-base to-fuchsia-500/20" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-bg-base/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg-base/70 via-transparent to-transparent" />

      {themePrimary && (
        <div
          className="absolute inset-0 mix-blend-soft-light opacity-50"
          style={{
            background: `radial-gradient(ellipse at 30% 70%, ${themePrimary}80, transparent 60%)`,
          }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-32 left-12 max-w-2xl"
      >
        <h1
          className="font-display text-6xl leading-[0.95] text-fg-primary text-glow-accent"
          style={fontDisplay ? { fontFamily: fontDisplay } : undefined}
        >
          {module.name}
        </h1>
      </motion.div>
    </div>
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
  if (!loaded) return <Pill color="muted">…</Pill>;
  if (action.kind === "installing") {
    const phase = action.progress?.phase ?? "downloading";
    return <Pill color="accent" pulsing>{phase === "extracting" ? "Extraction" : "Téléchargement"}</Pill>;
  }
  if (action.kind === "launching") return <Pill color="accent">Lancement…</Pill>;

  switch (status.kind) {
    case "shortcut":
      return <Pill color="fuchsia">Raccourci local</Pill>;
    case "minecraft":
      return <Pill color="emerald">Modpack Minecraft</Pill>;
    case "not-installed":
      return <Pill color="muted">Non installé</Pill>;
    case "installed":
      return <Pill color="success">v{status.localVersion}</Pill>;
    case "update-available":
      return <Pill color="amber">v{status.localVersion} → v{status.remoteVersion}</Pill>;
    default:
      return module.type === "hosted" ? <Pill color="muted">Inconnu</Pill> : null;
  }
}

function Pill({
  color,
  pulsing,
  children,
}: {
  color: "accent" | "fuchsia" | "muted" | "success" | "amber" | "emerald";
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
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1",
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
  themePrimary,
  customLabel,
  sizeScale,
  style,
}: {
  status: DerivedStatus;
  action: Action;
  onClick: () => void;
  themePrimary?: string;
  customLabel?: string;
  sizeScale?: number;
  style?: "neon-pulse" | "solid" | "outline" | "ghost";
}) {
  const launching = action.kind === "launching";
  let label = customLabel ?? "JOUER";
  let Icon = Play;

  switch (status.kind) {
    case "not-installed":
      label = "INSTALLER";
      Icon = Download;
      break;
    case "update-available":
      label = "METTRE À JOUR";
      Icon = RefreshCw;
      break;
    case "installed":
    case "shortcut":
      label = launching ? "LANCEMENT…" : (customLabel ?? "JOUER");
      Icon = Play;
      break;
  }
  const scale = sizeScale ?? 1;
  void style;

  const bg = themePrimary
    ? `linear-gradient(90deg, ${themePrimary}, ${themePrimary}dd, ${themePrimary})`
    : undefined;
  const shadow = themePrimary ? `0 0 32px ${themePrimary}80` : undefined;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={launching}
      className={cn(
        "no-drag group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl px-12 py-4 font-display text-xl tracking-[0.18em] text-bg-base",
        "shadow-[0_0_32px_var(--color-accent-glow)] ring-1 ring-white/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
      style={
        themePrimary
          ? { background: bg, boxShadow: shadow, transform: scale !== 1 ? `scale(${scale})` : undefined }
          : {
              background: "linear-gradient(90deg, var(--color-accent), #4ed6ff, var(--color-accent))",
              backgroundSize: "200% 100%",
              animation: "shimmer 4s linear infinite, glow-pulse 2.4s ease-in-out infinite",
              transform: scale !== 1 ? `scale(${scale})` : undefined,
            }
      }
    >
      <Icon className="size-5 fill-bg-base" strokeWidth={0} />
      <span>{label}</span>
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:translate-x-full transition-transform duration-700" />
    </motion.button>
  );
}

function ProgressDetailed({ progress }: { progress?: ModuleProgress }) {
  const phase = progress?.phase ?? "downloading";
  const total = progress?.bytesTotal ?? 0;
  const done = progress?.bytesDownloaded ?? 0;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : phase === "extracting" ? 100 : 5;

  return (
    <div className="rounded-2xl bg-bg-base/80 p-4 ring-1 ring-white/[0.06]">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-fg-primary">
          {phase === "extracting" ? "Extraction des fichiers…" : "Téléchargement en cours…"}
        </span>
        <span className="text-xs text-fg-muted">
          {total > 0
            ? `${(done / 1_048_576).toFixed(1)} / ${(total / 1_048_576).toFixed(1)} Mo · ${pct.toFixed(0)}%`
            : "…"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full bg-accent shadow-[0_0_18px_var(--color-accent-glow)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        onClick={onDismiss}
        className="flex w-full items-start gap-3 rounded-xl bg-danger/10 p-3 text-left text-sm text-fg-primary ring-1 ring-danger/30"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={2.5} />
        <span>{message}</span>
      </motion.button>
    </AnimatePresence>
  );
}

/** Either flavour of Minecraft module — admin-published `MinecraftModule`
 *  or per-user `CustomMinecraftModule`. Both share the same launch
 *  contract (nativeMcVersion / nativeLoader / nativeLoaderVersion /
 *  maxRamMb), so the panel treats them uniformly. */
type AnyMinecraftModule =
  | import("@/types/module").MinecraftModule
  | import("@/types/module").CustomMinecraftModule;

function MinecraftActionPanel({
  module,
  themePrimary,
}: {
  module: AnyMinecraftModule;
  themePrimary?: string;
}) {
  // Single backend: the in-house native chain. Prism support was removed
  // in v26.05.03.8 — see CHANGELOG. `MinecraftActionPanel` is now a thin
  // wrapper that delegates to `NativeMinecraftActionPanel` for every
  // Minecraft module.
  return <NativeMinecraftActionPanel module={module} themePrimary={themePrimary} />;
}

/**
 * Action panel for Minecraft modules running on the native launch path
 * (`module.nativeMc === true`). Drives the full lifecycle:
 *   1. Pick a connected Microsoft account (from `mcAuthList`)
 *   2. Install button → vanilla + loader + optional modpack overlay
 *   3. Play button → spawn `javaw`, stream stdout/stderr to a drawer
 *
 * Does NOT touch Prism. Replaces `PrismMinecraftActionPanel` for any
 * module the admin flagged native via the AdminPage builder.
 */
function NativeMinecraftActionPanel({
  module,
}: {
  module: AnyMinecraftModule;
  themePrimary?: string;
}) {
  const navigate = useUIStore((s) => s.navigate);
  type Phase = "checking" | "ready-to-install" | "installing" | "ready" | "launching" | "running" | "error";
  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState<import("@/lib/mcVanilla").InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<import("@/lib/mcLaunch").LaunchLogLine[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  // Crash detection : when the launch's exit line carries a non-zero
  // code, we surface the CrashReportModal automatically. Stored as the
  // exit line itself so the modal can display the parsed exit code +
  // a snapshot of the console as it was at crash time.
  const [crashExit, setCrashExit] = useState<{ code: number | null; consoleAtCrash: string } | null>(null);
  const [accounts, setAccounts] = useState<import("@/lib/mcAuth").McAccount[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>("");
  // Runtime deps (Visual C++ redistributables) state. We populate
  // `missingDeps` before any MC launch. If non-empty, we surface a
  // modal that DLs+installs them; the launch is paused until the
  // modal resolves. Without this, a fresh Windows laptop will get
  // garbage 3D rendering because some mod natives need older VC++
  // runtimes (2012/2013) that aren't shipped via Windows Update.
  const [missingDeps, setMissingDeps] = useState<
    import("@/lib/mcRuntimeDeps").RuntimeDep[] | null
  >(null);
  const [depsInstalling, setDepsInstalling] = useState(false);
  const [depsProgress, setDepsProgress] = useState<
    import("@/lib/mcRuntimeDeps").RuntimeDepInstallProgress | null
  >(null);
  const [depsError, setDepsError] = useState<string | null>(null);

  // Boot: load accounts + check whether vanilla is already on disk.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("@/lib/mcAuth").then((m) => m.mcAuthList()),
      import("@/lib/mcVanilla").then((m) =>
        module.nativeMcVersion
          ? m.mcVanillaIsInstalled(module.nativeMcVersion)
          : Promise.resolve(false),
      ),
    ])
      .then(([accs, installed]) => {
        if (cancelled) return;
        setAccounts(accs);
        // Pick the user's saved default account if still available,
        // otherwise the first one returned by mcAuthList. Honours the
        // "Définir par défaut" choice from Settings.
        import("@/lib/mcAuth").then((m) => {
          if (cancelled) return;
          setSelectedUuid(m.pickDefaultUuid(accs));
        });
        setPhase(installed ? "ready" : "ready-to-install");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [module.id, module.nativeMcVersion]);

  // Subscribe to install + launch event streams (kept alive for the
  // life of the panel — events arrive whenever the user triggers an
  // action).
  useEffect(() => {
    let unsubProgress: undefined | (() => void);
    let unsubLog: undefined | (() => void);
    Promise.all([
      import("@/lib/mcVanilla").then((m) => m.onMcVanillaProgress((p) => setProgress(p))),
      import("@/lib/mcLaunch").then((m) =>
        m.onMcLaunchLog((line) => {
          if (line.instanceId !== module.id) return;
          setLogLines((prev) => {
            const next = [...prev, line].slice(-500);
            if (line.stream === "exit") {
              // Parse the exit code emitted by Rust ("exit code: Some(0)"
              // / "exit code: Some(-1)" / "wait failed: …"). Anything
              // not a clean 0 is treated as a crash and triggers the
              // CrashReportModal. The console snapshot is captured here
              // because the panel resets logLines on the next launch.
              const code = parseExitCode(line.line);
              if (code !== 0) {
                const consoleAtCrash = next
                  .map((l) => `[${l.stream}] ${l.line}`)
                  .join("\n");
                setCrashExit({ code, consoleAtCrash });
                sounds.error();
              }
            }
            return next;
          });
          if (line.stream === "exit") {
            setPhase("ready");
          }
        }),
      ),
    ]).then(([u1, u2]) => {
      unsubProgress = u1;
      unsubLog = u2;
    });
    return () => {
      unsubProgress?.();
      unsubLog?.();
    };
  }, [module.id]);

  const handleInstall = async () => {
    if (!module.nativeMcVersion) {
      setError("Version Minecraft non configurée pour ce module.");
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("installing");
    setProgress(null);
    sounds.click();
    try {
      const loader = module.nativeLoader ?? "vanilla";
      const loaderVersion = module.nativeLoaderVersion ?? "";
      // 1. vanilla + loader (delegated)
      if (loader === "vanilla") {
        const m = await import("@/lib/mcVanilla");
        await m.mcVanillaInstall(module.nativeMcVersion, module.id);
      } else if (loader === "fabric") {
        if (!loaderVersion) throw new Error("Version Fabric manquante.");
        const m = await import("@/lib/mcFabric");
        await m.mcFabricInstall(module.nativeMcVersion, loaderVersion, module.id);
      } else if (loader === "forge") {
        if (!loaderVersion) throw new Error("Version Forge manquante.");
        const m = await import("@/lib/mcForge");
        await m.mcForgeInstall(module.nativeMcVersion, loaderVersion, module.id);
      } else if (loader === "neoforge") {
        if (!loaderVersion) throw new Error("Version NeoForge manquante.");
        const m = await import("@/lib/mcForge");
        await m.mcNeoforgeInstall(module.nativeMcVersion, loaderVersion, module.id);
      }
      // 2. modpack overlay (optional)
      const pack = module.nativeModpack;
      if (pack && pack.kind === "modrinth") {
        const m = await import("@/lib/mcModrinth");
        await m.mcModrinthInstall(pack.mrpackUrl, module.id);
      } else if (pack && pack.kind === "zip") {
        const m = await import("@/lib/mcZip");
        await m.mcZipInstall(pack.zipUrl, module.id);
      }
      sounds.success();
      setPhase("ready");
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const handleLaunch = async () => {
    if (!module.nativeMcVersion || !selectedUuid) {
      setError(
        !selectedUuid
          ? "Connecte un compte Microsoft via Paramètres → Comptes Minecraft."
          : "Configuration native incomplète.",
      );
      return;
    }
    // Runtime deps gate. Before spawning Java, make sure the Windows
    // VC++ redistributables that LWJGL + various mod natives depend
    // on are present. Missing redists don't crash MC — they cause
    // garbage 3D rendering — so this gate is the only protection.
    try {
      const { checkRuntimeDeps } = await import("@/lib/mcRuntimeDeps");
      const missing = await checkRuntimeDeps();
      if (missing.length > 0) {
        setMissingDeps(missing);
        setDepsError(null);
        setDepsProgress(null);
        return; // The modal takes over. Launch resumes via the modal's "OK" button.
      }
    } catch (err) {
      // Non-fatal — if the check itself errors, we proceed with
      // launch. Worst case the user gets the visual bug they were
      // already about to get without the gate.
      console.warn("[mc-runtime-deps] check failed, proceeding with launch:", err);
    }
    setError(null);
    setLogLines([]);
    setShowConsole(true);
    setPhase("launching");
    sounds.launch();
    try {
      const m = await import("@/lib/mcLaunch");
      await m.mcNativeLaunch({
        instanceId: module.id,
        moduleName: module.name,
        mcVersion: module.nativeMcVersion,
        loader: module.nativeLoader ?? "vanilla",
        loaderVersion: module.nativeLoaderVersion || undefined,
        accountUuid: selectedUuid,
        maxRamMb: module.maxRamMb ?? 4096,
        // If the module has a Minecraft server registered, auto-join it
        // on launch — saves the player a click in the main menu.
        serverAddress:
          module.server?.type === "minecraft" ? module.server.address : undefined,
      });
      setPhase("running");
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  /** Triggered by the runtime-deps modal's "Installer" button.
   *  Streams progress events into `depsProgress`, then on success
   *  closes the modal + retriggers the launch. On failure (UAC
   *  refused, network error, etc.), keeps the modal open with an
   *  error so the user can retry or fall back to manual install. */
  const handleInstallRuntimeDeps = async () => {
    setDepsInstalling(true);
    setDepsError(null);
    let unsubscribe: undefined | (() => void);
    try {
      const { installRuntimeDeps, onRuntimeDepsProgress } = await import(
        "@/lib/mcRuntimeDeps"
      );
      unsubscribe = await onRuntimeDepsProgress((p) => setDepsProgress(p));
      await installRuntimeDeps();
      setMissingDeps(null);
      setDepsProgress(null);
      // Resume the launch the user originally triggered.
      void handleLaunch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDepsError(msg);
    } finally {
      setDepsInstalling(false);
      unsubscribe?.();
    }
  };

  if (phase === "checking") {
    return (
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 className="size-4 animate-spin" /> Vérification de l'instance native…
      </div>
    );
  }

  if (phase === "installing" && progress) {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    // Phases that report bytes-based progress need MB formatting; the
    // others count files/items so the raw integer is fine.
    const isByteCount = progress.phase === "zip-dl" || progress.phase === "modrinth-dl";
    const fmtUnit = (n: number) =>
      isByteCount ? `${(n / 1_048_576).toFixed(1)} Mo` : String(n);
    const phaseLabel: Record<string, string> = {
      "version-json": "Métadonnées MC",
      client: "Client Minecraft",
      libraries: "Bibliothèques",
      "asset-index": "Index des assets",
      assets: "Assets",
      "fabric-install": "Fabric",
      "forge-install": "Forge",
      "neoforge-install": "NeoForge",
      "zip-dl": "Téléchargement ZIP",
      "zip-extract": "Extraction ZIP",
      "modrinth-dl": "Téléchargement .mrpack",
      "modrinth-deps": "Dépendances Modrinth",
      "modrinth-mods": "Mods Modrinth",
      "modrinth-overrides": "Overrides Modrinth",
      done: "Terminé",
    };
    const label = phaseLabel[progress.phase] ?? progress.phase;
    return (
      <div className="space-y-3">
        <div className="text-sm text-fg-primary">{progress.message}</div>
        <div className="text-xs text-fg-muted">
          {label} · {fmtUnit(progress.current)} / {fmtUnit(progress.total)}
          {pct > 0 && ` · ${pct}%`}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {phase === "ready-to-install" || phase === "error" ? (
          <button
            type="button"
            onClick={handleInstall}
            disabled={!module.nativeMcVersion}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium",
              "bg-accent/15 text-accent ring-1 ring-accent/30",
              "hover:bg-accent/25 hover:shadow-[0_0_18px_var(--color-accent-soft)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Download className="size-4" />
            Installer
          </button>
        ) : null}
        {(phase === "ready" || phase === "running" || phase === "launching") && (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!selectedUuid || phase === "launching"}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium",
              "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30",
              "hover:bg-emerald-400/25 hover:shadow-[0_0_18px_rgba(74,222,128,0.3)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {phase === "launching" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Lancement…
              </>
            ) : (
              <>
                <Play className="size-4" /> Jouer
              </>
            )}
          </button>
        )}
        {phase === "ready" && (
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-2xl bg-bg-elevated/40 px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary"
          >
            Réinstaller
          </button>
        )}
        {(phase === "ready" || phase === "running") && (
          <button
            type="button"
            onClick={async () => {
              try {
                const m = await import("@/lib/mcVanilla");
                await m.mcNativeOpenInstanceDir(module.id);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
            title="Ouvre le dossier .minecraft/ pour ajouter resourcepacks, shaders, configs…"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-bg-elevated/40 px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary"
          >
            <Folder className="size-3.5" />
            Ouvrir le dossier
          </button>
        )}
        {(phase === "ready" || phase === "running") && (
          <button
            type="button"
            onClick={() => {
              sounds.click();
              setBackupsOpen(true);
            }}
            title="Snapshots des saves — auto avant chaque launch, restauration en 1 clic"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-bg-elevated/40 px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary"
          >
            <Archive className="size-3.5" />
            Backups
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowConsole((v) => !v)}
          className="rounded-2xl bg-bg-elevated/40 px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary"
        >
          Console ({logLines.length})
        </button>
      </div>

      {/* Account onboarding (when no MS account is connected yet) ─────
          Replaces the tiny inline "no account" hint with a proper card.
          Without a Microsoft account the launcher CAN'T launch MC at
          all — surface that loudly + give a one-click path to fix it
          rather than burying the explanation in a small line above the
          Lancer button (which would just throw a confusing error). */}
      {accounts.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
            <KeyRound className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-sm font-medium text-fg-primary">
              Compte Microsoft requis
            </div>
            <div className="text-xs leading-relaxed text-fg-muted">
              Pour lancer Minecraft tu dois connecter au moins un compte
              Microsoft (le même que celui que tu utilises pour Minecraft Java
              Edition). La fenêtre de connexion s'ouvre dans ton navigateur,
              tes identifiants ne transitent jamais par le launcher.
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  sounds.click();
                  navigate({ name: "settings" });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-medium text-bg-base shadow-[0_0_18px_rgba(251,191,36,0.35)] transition-shadow hover:shadow-[0_0_24px_rgba(251,191,36,0.5)]"
              >
                <KeyRound className="size-3.5" />
                Connecter mon compte
              </button>
              <span className="self-center text-[11px] text-fg-dim">
                Paramètres → Comptes Minecraft
              </span>
            </div>
          </div>
        </div>
      ) : (
        // Picker quand au moins un compte est connecté — montre lequel
        // va owner le prochain launch.
        <div className="flex items-center gap-2 text-xs">
          <span className="text-fg-muted">Compte :</span>
          <select
            value={selectedUuid}
            onChange={(e) => setSelectedUuid(e.target.value)}
            className="rounded-md bg-bg-base/60 px-2 py-1 text-xs text-fg-primary ring-1 ring-white/[0.08] focus:ring-emerald-400/50 focus:outline-none"
          >
            {accounts.map((a) => (
              <option key={a.uuid} value={a.uuid}>
                {a.playerName}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {showConsole && (
        <div className="rounded-2xl bg-bg-base/60 ring-1 ring-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
            <div className="text-xs uppercase tracking-wider text-accent">Console Minecraft</div>
            <button
              type="button"
              onClick={() => setLogLines([])}
              className="text-xs text-fg-muted hover:text-fg-primary"
            >
              Vider
            </button>
          </div>
          <div className="info-scroll max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
            {logLines.length === 0 ? (
              <div className="text-fg-dim italic">Pas encore de sortie. Lance le jeu pour voir le log.</div>
            ) : (
              logLines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    line.stream === "stderr" && "text-amber-300",
                    line.stream === "exit" && "text-fg-muted",
                    line.stream === "info" && "text-accent",
                  )}
                >
                  {line.line}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <MinecraftBackupsModal
        open={backupsOpen}
        onClose={() => setBackupsOpen(false)}
        instanceId={module.id}
      />

      <CrashReportModal
        open={crashExit !== null}
        onClose={() => setCrashExit(null)}
        module={module}
        exitCode={crashExit?.code ?? null}
        lastConsoleLines={crashExit?.consoleAtCrash ?? ""}
        onReinstall={() => {
          setCrashExit(null);
          handleInstall();
        }}
      />

      <RuntimeDepsModal
        missing={missingDeps}
        installing={depsInstalling}
        progress={depsProgress}
        error={depsError}
        onInstall={handleInstallRuntimeDeps}
        onCancel={() => {
          if (!depsInstalling) {
            setMissingDeps(null);
            setDepsError(null);
            setDepsProgress(null);
          }
        }}
      />
    </div>
  );
}

/**
 * One-shot modal that surfaces missing Visual C++ redistributables and
 * offers to download + install them silently. Shown right before the
 * first Minecraft launch on machines that don't have all the required
 * native runtimes (typical for fresh laptops where Windows Update
 * doesn't ship VC++ 2012 / 2013). Without this, MC renders garbage
 * 3D output because some mod natives load with unresolvable imports.
 *
 * UAC will prompt once per redist when the install kicks off — that's
 * normal, the redist installers themselves require admin to write
 * `System32`. Running them from our launcher just inherits whatever
 * elevation Windows grants per-process.
 */
function RuntimeDepsModal({
  missing,
  installing,
  progress,
  error,
  onInstall,
  onCancel,
}: {
  missing: import("@/lib/mcRuntimeDeps").RuntimeDep[] | null;
  installing: boolean;
  progress: import("@/lib/mcRuntimeDeps").RuntimeDepInstallProgress | null;
  error: string | null;
  onInstall: () => void;
  onCancel: () => void;
}) {
  if (!missing) return null;
  const totalBytesPretty = (n: number) => `${(n / 1_048_576).toFixed(1)} Mo`;
  const phaseLabel: Record<string, string> = {
    downloading: "Téléchargement",
    installing: "Installation (UAC peut s'afficher)",
    done: "Terminé",
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/80 backdrop-blur-sm p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !installing) onCancel();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="no-drag w-full max-w-2xl rounded-2xl bg-bg-soft p-6 ring-1 ring-amber-400/30 shadow-[0_0_60px_rgba(251,191,36,0.2)]"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-amber-300 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl text-fg-primary">
              Dépendances Microsoft manquantes
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              Minecraft + ses mods utilisent plusieurs versions du runtime
              Visual C++ Microsoft. Sans ces DLLs, certaines libs natives se
              chargent à moitié et MC affiche du bruit coloré au lieu du
              monde 3D. On va les installer pour toi (~30 Mo total).
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-bg-base/40 p-4 ring-1 ring-white/[0.06]">
          <div className="text-xs uppercase tracking-wider text-fg-muted mb-2">
            À installer ({missing.length})
          </div>
          <ul className="space-y-1.5 text-sm text-fg-primary">
            {missing.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                <span>{d.displayName}</span>
                <span className="text-fg-dim text-[11px] font-mono">{d.dll}</span>
              </li>
            ))}
          </ul>
        </div>

        {installing && progress && (
          <div className="mt-4 rounded-xl bg-emerald-400/[0.06] p-4 ring-1 ring-emerald-400/20">
            <div className="flex items-center gap-2 text-sm text-fg-primary">
              <Loader2 className="size-4 animate-spin text-emerald-300" />
              <span className="font-medium">
                {progress.currentLabel || "Préparation…"}
              </span>
              <span className="text-fg-dim text-xs ml-auto">
                {progress.currentIndex} / {progress.total}
              </span>
            </div>
            <div className="mt-2 text-xs text-fg-muted">
              {phaseLabel[progress.phase] ?? progress.phase}
              {progress.phase === "downloading" &&
                progress.bytesTotal > 0 &&
                ` · ${totalBytesPretty(progress.bytesDownloaded)} / ${totalBytesPretty(progress.bytesTotal)}`}
            </div>
            {progress.bytesTotal > 0 && progress.phase === "downloading" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{
                    width: `${Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger ring-1 ring-danger/30">
            <div className="font-medium mb-1">L'installation a échoué :</div>
            <pre className="whitespace-pre-wrap break-words font-mono">{error}</pre>
            <div className="mt-2 text-fg-muted">
              Tu peux installer les redists manuellement en ouvrant chaque URL :
              <ul className="ml-4 mt-1 list-disc space-y-1">
                {missing.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        const { openUrl } = await import("@tauri-apps/plugin-opener");
                        await openUrl(d.url);
                      }}
                      className="text-amber-300 underline hover:text-amber-200"
                    >
                      {d.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={installing}
            className="rounded-xl px-4 py-2 text-sm text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={onInstall}
            disabled={installing}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium",
              "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40",
              "hover:bg-amber-400/30",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {installing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Installation en cours…
              </>
            ) : (
              <>
                <Download className="size-4" /> Installer ({missing.length})
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FavoriteToggle({ moduleId }: { moduleId: string }) {
  const user = useAuthStore((s) => s.user);
  const isFav = useFavoritesStore((s) => s.favorites.has(moduleId));

  if (!user) return null;
  const toggle = async () => {
    sounds.click();
    try {
      if (isFav) await removeFavorite(user.uid, moduleId);
      else await addFavorite(user.uid, moduleId);
    } catch (err) {
      console.warn("[favorite] toggle failed:", err);
    }
  };

  return (
    <button
      onClick={toggle}
      className={cn(
        "no-drag absolute right-6 top-6 z-30 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium backdrop-blur-md transition-all",
        isFav
          ? "bg-amber-300/15 text-amber-300 ring-1 ring-amber-300/40 shadow-[0_0_20px_rgba(252,211,77,0.25)] hover:bg-amber-300/25"
          : "bg-bg-base/60 text-fg-primary ring-1 ring-white/[0.08] hover:bg-bg-base/80 hover:text-amber-300",
      )}
      title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
    >
      <Star className="size-3.5" fill={isFav ? "currentColor" : "none"} strokeWidth={2.2} />
      {isFav ? "Favori" : "Favoris"}
    </button>
  );
}

