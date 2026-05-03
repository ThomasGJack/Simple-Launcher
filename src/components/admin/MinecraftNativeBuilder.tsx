import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box,
  Cog,
  Download,
  Loader2,
  Play,
  Sparkles,
  Terminal,
  AlertTriangle,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  mcVanillaListVersions,
  mcVanillaInstall,
  mcVanillaIsInstalled,
  onMcVanillaProgress,
  type ManifestVersion,
  type InstallProgress,
} from "@/lib/mcVanilla";
import {
  mcFabricListLoaderVersions,
  mcFabricInstall,
  type FabricLoaderVersion,
} from "@/lib/mcFabric";
import {
  mcForgeListVersions,
  mcForgeInstall,
  mcNeoforgeListVersions,
  mcNeoforgeInstall,
  type ForgeVersionEntry,
} from "@/lib/mcForge";
import {
  mcModrinthSearch,
  mcModrinthListVersions,
  mcModrinthInstall,
  pickPrimaryMrpack,
  type ModrinthProject,
  type ModrinthVersion,
} from "@/lib/mcModrinth";
import { mcZipInstall } from "@/lib/mcZip";
import {
  mcAuthList,
  type McAccount,
} from "@/lib/mcAuth";
import {
  mcNativeLaunch,
  onMcLaunchLog,
  type LaunchLogLine,
} from "@/lib/mcLaunch";
import { cn } from "@/lib/cn";
import { Search, Package } from "lucide-react";

/**
 * Admin-only test surface for the native Minecraft launcher (vanilla +
 * Fabric + Forge + NeoForge). Lets the dev:
 *   1. Pick a vanilla MC version from Mojang's manifest
 *   2. Pick a loader (none / Fabric / Forge / NeoForge) and version
 *   3. Hit "Installer" — runs the full DL pipeline (with progress)
 *   4. Pick a Microsoft account previously connected via Settings
 *   5. Hit "Lancer le jeu" to spawn the game
 *   6. Watch the live console output stream back from the spawned JVM
 *
 * This is intentionally a flat, dev-grade UI — once everything is
 * stable, the install + launch buttons get promoted into each
 * Minecraft module's detail page (Phase 8 of the plan).
 */

type LoaderKind = "vanilla" | "fabric" | "forge" | "neoforge";

const RELEASE_FILTER_LABELS: Record<string, string> = {
  release: "Releases",
  snapshot: "Snapshots",
  old_alpha: "Alpha",
  old_beta: "Beta",
};

export function MinecraftNativeBuilder() {
  // ─── Vanilla version picker ────────────────────────────────────
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [allVersions, setAllVersions] = useState<ManifestVersion[]>([]);
  const [versionFilter, setVersionFilter] = useState<string>("release");
  const [mcVersion, setMcVersion] = useState<string>("");

  // ─── Loader picker ─────────────────────────────────────────────
  const [loader, setLoader] = useState<LoaderKind>("vanilla");
  const [loaderVersion, setLoaderVersion] = useState<string>("");

  // Loader catalogues — fetched on demand when the user picks a loader.
  const [fabricVersions, setFabricVersions] = useState<FabricLoaderVersion[]>([]);
  const [forgeVersions, setForgeVersions] = useState<ForgeVersionEntry[]>([]);
  const [neoforgeVersions, setNeoforgeVersions] = useState<string[]>([]);
  const [loaderListLoading, setLoaderListLoading] = useState(false);

  // ─── Instance + account ────────────────────────────────────────
  const [instanceId, setInstanceId] = useState<string>(() => `dev-${Date.now()}`);
  const [accounts, setAccounts] = useState<McAccount[]>([]);
  const [selectedAccountUuid, setSelectedAccountUuid] = useState<string>("");

  // ─── Install + launch state ────────────────────────────────────
  const [installing, setInstalling] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [maxRamMb, setMaxRamMb] = useState<number>(2048);

  // ─── Live console for the launched game ────────────────────────
  const [logLines, setLogLines] = useState<LaunchLogLine[]>([]);
  const [showConsole, setShowConsole] = useState(false);

  // ─── Modpack section ────────────────────────────────────────────
  const [modpackTab, setModpackTab] = useState<"none" | "modrinth" | "zip">("none");
  // Modrinth
  const [modrinthQuery, setModrinthQuery] = useState("");
  const [modrinthSearching, setModrinthSearching] = useState(false);
  const [modrinthResults, setModrinthResults] = useState<ModrinthProject[]>([]);
  const [modrinthSelected, setModrinthSelected] = useState<ModrinthProject | null>(null);
  const [modrinthVersions, setModrinthVersions] = useState<ModrinthVersion[]>([]);
  const [modrinthVersionsLoading, setModrinthVersionsLoading] = useState(false);
  const [modrinthSelectedVersionId, setModrinthSelectedVersionId] = useState<string>("");
  // Custom ZIP
  const [zipUrl, setZipUrl] = useState("");

  // Boot: fetch vanilla manifest + accounts in parallel.
  useEffect(() => {
    let cancelled = false;
    setVersionsLoading(true);
    Promise.all([mcVanillaListVersions(), mcAuthList()])
      .then(([manifest, accs]) => {
        if (cancelled) return;
        setAllVersions(manifest.versions);
        setAccounts(accs);
        if (accs[0]) setSelectedAccountUuid(accs[0].uuid);
        // Auto-pick the latest stable release.
        const latest = manifest.versions.find(
          (v) => v.id === manifest.latest.release,
        );
        if (latest) setMcVersion(latest.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to install + launch event streams once.
  useEffect(() => {
    const unsubProgress = onMcVanillaProgress((p) => setProgress(p));
    const unsubLog = onMcLaunchLog((line) => {
      setLogLines((prev) => [...prev, line].slice(-500));
    });
    return () => {
      unsubProgress.then((u) => u()).catch(() => {});
      unsubLog.then((u) => u()).catch(() => {});
    };
  }, []);

  // Fetch loader versions when the user picks a loader.
  useEffect(() => {
    setLoaderVersion("");
    if (loader === "vanilla") return;
    setLoaderListLoading(true);
    const fetcher = async () => {
      try {
        if (loader === "fabric") {
          if (!mcVersion) return;
          const list = await mcFabricListLoaderVersions(mcVersion);
          setFabricVersions(list);
          if (list[0]) setLoaderVersion(list[0].version);
        } else if (loader === "forge") {
          const list = await mcForgeListVersions();
          setForgeVersions(list);
          // Auto-pick the recommended for this MC if available.
          const match = list.find(
            (e) => e.mcVersion === mcVersion && e.channel === "recommended",
          );
          if (match) setLoaderVersion(match.loaderVersion);
        } else if (loader === "neoforge") {
          const list = await mcNeoforgeListVersions();
          setNeoforgeVersions(list);
          // Auto-pick the most recent NeoForge for the currently
          // selected MC version. Falls through to nothing if no match.
          const parts = mcVersion.split(".");
          const start = parts[0] === "1" ? 1 : 0;
          const slice = parts.slice(start, start + 2);
          const prefix = slice.length > 0 ? slice.join(".") + "." : "";
          const match = prefix ? list.find((v) => v.startsWith(prefix)) : list[0];
          if (match) setLoaderVersion(match);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoaderListLoading(false);
      }
    };
    void fetcher();
  }, [loader, mcVersion]);

  // Cheap "is installed" check whenever the user picks a vanilla version.
  useEffect(() => {
    if (!mcVersion) {
      setInstalled(null);
      return;
    }
    let cancelled = false;
    mcVanillaIsInstalled(mcVersion)
      .then((b) => !cancelled && setInstalled(b))
      .catch(() => !cancelled && setInstalled(null));
    return () => {
      cancelled = true;
    };
  }, [mcVersion]);

  // Filtered vanilla versions for the picker.
  const filteredVersions = useMemo(() => {
    return allVersions.filter((v) => v.kind === versionFilter);
  }, [allVersions, versionFilter]);

  // Forge versions filtered to the selected MC.
  const forgeVersionsForMc = useMemo(
    () => forgeVersions.filter((v) => v.mcVersion === mcVersion),
    [forgeVersions, mcVersion],
  );

  /**
   * NeoForge versions filtered to the selected MC. NeoForge encodes the
   * target MC version in its own version string by stripping the leading
   * `1.` and dropping the patch:
   *   MC `1.20.1`  → NeoForge versions starting with `20.1.`
   *   MC `1.21.5`  → NeoForge versions starting with `21.5.`
   *   MC `26.1.2`  → NeoForge versions starting with `26.1.` (post-Jan
   *                  2026 calver — leading "1." absent so we don't strip it)
   */
  const neoforgePrefix = useMemo(() => {
    const parts = mcVersion.split(".");
    const start = parts[0] === "1" ? 1 : 0;
    const slice = parts.slice(start, start + 2);
    if (slice.length === 0) return "";
    return slice.join(".") + ".";
  }, [mcVersion]);
  const neoforgeVersionsForMc = useMemo(() => {
    if (!neoforgePrefix) return neoforgeVersions;
    return neoforgeVersions.filter((v) => v.startsWith(neoforgePrefix));
  }, [neoforgeVersions, neoforgePrefix]);

  const handleInstall = async () => {
    if (!mcVersion) return;
    setError(null);
    setInstalling(true);
    setProgress(null);
    try {
      switch (loader) {
        case "vanilla":
          await mcVanillaInstall(mcVersion, instanceId);
          break;
        case "fabric":
          if (!loaderVersion) throw new Error("Choisis une version Fabric.");
          await mcFabricInstall(mcVersion, loaderVersion, instanceId);
          break;
        case "forge":
          if (!loaderVersion) throw new Error("Choisis une version Forge.");
          await mcForgeInstall(mcVersion, loaderVersion, instanceId);
          break;
        case "neoforge":
          if (!loaderVersion) throw new Error("Choisis une version NeoForge.");
          await mcNeoforgeInstall(mcVersion, loaderVersion, instanceId);
          break;
      }
      // Optional: install a modpack on top of the loader.
      if (modpackTab === "modrinth" && modrinthSelected && modrinthSelectedVersionId) {
        const version = modrinthVersions.find((v) => v.id === modrinthSelectedVersionId);
        const file = version ? pickPrimaryMrpack(version) : null;
        if (!file) throw new Error("Aucun fichier .mrpack trouvé sur cette version Modrinth.");
        await mcModrinthInstall(file.url, instanceId);
      } else if (modpackTab === "zip" && zipUrl.trim()) {
        await mcZipInstall(zipUrl.trim(), instanceId);
      }
      setInstalled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  const runModrinthSearch = async () => {
    setModrinthSearching(true);
    setError(null);
    try {
      const results = await mcModrinthSearch(modrinthQuery);
      setModrinthResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setModrinthSearching(false);
    }
  };

  // Auto-load versions when a Modrinth project is selected.
  useEffect(() => {
    if (!modrinthSelected) {
      setModrinthVersions([]);
      setModrinthSelectedVersionId("");
      return;
    }
    let cancelled = false;
    setModrinthVersionsLoading(true);
    mcModrinthListVersions(modrinthSelected.projectId)
      .then((vs) => {
        if (cancelled) return;
        setModrinthVersions(vs);
        // Auto-pick the latest stable release.
        const stable = vs.find((v) => v.versionType === "release") ?? vs[0];
        if (stable) setModrinthSelectedVersionId(stable.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setModrinthVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modrinthSelected]);

  const handleLaunch = async () => {
    if (!mcVersion || !selectedAccountUuid) return;
    setError(null);
    setLaunching(true);
    setLogLines([]);
    setShowConsole(true);
    try {
      await mcNativeLaunch({
        instanceId,
        mcVersion,
        loader,
        loaderVersion: loader === "vanilla" ? undefined : loaderVersion || undefined,
        accountUuid: selectedAccountUuid,
        maxRamMb: maxRamMb,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setShowConsole(false);
    } finally {
      setLaunching(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="rounded-2xl ring-1 ring-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
        <div className="flex items-start gap-2">
          <Sparkles className="size-4 shrink-0 mt-0.5 text-amber-300" />
          <div>
            <p className="font-medium text-amber-100">Mode dev — launcher Minecraft natif</p>
            <p className="mt-0.5 text-amber-200/70">
              Surface de test pour la chaîne d'install + launch sans Prism.
              Choisis une version + un loader + un compte connecté, installe
              les fichiers, puis lance le jeu. La console live remonte en bas.
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl bg-danger/10 p-4 text-sm text-danger ring-1 ring-danger/30"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 break-words font-mono text-xs">
                {error}
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-danger/70 hover:text-danger"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 1: vanilla version */}
      <Section icon={Box} title="1. Version Minecraft" subtitle="Vanilla — toujours nécessaire">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
            className="rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none disabled:opacity-50"
          >
            {Object.entries(RELEASE_FILTER_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={mcVersion}
            onChange={(e) => setMcVersion(e.target.value)}
            disabled={versionsLoading}
            className="rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none disabled:opacity-50 flex-1 min-w-[180px]"
          >
            {versionsLoading && <option>Chargement…</option>}
            {filteredVersions.slice(0, 200).map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
              </option>
            ))}
          </select>
          {installed === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-emerald-400/30">
              <Check className="size-3" /> Installée
            </span>
          )}
        </div>
      </Section>

      {/* Step 2: loader */}
      <Section icon={Cog} title="2. Loader de mods" subtitle="Optionnel — laisse « Aucun » pour du vanilla pur">
        <div className="flex flex-wrap gap-2">
          {(["vanilla", "fabric", "forge", "neoforge"] as LoaderKind[]).map((kind) => {
            const label =
              kind === "vanilla"
                ? "Aucun"
                : kind === "neoforge"
                  ? "NeoForge"
                  : kind.charAt(0).toUpperCase() + kind.slice(1);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setLoader(kind)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium ring-1 transition-colors",
                  loader === kind
                    ? "bg-accent/20 text-accent ring-accent/40"
                    : "bg-bg-elevated/40 text-fg-muted ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {loader !== "vanilla" && (
          <div className="mt-3">
            <select
              value={loaderVersion}
              onChange={(e) => setLoaderVersion(e.target.value)}
              disabled={loaderListLoading}
              className="rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none disabled:opacity-50 w-full"
            >
              {loaderListLoading && <option>Chargement des versions…</option>}
              {!loaderListLoading && loader === "fabric" &&
                fabricVersions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version} {v.stable ? "(stable)" : ""}
                  </option>
                ))}
              {!loaderListLoading && loader === "forge" &&
                forgeVersionsForMc.map((v) => (
                  <option key={`${v.loaderVersion}-${v.channel}`} value={v.loaderVersion}>
                    {v.loaderVersion} ({v.channel})
                  </option>
                ))}
              {!loaderListLoading && loader === "forge" && forgeVersionsForMc.length === 0 && (
                <option value="">Aucune Forge pour {mcVersion}</option>
              )}
              {!loaderListLoading && loader === "neoforge" &&
                neoforgeVersionsForMc.slice(0, 80).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              {!loaderListLoading && loader === "neoforge" && neoforgeVersionsForMc.length === 0 && (
                <option value="">Aucune NeoForge pour MC {mcVersion}</option>
              )}
            </select>
          </div>
        )}
      </Section>

      {/* Step 3: instance + account + ram */}
      <Section icon={Terminal} title="3. Instance + compte + RAM" subtitle="Identifiant local + compte qui lance + heap">

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-fg-muted">Instance ID</span>
            <input
              type="text"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              className="rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none mt-1.5 w-full"
              placeholder="dev-..."
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-fg-muted">Compte Minecraft</span>
            <select
              value={selectedAccountUuid}
              onChange={(e) => setSelectedAccountUuid(e.target.value)}
              className="rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none disabled:opacity-50 mt-1.5 w-full"
            >
              {accounts.length === 0 && <option value="">Aucun compte connecté</option>}
              {accounts.map((acc) => (
                <option key={acc.uuid} value={acc.uuid}>
                  {acc.playerName} ({acc.uuid.slice(0, 8)}…)
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-fg-muted">
              RAM (MiB) — {maxRamMb} MiB
            </span>
            <input
              type="range"
              min="1024"
              max="16384"
              step="512"
              value={maxRamMb}
              onChange={(e) => setMaxRamMb(parseInt(e.target.value, 10))}
              className="mt-3 w-full accent-accent"
            />
          </label>
        </div>
      </Section>

      {/* Step 3.5: optional modpack on top of vanilla+loader */}
      <Section icon={Package} title="4. Modpack (optionnel)" subtitle="Au-dessus du loader choisi">
        <div className="flex flex-wrap gap-2">
          {(["none", "modrinth", "zip"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setModpackTab(tab)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium ring-1 transition-colors",
                modpackTab === tab
                  ? "bg-accent/20 text-accent ring-accent/40"
                  : "bg-bg-elevated/40 text-fg-muted ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary",
              )}
            >
              {tab === "none" ? "Aucun" : tab === "modrinth" ? "Modrinth" : "ZIP custom"}
            </button>
          ))}
        </div>

        {/* ─── Modrinth tab ─────────────────────────────────── */}
        {modpackTab === "modrinth" && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={modrinthQuery}
                onChange={(e) => setModrinthQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runModrinthSearch();
                }}
                placeholder="Cherche un modpack (e.g. « Adrenaline », « Better Minecraft »)…"
                className="flex-1 rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={runModrinthSearch}
                disabled={modrinthSearching}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent/15 px-4 py-2 text-sm text-accent ring-1 ring-accent/30 hover:bg-accent/25 disabled:opacity-50"
              >
                {modrinthSearching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Rechercher
              </button>
            </div>

            {/* Results grid */}
            {modrinthResults.length > 0 && !modrinthSelected && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {modrinthResults.map((p) => (
                  <button
                    key={p.projectId}
                    type="button"
                    onClick={() => setModrinthSelected(p)}
                    className="flex gap-3 rounded-xl bg-bg-elevated/40 p-3 text-left ring-1 ring-white/[0.06] hover:bg-bg-elevated/70 hover:ring-accent/40"
                  >
                    {p.iconUrl ? (
                      <img
                        src={p.iconUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-white/[0.06]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
                        <Package className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg-primary">{p.title}</div>
                      <div className="line-clamp-2 text-xs text-fg-muted">{p.description}</div>
                      <div className="mt-1 text-[10px] text-fg-dim">
                        {p.downloads.toLocaleString()} DL · {p.loaders.join(", ")}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected modpack — pick a version */}
            {modrinthSelected && (
              <div className="rounded-xl bg-bg-elevated/40 p-4 ring-1 ring-accent/30">
                <div className="flex items-start gap-3">
                  {modrinthSelected.iconUrl && (
                    <img
                      src={modrinthSelected.iconUrl}
                      alt=""
                      className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-white/[0.06]"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-fg-primary">
                      {modrinthSelected.title}
                    </div>
                    <div className="text-xs text-fg-muted">{modrinthSelected.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModrinthSelected(null)}
                    className="text-xs text-fg-muted hover:text-fg-primary"
                  >
                    Changer
                  </button>
                </div>
                <div className="mt-3">
                  <label className="text-xs uppercase tracking-wider text-fg-muted">
                    Version du pack
                  </label>
                  <select
                    value={modrinthSelectedVersionId}
                    onChange={(e) => setModrinthSelectedVersionId(e.target.value)}
                    disabled={modrinthVersionsLoading}
                    className="mt-1.5 w-full rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none disabled:opacity-50"
                  >
                    {modrinthVersionsLoading && <option>Chargement…</option>}
                    {modrinthVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.versionNumber} ({v.versionType}) — MC {v.gameVersions.join(", ")} ·{" "}
                        {v.loaders.join(", ")}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-amber-300/80">
                    💡 La MC version + le loader que tu as choisis plus haut seront <strong>écrasés</strong>{" "}
                    par ce que demande le pack (Modrinth donne ses propres dépendances dans le manifest).
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── ZIP custom tab ───────────────────────────────── */}
        {modpackTab === "zip" && (
          <div className="mt-4 space-y-2">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-fg-muted">URL du ZIP</span>
              <input
                type="text"
                value={zipUrl}
                onChange={(e) => setZipUrl(e.target.value)}
                placeholder="https://exemple.com/mon-modpack.zip"
                className="mt-1.5 w-full rounded-xl bg-bg-base/60 px-3 py-2 text-sm font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-accent/50 focus:outline-none"
              />
            </label>
            <p className="text-[11px] text-fg-muted">
              Le ZIP doit contenir un layout style <code className="rounded bg-bg-elevated px-1">.minecraft/</code>{" "}
              (mods/, config/, resourcepacks/, …). MC version + loader choisis plus haut sont utilisés tels quels.
            </p>
          </div>
        )}
      </Section>

      {/* Step 5: actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing || !mcVersion || (loader !== "vanilla" && !loaderVersion)}
          className={cn(
            "no-drag inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-colors",
            "bg-accent/15 text-accent ring-1 ring-accent/30",
            "hover:bg-accent/25 hover:shadow-[0_0_18px_var(--color-accent-soft)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {installing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Installation…
            </>
          ) : (
            <>
              <Download className="size-4" />
              Installer
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleLaunch}
          disabled={launching || !mcVersion || !selectedAccountUuid}
          className={cn(
            "no-drag inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-colors",
            "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30",
            "hover:bg-emerald-400/25 hover:shadow-[0_0_18px_rgba(74,222,128,0.3)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {launching ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Lancement…
            </>
          ) : (
            <>
              <Play className="size-4" />
              Lancer le jeu
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowConsole((v) => !v)}
          className="no-drag inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium ring-1 ring-white/[0.06] text-fg-muted hover:text-fg-primary hover:bg-white/[0.04]"
        >
          <Terminal className="size-4" />
          Console ({logLines.length})
        </button>
      </div>

      {/* Progress */}
      <AnimatePresence>
        {progress && installing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl bg-bg-base/40 ring-1 ring-white/[0.06] p-4"
          >
            <div className="flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0 flex-1">
                <div className="text-fg-primary truncate">{progress.message}</div>
                <div className="text-xs text-fg-muted">
                  {progress.phase} · {progress.current} / {progress.total}
                </div>
              </div>
              <RefreshCw className="size-4 animate-spin text-accent" />
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width:
                    progress.total > 0
                      ? `${Math.min(100, (progress.current / progress.total) * 100)}%`
                      : "0%",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Console */}
      <AnimatePresence>
        {showConsole && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl ring-1 ring-white/[0.06] bg-bg-base/60"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-accent">
                <Terminal className="size-3" /> Console Minecraft
              </div>
              <button
                type="button"
                onClick={() => setLogLines([])}
                className="text-xs text-fg-muted hover:text-fg-primary"
              >
                Vider
              </button>
            </div>
            <div className="info-scroll max-h-96 overflow-auto bg-bg-base/40 p-3 font-mono text-[11px] leading-relaxed">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Box;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-bg-soft/40 ring-1 ring-white/[0.06] p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
          <Icon className="size-4" strokeWidth={2} />
        </div>
        <div>
          <div className="font-medium text-fg-primary">{title}</div>
          {subtitle && <div className="text-xs text-fg-muted">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
