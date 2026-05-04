import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  Hash,
  Image as ImageIcon,
  Link as LinkIcon,
  Trash2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Gamepad2,
  Palette,
  Sparkles,
  Server,
  Activity,
  BarChart3,
  Layout,
  TerminalSquare,
  Loader2,
  Plus,
  ExternalLink,
  GitBranch,
  HelpCircle,
  Users,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { NewsManager } from "@/components/admin/NewsManager";
import { CrewsManager } from "@/components/admin/CrewsManager";
import { LogsManager } from "@/components/admin/LogsManager";
import { AdminStatsPanel } from "@/components/admin/AdminStatsPanel";
import { UsersManager } from "@/components/admin/UsersManager";
import { isAdmin } from "@/lib/admin";
import {
  deleteHostedZip,
  deleteModule,
  rollbackModuleToVersion,
  saveMinecraftModule,
  updateHostedModuleMetadata,
  uploadHostedModule,
  uploadModpackZip,
  uploadModuleAsset,
  watchModuleVersions,
  type ModuleVersionRecord,
  type UploadProgress,
} from "@/firebase/modules";
import { useModules } from "@/store/firebaseStores";
import type { LauncherModule, ModulePage, ParticlesConfig, PageSection } from "@/types/module";
import { isModulePageV2 } from "@/types/module";
import { ModulePreviewCard } from "@/components/library/ModulePreviewCard";
import { RamSlider } from "@/components/library/RamSlider";
import { cn } from "@/lib/cn";

type ParticlesPreset = NonNullable<ParticlesConfig["preset"]> | "none";
type BgType = "none" | "image" | "video";
type ModuleType = "hosted" | "minecraft";
type ModLoader = "" | "forge" | "fabric" | "quilt" | "neoforge";
type FormState = {
  type: ModuleType;
  id: string;
  name: string;
  shortDescription: string;
  iconUrl: string;
  bannerUrl: string;
  version: string;
  executable: string;
  themePrimary: string;
  themeAccent: string;
  fontDisplay: string;
  particlesPreset: ParticlesPreset;
  particlesColor: string;
  particlesDensity: number;
  bgType: BgType;
  bgUrl: string;
  serverAddress: string;
  screenshots: string;
  stats: string;
  // Minecraft fields
  minecraftVersion: string;
  modLoader: ModLoader;
  /** Heap allocation in MiB. 0 = "let JVM pick" (defaults to 4 GiB
   *  in `mc_launch.rs`). */
  maxRamMb: number;
  // ─── Native MC config (sole launch path since v26.05.03.8) ────────
  /** Vanilla MC version pinned for the native install. */
  nativeMcVersion: string;
  /** Loader pick for the native install. */
  nativeLoader: "vanilla" | "fabric" | "forge" | "neoforge";
  /** Loader version (e.g. Fabric `0.16.0`, Forge `47.4.0`). */
  nativeLoaderVersion: string;
  /** Modpack overlay applied on top of vanilla + loader. */
  nativeModpackKind: "none" | "modrinth" | "zip";
  /** URL of the .mrpack (modrinth) or generic .zip pack. */
  nativeModpackUrl: string;
  /** Optional Modrinth project id for display. */
  nativeModrinthProjectId: string;
};

const EMPTY_FORM: FormState = {
  type: "hosted",
  id: "",
  name: "",
  shortDescription: "",
  iconUrl: "",
  bannerUrl: "",
  version: "1.0.0",
  executable: "",
  themePrimary: "",
  themeAccent: "",
  fontDisplay: "",
  particlesPreset: "none",
  particlesColor: "#00d4ff",
  particlesDensity: 60,
  bgType: "none",
  bgUrl: "",
  serverAddress: "",
  screenshots: "",
  stats: "",
  minecraftVersion: "",
  modLoader: "",
  maxRamMb: 4096,
  nativeMcVersion: "",
  nativeLoader: "vanilla",
  nativeLoaderVersion: "",
  nativeModpackKind: "none",
  nativeModpackUrl: "",
  nativeModrinthProjectId: "",
};

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<"modules" | "news" | "crews" | "users" | "logs" | "stats">("modules");
  const modules = useModules();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [modpackUploading, setModpackUploading] = useState<{ percent: number; uploaded: number; total: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isEditing = editingId !== null;

  if (!isAdmin(user)) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="max-w-md rounded-2xl glass p-8 text-center">
          <Shield className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
          <div className="font-display text-2xl text-fg-primary">Accès refusé</div>
          <p className="mt-2 text-sm text-fg-muted">
            Cette page est réservée aux administrateurs. Ton Discord ID n'est pas dans la liste.
          </p>
        </div>
      </div>
    );
  }

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const reset = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setProgress(null);
    setEditingId(null);
  };

  const startEdit = (m: LauncherModule) => {
    if (m.type === "shortcut" || m.type === "custom-minecraft") return; // user-side, never published
    const page = m.page;
    const v1Sections = page && !isModulePageV2(page) ? page.sections : undefined;
    const bg = page?.background && "particles" in page.background ? page.background.particles : undefined;
    const screenshotsSection = v1Sections?.find((s) => s.type === "screenshots-grid");
    const statsSection = v1Sections?.find((s) => s.type === "stats");

    setForm({
      type: m.type,
      id: m.id,
      name: m.name,
      shortDescription: m.shortDescription ?? "",
      iconUrl: m.iconUrl ?? "",
      bannerUrl: m.bannerUrl ?? "",
      version: m.type === "hosted" ? m.version : "1.0.0",
      executable: m.type === "hosted" ? m.executable : "",
      themePrimary: page?.theme?.primary ?? "",
      themeAccent: page?.theme?.accent ?? "",
      fontDisplay: page?.theme?.fontDisplay ?? "",
      particlesPreset: bg?.preset ?? "none",
      particlesColor: bg?.color ?? "#00d4ff",
      particlesDensity: bg?.density ?? 60,
      bgType:
        page?.background?.type === "video"
          ? "video"
          : page?.background?.type === "image"
            ? "image"
            : "none",
      bgUrl: page?.background && "url" in page.background ? page.background.url : "",
      serverAddress: m.server?.type === "minecraft" ? m.server.address : "",
      screenshots:
        screenshotsSection && screenshotsSection.type === "screenshots-grid"
          ? screenshotsSection.images.join("\n")
          : "",
      stats:
        statsSection && statsSection.type === "stats"
          ? statsSection.data.map((s) => `${s.label} = ${s.value}`).join("\n")
          : "",
      minecraftVersion: m.type === "minecraft" ? m.minecraftVersion ?? "" : "",
      modLoader: m.type === "minecraft" ? ((m.modLoader ?? "") as ModLoader) : "",
      maxRamMb: m.type === "minecraft" ? m.maxRamMb ?? 4096 : 4096,
      // Native MC config — sole launch path post-Prism removal.
      nativeMcVersion: m.type === "minecraft" ? m.nativeMcVersion ?? "" : "",
      nativeLoader:
        m.type === "minecraft" && m.nativeLoader ? m.nativeLoader : "vanilla",
      nativeLoaderVersion:
        m.type === "minecraft" ? m.nativeLoaderVersion ?? "" : "",
      nativeModpackKind:
        m.type === "minecraft" && m.nativeModpack
          ? m.nativeModpack.kind
          : "none",
      nativeModpackUrl:
        m.type === "minecraft" && m.nativeModpack
          ? m.nativeModpack.kind === "modrinth"
            ? m.nativeModpack.mrpackUrl
            : m.nativeModpack.kind === "zip"
              ? m.nativeModpack.zipUrl
              : ""
          : "",
      nativeModrinthProjectId:
        m.type === "minecraft" &&
        m.nativeModpack?.kind === "modrinth"
          ? m.nativeModpack.modrinthProjectId ?? ""
          : "",
    });
    setFile(null);
    setProgress(null);
    setEditingId(m.id);
    setFeedback(null);
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validate = (): string | null => {
    if (!form.id || !/^[a-z0-9-]+$/.test(form.id)) return "ID invalide (lowercase, chiffres, tirets uniquement)";
    if (!form.name) return "Nom obligatoire";
    if (form.type === "hosted") {
      // In create mode, the .zip is required. In edit mode, it's optional (only needed if you want to push a new version).
      if (!isEditing && !file) return "Fichier .zip obligatoire";
      if (!form.version || !/^\d+\.\d+\.\d+$/.test(form.version)) return "Version semver requise (ex: 1.0.0)";
      if (!form.executable) return "Nom de l'exécutable requis (ex: MyGame.exe)";
    } else if (form.type === "minecraft") {
      // Native chain is the sole supported launch path post v26.05.03.8.
      if (!form.nativeMcVersion) return "Version Minecraft requise (sélectionne-la dans le picker)";
      if (form.nativeLoader !== "vanilla" && !form.nativeLoaderVersion) {
        return `Version du loader ${form.nativeLoader} requise (ou choisis « Vanilla »)`;
      }
      // Modpack source is optional — "Aucun" is valid (= NeoForge /
      // Fabric / Forge sans modpack), useful pour un loader nu de test.
      if (form.nativeModpackKind !== "none" && !form.nativeModpackUrl) {
        return "URL du modpack requise (ou bascule sur « Aucun modpack » pour un loader nu)";
      }
    }
    return null;
  };

  const buildPage = (): ModulePage | undefined => {
    const theme: ModulePage["theme"] = {};
    if (form.themePrimary) theme.primary = form.themePrimary;
    if (form.themeAccent) theme.accent = form.themeAccent;
    if (form.fontDisplay) theme.fontDisplay = form.fontDisplay;

    let background: ModulePage["background"] | undefined;
    const particles =
      form.particlesPreset !== "none"
        ? {
            preset: form.particlesPreset,
            color: form.particlesColor,
            density: form.particlesDensity,
          }
        : undefined;

    if (form.bgType === "image" && form.bgUrl) {
      background = { type: "image", url: form.bgUrl, ...(particles && { particles }) };
    } else if (form.bgType === "video" && form.bgUrl) {
      background = { type: "video", url: form.bgUrl, ...(particles && { particles }) };
    } else if (particles) {
      background = { type: "image", url: form.bannerUrl || "", particles };
    }

    const sections: PageSection[] = [];
    const screenshotUrls = form.screenshots
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http"));
    if (screenshotUrls.length > 0) {
      sections.push({ type: "screenshots-grid", images: screenshotUrls });
    }
    const statsLines = form.stats
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="));
    const stats = statsLines.map((l) => {
      const [label, ...rest] = l.split("=");
      return { label: label.trim(), value: rest.join("=").trim() };
    });
    if (stats.length > 0) {
      sections.push({ type: "stats", data: stats });
    }

    const page: ModulePage = {};
    if (Object.keys(theme).length > 0) page.theme = theme;
    if (background) page.background = background;
    if (sections.length > 0) page.sections = sections;
    return Object.keys(page).length > 0 ? page : undefined;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setFeedback({ kind: "error", message: err });
      return;
    }
    setFeedback(null);
    setSubmitting(true);
    try {
      const page = buildPage();
      const server =
        form.serverAddress.trim().length > 0
          ? ({ type: "minecraft" as const, address: form.serverAddress.trim() })
          : undefined;

      if (form.type === "minecraft") {
        // Save covers both create and update — Firestore setDoc with merge.
        // Native chain is the sole supported launch path since v26.05.03.8.
        const nativeModpack =
          form.nativeModpackKind === "modrinth" && form.nativeModpackUrl
            ? {
                kind: "modrinth" as const,
                mrpackUrl: form.nativeModpackUrl,
                ...(form.nativeModrinthProjectId && {
                  modrinthProjectId: form.nativeModrinthProjectId,
                }),
              }
            : form.nativeModpackKind === "zip" && form.nativeModpackUrl
              ? { kind: "zip" as const, zipUrl: form.nativeModpackUrl }
              : { kind: "none" as const };
        await saveMinecraftModule({
          type: "minecraft",
          id: form.id,
          name: form.name,
          ...(form.shortDescription && { shortDescription: form.shortDescription }),
          ...(form.iconUrl && { iconUrl: form.iconUrl }),
          ...(form.bannerUrl && { bannerUrl: form.bannerUrl }),
          ...(form.minecraftVersion && { minecraftVersion: form.minecraftVersion }),
          ...(form.modLoader && { modLoader: form.modLoader }),
          ...(form.maxRamMb >= 512 && { maxRamMb: form.maxRamMb }),
          ...(form.nativeMcVersion && { nativeMcVersion: form.nativeMcVersion }),
          nativeLoader: form.nativeLoader,
          ...(form.nativeLoaderVersion && {
            nativeLoaderVersion: form.nativeLoaderVersion,
          }),
          nativeModpack,
          ...(page && { page }),
          ...(server && { server }),
        });
      } else if (isEditing && !file) {
        // Hosted module being edited without re-uploading the binary: just patch the metadata.
        await updateHostedModuleMetadata(form.id, {
          name: form.name,
          ...(form.shortDescription !== undefined && { shortDescription: form.shortDescription || undefined }),
          ...(form.iconUrl !== undefined && { iconUrl: form.iconUrl || undefined }),
          ...(form.bannerUrl !== undefined && { bannerUrl: form.bannerUrl || undefined }),
          ...(page && { page }),
          ...(server && { server }),
        });
      } else {
        // Create OR new version of an existing hosted module — full upload.
        await uploadHostedModule(
          {
            type: "hosted",
            id: form.id,
            name: form.name,
            ...(form.shortDescription && { shortDescription: form.shortDescription }),
            ...(form.iconUrl && { iconUrl: form.iconUrl }),
            ...(form.bannerUrl && { bannerUrl: form.bannerUrl }),
            version: form.version,
            executable: form.executable,
            ...(page && { page }),
            ...(server && { server }),
          },
          file!,
          setProgress,
        );
      }
      setFeedback({
        kind: "ok",
        message: isEditing ? `Module "${form.name}" mis à jour.` : `Module "${form.name}" publié.`,
      });
      reset();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFeedback({ kind: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (mod: LauncherModule) => {
    if (!confirm(`Supprimer le module "${mod.name}" ? Cette action est irréversible.`)) return;
    try {
      await deleteModule(mod.id);
      if (mod.type === "hosted") await deleteHostedZip(mod.id, mod.version);
      // Minecraft modules: wipe the per-instance .minecraft/ dir on the
      // local machine too. Best-effort — failures (e.g. file in use) are
      // ignored, the daily Cloud Function won't help here since this is
      // a local-only directory.
      if (mod.type === "minecraft") {
        try {
          const { mcNativeUninstallInstance } = await import("@/lib/mcVanilla");
          await mcNativeUninstallInstance(mod.id);
        } catch (err) {
          console.warn("[admin] native uninstall failed:", err);
        }
      }
      setFeedback({ kind: "ok", message: `Module "${mod.name}" supprimé.` });
    } catch (e) {
      setFeedback({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const uploadModpack = async (uploadedFile: File) => {
    if (!form.id) {
      setFeedback({ kind: "error", message: "Renseigne d'abord l'ID du module avant d'uploader le modpack." });
      return;
    }
    setFeedback(null);

    // Step 1: parse the manifest LOCALLY before uploading. fflate is
    // fast enough that even a 1 GB modpack only takes a couple of
    // seconds — saves us a re-download from Firebase/GitHub afterwards.
    // Failures here are non-fatal; we still upload and the admin can
    // fill MC version / loader manually.
    let detectedManifest: import("@/lib/mcZip").CurseforgeManifestSummary | null = null;
    try {
      const { readCfManifestFromFile } = await import("@/lib/mcZip");
      detectedManifest = await readCfManifestFromFile(uploadedFile);
      if (detectedManifest.mcVersion) updateForm("nativeMcVersion", detectedManifest.mcVersion);
      if (
        detectedManifest.loader &&
        ["vanilla", "fabric", "forge", "neoforge"].includes(detectedManifest.loader)
      ) {
        updateForm("nativeLoader", detectedManifest.loader as FormState["nativeLoader"]);
      }
      if (detectedManifest.loaderVersion)
        updateForm("nativeLoaderVersion", detectedManifest.loaderVersion);
    } catch (manifestErr) {
      console.warn("[admin] local CF manifest parse failed (non-fatal):", manifestErr);
    }

    // Step 2: upload to Firebase Storage + populate URL fields.
    setModpackUploading({ percent: 0, uploaded: 0, total: uploadedFile.size });
    try {
      const { url, size } = await uploadModpackZip(form.id, uploadedFile, (p) => {
        setModpackUploading({ percent: p.percent, uploaded: p.bytesUploaded, total: p.bytesTotal });
      });
      // Native chain consumes the uploaded ZIP via `nativeModpackUrl`.
      updateForm("nativeModpackUrl", url);
      if (detectedManifest && detectedManifest.name) {
        setFeedback({
          kind: "ok",
          message: `Modpack « ${detectedManifest.name} » uploadé (${(size / 1_048_576).toFixed(1)} Mo). MC ${detectedManifest.mcVersion ?? "?"} · ${detectedManifest.loader ?? "?"} ${detectedManifest.loaderVersion ?? ""} · ${detectedManifest.fileCount} mods.`,
        });
      } else {
        setFeedback({
          kind: "ok",
          message: `Modpack uploadé (${(size / 1_048_576).toFixed(1)} Mo).`,
        });
      }
    } catch (e) {
      setFeedback({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setModpackUploading(null);
    }
  };

  const uploadAsset = async (kind: "icon" | "banner", uploadedFile: File) => {
    if (!form.id) {
      setFeedback({ kind: "error", message: "Renseigne d'abord l'ID du module." });
      return;
    }
    const setter = kind === "icon" ? setIconUploading : setBannerUploading;
    setter(true);
    try {
      const url = await uploadModuleAsset(form.id, kind, uploadedFile);
      updateForm(kind === "icon" ? "iconUrl" : "bannerUrl", url);
    } catch (e) {
      setFeedback({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setter(false);
    }
  };

  // Tab metadata — single source of truth for the nav row + headings.
  const tabs = [
    {
      id: "modules" as const,
      label: "Modules",
      icon: Cloud,
      title: "Modules",
      description: "Crée, met à jour et supprime les jeux disponibles dans le launcher.",
    },
    {
      id: "news" as const,
      label: "News",
      icon: Sparkles,
      title: "News du launcher",
      description: "Annonces diffusées en temps réel sur l'accueil de tous les launchers.",
    },
    {
      id: "crews" as const,
      label: "Clans",
      icon: Shield,
      title: "Clans / Crews",
      description: "Mini-Discord textuel. Crée des clans et leurs salons.",
    },
    {
      id: "users" as const,
      label: "Utilisateurs",
      icon: Users,
      title: "Utilisateurs & tiers",
      description:
        "Liste de tous les launchers connectés. Attribue ou retire manuellement les tiers Soutien / VIP / Légende — utile en attendant l'intégration des paiements.",
    },
    {
      id: "logs" as const,
      label: "Logs",
      icon: TerminalSquare,
      title: "Logs des launchers",
      description:
        "Consulte les fichiers de session de chaque user. Sélectionne un launcher → choisis un fichier → lis, télécharge ou supprime. Rétention auto 7 jours.",
    },
    {
      id: "stats" as const,
      label: "Stats",
      icon: BarChart3,
      title: "Stats & Analytics",
      description:
        "Lancements et temps de jeu cumulés sur tout le launcher, top modules, utilisateurs actifs. Données agrégées au moment de l'ouverture (refresh manuel).",
    },
  ];
  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="scroll-y-only relative h-full p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
          <Shield className="size-3" /> Administration
        </p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">{currentTab.title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{currentTab.description}</p>
      </motion.div>

      {/* Tab nav — pill row with active underline animation. Switching tabs
          collapses the editing form (stay-in-context: the edit flow lives
          on the modules tab only). */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-8 flex gap-1 rounded-2xl bg-bg-soft/40 p-1.5 ring-1 ring-white/[0.06]"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (active) return;
                if (isEditing && t.id !== "modules") reset();
                setActiveTab(t.id);
              }}
              className={cn(
                "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors",
                active ? "text-bg-base" : "text-fg-muted hover:text-fg-primary",
              )}
            >
              {active && (
                <motion.div
                  layoutId="admin-tab-pill"
                  className="absolute inset-0 rounded-xl bg-accent shadow-[0_0_18px_var(--color-accent-soft)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-2">
                <Icon className="size-4" />
                {t.label}
              </span>
            </button>
          );
        })}
      </motion.div>

      {activeTab === "news" && (
        <motion.div
          key="tab-news"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <NewsManager />
        </motion.div>
      )}

      {activeTab === "crews" && (
        <motion.div
          key="tab-crews"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <CrewsManager />
        </motion.div>
      )}

      {activeTab === "users" && (
        <motion.div
          key="tab-users"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <UsersManager />
        </motion.div>
      )}

      {activeTab === "logs" && (
        <motion.div
          key="tab-logs"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <LogsManager />
        </motion.div>
      )}

      {activeTab === "stats" && (
        <motion.div
          key="tab-stats"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <AdminStatsPanel />
        </motion.div>
      )}

      {activeTab !== "modules" ? null : (
      <>
      {/* Published modules — full-width strip above the grid in *create*
          mode (so the admin can pick one to edit at a glance). In *edit* mode
          we replace it with a compact "currently editing" indicator since the
          row would just duplicate what the form already says. */}
      {!isEditing ? (
        <PublishedModulesRow
          modules={modules}
          editingId={editingId}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      ) : (
        <EditingChip name={form.name || form.id} onExit={reset} />
      )}

      <div className="grid grid-cols-12 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          /* `overflow-hidden` is the safety net: even if some inner element
             refuses to honor `min-width: 0` (a long URL, a `<select>` with
             a wide option, an overflowing flex row), it gets visually clipped
             at the form's rounded boundary instead of bleeding into the
             preview column. */
          className="relative z-10 col-span-12 min-w-0 overflow-hidden rounded-3xl glass-strong p-7 lg:col-span-7"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
              <Cloud className="size-5" />
            </div>
            <div className="flex-1">
              <div className="font-display text-2xl text-fg-primary">
                {isEditing ? `Modifier « ${form.name || form.id} »` : "Nouveau module"}
              </div>
              <div className="text-xs text-fg-muted">
                {isEditing
                  ? "Modifie les champs puis Enregistre. Pour pousser une nouvelle version d'un module hébergé, ajoute un fichier .zip ; sinon les autres champs sont mis à jour seuls."
                  : "Pour les raccourcis locaux, utilise plutôt « Ajouter un jeu » dans la bibliothèque."}
              </div>
            </div>
            {isEditing && (
              <button
                onClick={reset}
                className="shrink-0 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
              >
                Quitter l'édition
              </button>
            )}
          </div>

          {isEditing && editingId && (
            <button
              type="button"
              onClick={() => useUIStore.getState().navigate({ name: "admin-builder", moduleId: editingId })}
              className="mb-6 flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-accent/15 via-fuchsia-500/10 to-accent/15 p-5 text-left ring-1 ring-accent/30 transition-all hover:from-accent/25 hover:to-accent/25 hover:ring-accent/50 hover:shadow-[0_0_28px_var(--color-accent-soft)]"
            >
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-bg-base shadow-[0_0_20px_var(--color-accent-glow)]">
                <Layout className="size-6" />
              </div>
              <div className="flex-1">
                <div className="font-display text-lg text-fg-primary">Personnaliser la page du module</div>
                <div className="mt-0.5 text-xs text-fg-muted">
                  Une seule UI pour tout : thème (couleurs, polices), particules, background, bouton Lancer, et 19 blocs (hero parallax, galerie, vidéo, timeline, etc.) à glisser-déposer.
                </div>
              </div>
              <div className="shrink-0 text-xs font-semibold uppercase tracking-wider text-accent">Ouvrir →</div>
            </button>
          )}

          {!isEditing && <ModuleTypeSwitch value={form.type} onChange={(v) => updateForm("type", v)} />}

          <div className="mt-6 grid gap-4">
            <Field label="ID (slug)" hint={isEditing ? "non modifiable" : "minuscules, chiffres, tirets · ex: mancho-land"}>
              <Input
                value={form.id}
                onChange={(v) => updateForm("id", v)}
                placeholder="mon-jeu"
                disabled={isEditing}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nom affiché">
                <Input value={form.name} onChange={(v) => updateForm("name", v)} placeholder="Mon Jeu" />
              </Field>
              {form.type === "hosted" && (
                <Field label="Version" hint="semver">
                  <Input value={form.version} onChange={(v) => updateForm("version", v)} placeholder="1.0.0" />
                </Field>
              )}
            </div>
            <Field label="Description courte">
              <Input
                value={form.shortDescription}
                onChange={(v) => updateForm("shortDescription", v)}
                placeholder="Description en une phrase"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <ImageField
                label="Icône"
                hint="carré recommandé"
                url={form.iconUrl}
                uploading={iconUploading}
                onPickFile={(f) => uploadAsset("icon", f)}
                onClear={() => updateForm("iconUrl", "")}
              />
              <ImageField
                label="Bannière"
                hint="16:9 recommandé"
                url={form.bannerUrl}
                uploading={bannerUploading}
                onPickFile={(f) => uploadAsset("banner", f)}
                onClear={() => updateForm("bannerUrl", "")}
              />
            </div>

            {form.type === "hosted" ? (
              <>
                <Field label="Nom de l'exécutable dans le zip" hint="ex: MyGame.exe">
                  <Input value={form.executable} onChange={(v) => updateForm("executable", v)} placeholder="MyGame.exe" />
                </Field>
                <FilePicker file={file} onChange={setFile} />
                {isEditing && (
                  <ModuleVersionsPanel
                    moduleId={form.id}
                    currentVersion={form.version}
                  />
                )}
              </>
            ) : (
              <MinecraftFields
                form={form}
                updateForm={updateForm}
                modpackUploading={modpackUploading}
                onUploadModpack={uploadModpack}
              />
            )}
          </div>

          {/* Server Minecraft — module data, not page styling. Lives here
              standalone, always visible. The CTA above already covers ALL
              visual customization (thème, particules, background, blocs)
              via le builder, donc on n'a plus de doublon de section. */}
          <div className="mt-6 grid gap-3 rounded-2xl bg-bg-base/30 p-5 ring-1 ring-white/[0.04]">
            <SectionHeader icon={Server} title="Serveur Minecraft (optionnel)" />
            <Field label="Adresse" hint="ex: play.manchoworld.fr · ip:port">
              <Input
                value={form.serverAddress}
                onChange={(v) => updateForm("serverAddress", v)}
                placeholder="play.example.com"
                mono
              />
            </Field>
            <p className="text-xs text-fg-dim">
              Si renseigné, le statut du serveur (joueurs en ligne, version, MOTD) s'affichera sur la carte et la page détail.
            </p>
          </div>

          {progress && (
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-fg-muted">
                <span>Upload Storage</span>
                <span>
                  {(progress.bytesUploaded / 1_048_576).toFixed(1)} / {(progress.bytesTotal / 1_048_576).toFixed(1)} Mo
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full bg-accent shadow-[0_0_12px_var(--color-accent-glow)]"
                  animate={{ width: `${progress.percent}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>
          )}

          <AnimatePresence>
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  "mt-5 flex items-start gap-3 rounded-xl p-3 text-sm ring-1",
                  feedback.kind === "ok"
                    ? "bg-success/10 text-fg-primary ring-success/30"
                    : "bg-danger/10 text-fg-primary ring-danger/30",
                )}
              >
                {feedback.kind === "ok" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.5} />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={2.5} />
                )}
                <p>{feedback.message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-xl bg-accent px-5 py-3 font-medium text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_36px_var(--color-accent-glow)] disabled:opacity-50"
            >
              {submitting
                ? isEditing
                  ? "Enregistrement…"
                  : "Publication…"
                : isEditing
                  ? form.type === "minecraft"
                    ? "Enregistrer les modifications"
                    : file
                      ? "Pousser une nouvelle version"
                      : "Enregistrer les modifications"
                  : form.type === "minecraft"
                    ? "Publier le modpack"
                    : "Uploader & publier"}
            </button>
            <button
              onClick={reset}
              disabled={submitting}
              className="rounded-xl bg-white/[0.04] px-5 py-3 font-medium text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
            >
              Annuler
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-0 col-span-12 min-w-0 lg:col-span-5"
        >
          {/* Sticky preview — follows the form as the admin scrolls so the
              live render stays visible while filling out long sections. The
              wrapper is intentionally minimal (no glass-strong panel) so the
              card floats against the page background instead of being a heavy
              card-inside-a-card. `overflow-hidden` on the inner flex container
              also doubles as a safety net to clip any particle canvas that
              might escape the preview card's own bounds. */}
          <div className="lg:sticky lg:top-6">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
              <Sparkles className="size-3" />
              Aperçu en temps réel
            </div>
            <div className="flex flex-col items-center overflow-hidden">
              <ModulePreviewCard
                draft={{
                  type: form.type,
                  name: form.name,
                  shortDescription: form.shortDescription,
                  iconUrl: form.iconUrl,
                  bannerUrl: form.bannerUrl,
                  themePrimary: form.themePrimary,
                  themeAccent: form.themeAccent,
                  fontDisplay: form.fontDisplay,
                  particles:
                    form.particlesPreset !== "none"
                      ? {
                          preset: form.particlesPreset,
                          color: form.particlesColor,
                          density: form.particlesDensity,
                        }
                      : undefined,
                }}
              />
              <p className="mt-4 text-center text-xs text-fg-muted">
                Rendu de la carte côté bibliothèque.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
      </>
      )}
    </div>
  );
}

/**
 * Compact "currently editing" indicator shown in place of the published
 * modules strip while the admin is editing an existing module. Avoids the
 * visual redundancy of having the active card duplicated above the form
 * (which already has its own "Modifier « X »" header).
 */
function EditingChip({ name, onExit }: { name: string; onExit: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mb-6 inline-flex items-center gap-3 rounded-2xl bg-accent/[0.08] px-4 py-2.5 text-sm ring-1 ring-accent/30"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
        <Activity className="size-3.5" />
      </span>
      <span className="text-fg-muted">Édition en cours :</span>
      <span className="font-medium text-fg-primary">{name}</span>
      <button
        type="button"
        onClick={onExit}
        className="ml-2 rounded-md bg-white/[0.04] px-2.5 py-1 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-fg-primary"
      >
        Quitter
      </button>
    </motion.div>
  );
}

/**
 * Horizontal-scrolling strip of published modules, displayed as a single row
 * above the form/preview grid. Replaces the old vertical list that lived in
 * the right column — putting it here removes the visual collision with the
 * form's two-column inner layouts (icon/banner pickers, version/loader rows).
 */
function PublishedModulesRow({
  modules,
  editingId,
  onEdit,
  onDelete,
}: {
  modules: LauncherModule[];
  editingId: string | null;
  onEdit: (m: LauncherModule) => void;
  onDelete: (m: LauncherModule) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mb-6"
    >
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-fg-muted">
        <Cloud className="size-3" />
        Modules publiés ({modules.length})
      </div>
      {modules.length === 0 ? (
        <div className="rounded-2xl glass p-6 text-center text-sm text-fg-muted">
          Aucun module pour l'instant. Crée le premier ci-dessous.
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {modules.map((m) => (
            <div key={m.id} className="w-[22rem] shrink-0">
              <ModuleCard
                module={m}
                active={editingId === m.id}
                onEdit={() => onEdit(m)}
                onDelete={() => onDelete(m)}
                onCustomize={() => useUIStore.getState().navigate({ name: "admin-builder", moduleId: m.id })}
              />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ModuleTypeSwitch({ value, onChange }: { value: ModuleType; onChange: (v: ModuleType) => void }) {
  const types: { value: ModuleType; label: string; hint: string }[] = [
    { value: "hosted", label: "Hébergé", hint: "Jeu standalone uploadé sur Firebase" },
    { value: "minecraft", label: "Minecraft", hint: "Vanilla / Fabric / Forge / NeoForge + modpack Modrinth ou ZIP" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.06]">
      {types.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative rounded-lg px-3 py-2.5 text-left transition-colors",
            value === t.value ? "text-bg-base" : "text-fg-muted hover:text-fg-primary",
          )}
        >
          {value === t.value && (
            <motion.div
              layoutId="admin-type-pill"
              className="absolute inset-0 rounded-lg bg-accent shadow-[0_0_18px_var(--color-accent-soft)]"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10 block text-sm font-medium">{t.label}</span>
          <span className={cn("relative z-10 block text-xs", value === t.value ? "text-bg-base/70" : "text-fg-dim")}>
            {t.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function MinecraftFields({
  form,
  updateForm,
  modpackUploading,
  onUploadModpack,
}: {
  form: FormState;
  updateForm: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  modpackUploading: { percent: number; uploaded: number; total: number } | null;
  onUploadModpack: (file: File) => void;
}) {
  const loaders: { value: ModLoader; label: string }[] = [
    { value: "", label: "—" },
    { value: "forge", label: "Forge" },
    { value: "fabric", label: "Fabric" },
    { value: "neoforge", label: "NeoForge" },
    { value: "quilt", label: "Quilt" },
  ];

  return (
    <div className="grid gap-4 rounded-2xl bg-bg-base/30 p-5 ring-1 ring-white/[0.04]">
      {/* Native MC config — the only launch path since v26.05.03.8. Holds
          version, loader, loader version, modpack overlay (Modrinth or
          local zip upload), and the RAM slider. */}
      <NativeMinecraftBlock
        form={form}
        updateForm={updateForm}
        modpackUploading={modpackUploading}
        onUploadModpack={onUploadModpack}
      />

      <RamSlider value={form.maxRamMb} onChange={(v) => updateForm("maxRamMb", v)} />

      {/* Display-only metadata (the actual install config lives in the
          native block above; these two fields are just for module list
          UI labels). */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Version Minecraft" hint="affichage uniquement">
          <Input
            value={form.minecraftVersion}
            onChange={(v) => updateForm("minecraftVersion", v)}
            placeholder="1.20.1"
          />
        </Field>
        <Field label="Mod loader" hint="affichage uniquement">
          <select
            value={form.modLoader}
            onChange={(e) => updateForm("modLoader", e.target.value as ModLoader)}
            className="no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
          >
            {loaders.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

/**
 * Lists all past versions of a hosted module with a one-click rollback to
 * any prior release. Each row shows the version string + release date +
 * size; clicking « Rétablir » swaps the parent module doc's `downloadUrl`
 * / `version` / `sha256` / `size` fields back to that version's blob.
 *
 * Users see this as a normal "update available" since the published
 * version on Firestore changed — they re-download the older binary.
 */
function ModuleVersionsPanel({
  moduleId,
  currentVersion,
}: {
  moduleId: string;
  currentVersion: string;
}) {
  const [versions, setVersions] = useState<ModuleVersionRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!moduleId) return;
    return watchModuleVersions(moduleId, setVersions);
  }, [moduleId]);

  const handleRollback = async (target: ModuleVersionRecord) => {
    if (target.version === currentVersion) return;
    if (
      !confirm(
        `Rétablir la version ${target.version} du module ?\n\nTous tes potes verront cette version comme étant l'actuelle au prochain check, et leur launcher proposera la « MAJ » en re-téléchargeant le binaire correspondant.`,
      )
    ) {
      return;
    }
    setBusy(target.version);
    setFeedback(null);
    try {
      await rollbackModuleToVersion(moduleId, target.version);
      setFeedback({
        kind: "ok",
        message: `Module rétabli sur la version ${target.version}.`,
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  if (versions.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-base/30 p-4 text-xs text-fg-muted ring-1 ring-white/[0.04]">
        Aucune version archivée pour l'instant. Chaque upload de binaire crée une entrée ici, et tu pourras rétablir une ancienne version en un clic depuis cette liste.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-bg-base/30 p-4 ring-1 ring-white/[0.04]">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-accent">
          <Activity className="size-3" /> Versions publiées
        </div>
        <span className="text-[10px] text-fg-dim">{versions.length} archivée{versions.length > 1 ? "s" : ""}</span>
      </div>
      {feedback && (
        <div
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs ring-1",
            feedback.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20"
              : "bg-rose-500/10 text-rose-200 ring-rose-500/20",
          )}
        >
          {feedback.message}
        </div>
      )}
      <div className="space-y-1">
        {versions.map((v) => {
          const isCurrent = v.version === currentVersion;
          const isBusy = busy === v.version;
          return (
            <div
              key={v.version}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 ring-1 transition-colors",
                isCurrent
                  ? "bg-accent/10 ring-accent/30"
                  : "bg-bg-base/40 ring-white/[0.04]",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="font-mono text-xs text-fg-primary">v{v.version}</span>
                {isCurrent && (
                  <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/30">
                    Actuelle
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-fg-dim">
                {v.size > 0 ? `${(v.size / 1_048_576).toFixed(1)} Mo` : "—"}
              </span>
              <span className="shrink-0 text-[10px] text-fg-dim">
                {v.releasedAt
                  ? new Date(v.releasedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })
                  : "—"}
              </span>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => handleRollback(v)}
                  disabled={isBusy}
                  className={cn(
                    "no-drag shrink-0 rounded-md px-2.5 py-1 text-[10px] font-medium ring-1 transition-all",
                    isBusy
                      ? "bg-white/[0.04] text-fg-dim ring-white/[0.04] cursor-wait"
                      : "bg-amber-500/10 text-amber-200 ring-amber-500/30 hover:bg-amber-500/20 hover:shadow-[0_0_12px_rgba(251,191,36,0.3)]",
                  )}
                >
                  {isBusy ? "…" : "Rétablir"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Palette; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 text-xs uppercase tracking-[0.2em] text-accent">
      <Icon className="size-3" /> {title}
    </div>
  );
}

function Field({
  label,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  // ReactNode rather than `string` so callers can embed clickable
  // links / inline `<code>` snippets in the help line (e.g. the
  // loader version field points at fabricmc.net / files.minecraftforge.net).
  hint?: React.ReactNode;
  icon?: typeof ImageIcon;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
          {Icon && <Icon className="size-3" />}
          {label}
        </span>
        {hint && <span className="text-xs text-fg-dim">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]",
        mono && "font-mono text-xs",
        disabled && "cursor-not-allowed opacity-60",
      )}
    />
  );
}

function ImageField({
  label,
  hint,
  url,
  uploading,
  onPickFile,
  onClear,
}: {
  label: string;
  hint?: string;
  url: string;
  uploading: boolean;
  onPickFile: (f: File) => void;
  onClear: () => void;
}) {
  const id = `img-${label}`;
  return (
    <Field label={label} hint={hint} icon={ImageIcon}>
      <div className="flex h-[110px] items-center gap-3 overflow-hidden rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-3 transition-colors hover:border-accent/40">
        <input
          type="file"
          id={id}
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
          className="hidden"
        />
        {url ? (
          <>
            <img src={url} alt="" className="h-full aspect-square rounded-lg object-cover ring-1 ring-white/10" />
            <div className="flex flex-1 flex-col gap-2">
              <label
                htmlFor={id}
                className="no-drag cursor-pointer rounded-md bg-white/[0.04] px-3 py-1.5 text-center text-xs text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
              >
                Remplacer
              </label>
              <button
                onClick={onClear}
                type="button"
                className="rounded-md bg-white/[0.02] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.04] transition-colors hover:bg-danger/10 hover:text-danger"
              >
                Retirer
              </button>
            </div>
          </>
        ) : (
          <label htmlFor={id} className="no-drag flex flex-1 cursor-pointer items-center gap-3">
            <div className="grid h-full aspect-square place-items-center rounded-lg bg-accent/10 text-accent">
              {uploading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="size-5 rounded-full border-2 border-accent border-t-transparent"
                />
              ) : (
                <Upload className="size-5" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm text-fg-primary">{uploading ? "Upload…" : "Choisir un fichier"}</div>
              <div className="text-xs text-fg-muted">PNG / JPG / WebP / GIF</div>
            </div>
          </label>
        )}
      </div>
    </Field>
  );
}

function FilePicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
        <Upload className="size-3" /> Fichier .zip
      </span>
      <div className="rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-5 transition-colors hover:border-accent/40">
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="hidden"
          id="zip-input"
        />
        <label
          htmlFor="zip-input"
          className="no-drag flex cursor-pointer items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
              <Upload className="size-4" />
            </div>
            <div>
              <div className="text-sm text-fg-primary">{file ? file.name : "Choisir un fichier"}</div>
              <div className="text-xs text-fg-muted">
                {file ? `${(file.size / 1_048_576).toFixed(1)} Mo` : "Glisse un .zip ou clique"}
              </div>
            </div>
          </div>
          <span className="rounded-md bg-white/[0.04] px-3 py-1.5 text-xs text-fg-primary ring-1 ring-white/[0.06]">
            Parcourir
          </span>
        </label>
      </div>
    </label>
  );
}

function ModuleCard({
  module,
  active,
  onEdit,
  onDelete,
  onCustomize,
}: {
  module: LauncherModule;
  active?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCustomize?: () => void;
}) {
  const badge = (() => {
    if (module.type === "hosted") {
      return { label: `v${module.version}`, cls: "bg-accent/10 text-accent ring-accent/30" };
    }
    if (module.type === "minecraft") {
      return { label: "Modpack", cls: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" };
    }
    return { label: "Local", cls: "bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30" };
  })();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onEdit}
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 rounded-2xl glass p-4 transition-all",
        active
          ? "ring-2 ring-accent shadow-[inset_0_0_24px_var(--color-accent-soft)]"
          : "hover:bg-white/[0.03] hover:ring-1 hover:ring-accent/30",
      )}
    >
      {module.iconUrl ? (
        <img src={module.iconUrl} alt={module.name} className="size-12 rounded-lg object-cover" />
      ) : (
        <div className="grid size-12 place-items-center rounded-lg bg-accent/10 text-accent">
          <Gamepad2 className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-fg-primary">{module.name}</span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1", badge.cls)}>
            {badge.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" /> {module.id}
          </span>
          {module.type === "hosted" && (
            <span className="inline-flex items-center gap-1">
              <LinkIcon className="size-3" /> {(module.size / 1_048_576).toFixed(1)} Mo
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onCustomize && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCustomize();
            }}
            className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-accent/15 hover:text-accent"
            title="Personnaliser la page"
          >
            <Layout className="size-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-danger/15 hover:text-danger"
          title="Supprimer"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Configuration block for the native Minecraft launch path. Sole launch
 * path since v26.05.03.8 (Prism support removed). Holds the pinned MC
 * version, the loader (vanilla / Fabric / Forge / NeoForge), the loader
 * version, and an optional modpack overlay (Modrinth `.mrpack` URL or
 * raw ZIP). Everything gets persisted into Firestore and consumed by
 * `ModuleDetailPage` at launch time via `mc_native_launch`.
 */
function NativeMinecraftBlock({
  form,
  updateForm,
  modpackUploading,
  onUploadModpack,
}: {
  form: FormState;
  updateForm: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  modpackUploading: { percent: number; uploaded: number; total: number } | null;
  onUploadModpack: (file: File) => void;
}) {
  return (
    <div className="rounded-2xl bg-emerald-400/[0.03] p-4 ring-1 ring-emerald-400/30">
      <div className="flex items-start gap-3">
        <div className="grid size-5 shrink-0 place-items-center rounded-md bg-emerald-400 text-bg-base ring-1 ring-emerald-400">
          <CheckCircle2 className="size-3.5" strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-fg-primary">
            Lanceur Minecraft natif{" "}
            <span className="ml-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
              Stable
            </span>
          </div>
          <div className="text-xs text-fg-muted">
            Auth Microsoft + DL libs/assets + Forge/Fabric/NeoForge + modpack
            Modrinth ou ZIP. Sole launch path depuis v26.05.03.8.
          </div>
        </div>
      </div>

      {(
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Version Minecraft" hint='Ex. "1.20.1" ou "26.1.2"'>
            <input
              type="text"
              value={form.nativeMcVersion}
              onChange={(e) => updateForm("nativeMcVersion", e.target.value)}
              placeholder="1.20.1"
              className="w-full rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-emerald-400/50 focus:outline-none"
            />
          </Field>
          <Field label="Loader">
            <select
              value={form.nativeLoader}
              onChange={(e) =>
                updateForm("nativeLoader", e.target.value as FormState["nativeLoader"])
              }
              className="w-full rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-emerald-400/50 focus:outline-none"
            >
              <option value="vanilla">Vanilla (aucun)</option>
              <option value="fabric">Fabric</option>
              <option value="forge">Forge</option>
              <option value="neoforge">NeoForge</option>
            </select>
          </Field>
          {form.nativeLoader !== "vanilla" && (
            <Field
              label="Version du loader"
              hint={
                <>
                  {form.nativeLoader === "fabric" && (
                    <>
                      Format <code className="rounded bg-white/5 px-1 font-mono">X.Y.Z</code>{" "}
                      (ex. <code className="rounded bg-white/5 px-1 font-mono">0.16.0</code>).
                      Trouve la dernière sur{" "}
                      <a
                        className="text-emerald-300 underline hover:text-emerald-200"
                        href="https://fabricmc.net/use/installer/"
                        onClick={async (e) => {
                          e.preventDefault();
                          const { openUrl } = await import("@tauri-apps/plugin-opener");
                          await openUrl("https://fabricmc.net/use/installer/");
                        }}
                      >
                        fabricmc.net
                      </a>{" "}
                      → « Loader Version ».
                    </>
                  )}
                  {form.nativeLoader === "forge" && (
                    <>
                      Format <code className="rounded bg-white/5 px-1 font-mono">XX.Y.Z</code>{" "}
                      (ex. <code className="rounded bg-white/5 px-1 font-mono">47.4.0</code>).
                      Liste complète sur{" "}
                      <a
                        className="text-emerald-300 underline hover:text-emerald-200"
                        href="https://files.minecraftforge.net/net/minecraftforge/forge/"
                        onClick={async (e) => {
                          e.preventDefault();
                          const { openUrl } = await import("@tauri-apps/plugin-opener");
                          await openUrl("https://files.minecraftforge.net/net/minecraftforge/forge/");
                        }}
                      >
                        files.minecraftforge.net
                      </a>{" "}
                      → choisir ta MC version → la 1ère colonne (ex. « Latest 1.20.1 - 47.4.0 »).
                    </>
                  )}
                  {form.nativeLoader === "neoforge" && (
                    <>
                      Format <code className="rounded bg-white/5 px-1 font-mono">XX.Y.Z[-beta]</code>{" "}
                      (ex. <code className="rounded bg-white/5 px-1 font-mono">21.5.34-beta</code>).
                      Liste complète sur{" "}
                      <a
                        className="text-emerald-300 underline hover:text-emerald-200"
                        href="https://projects.neoforged.net/neoforged/neoforge"
                        onClick={async (e) => {
                          e.preventDefault();
                          const { openUrl } = await import("@tauri-apps/plugin-opener");
                          await openUrl("https://projects.neoforged.net/neoforged/neoforge");
                        }}
                      >
                        projects.neoforged.net
                      </a>{" "}
                      → onglet « Versions ».
                    </>
                  )}
                  <br />
                  <span className="text-fg-dim">
                    💡 Si tu uploades un ZIP CurseForge contenant un{" "}
                    <code className="rounded bg-white/5 px-1 font-mono">manifest.json</code>, ce
                    champ se remplit auto.
                  </span>
                </>
              }
            >
              <input
                type="text"
                value={form.nativeLoaderVersion}
                onChange={(e) => updateForm("nativeLoaderVersion", e.target.value)}
                placeholder={
                  form.nativeLoader === "fabric"
                    ? "0.16.0"
                    : form.nativeLoader === "forge"
                      ? "47.4.0"
                      : "21.5.34-beta"
                }
                className="w-full rounded-xl bg-bg-base/60 px-3 py-2 text-sm font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-emerald-400/50 focus:outline-none"
              />
            </Field>
          )}
          <Field label="Modpack">
            <select
              value={form.nativeModpackKind}
              onChange={(e) =>
                updateForm(
                  "nativeModpackKind",
                  e.target.value as FormState["nativeModpackKind"],
                )
              }
              className="w-full rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:ring-emerald-400/50 focus:outline-none"
            >
              <option value="none">Aucun (vanilla + loader nu)</option>
              <option value="modrinth">Modrinth (.mrpack)</option>
              <option value="zip">ZIP custom (CurseForge bundled)</option>
            </select>
          </Field>
          {form.nativeModpackKind !== "none" && (
            <div className="md:col-span-2 space-y-3">
              <Field
                label={
                  form.nativeModpackKind === "modrinth"
                    ? "URL du .mrpack"
                    : "URL du ZIP modpack"
                }
                hint={
                  form.nativeModpackKind === "modrinth"
                    ? "Colle un lien direct (.mrpack), ou upload depuis ton PC ci-dessous"
                    : "Hôtes supportés : GitHub Releases (recommandé — gratuit, 2 GB/fichier, jamais expiré), Pixeldrain (pixeldrain.com/u/…), Google Drive (drive.google.com/file/d/…), Firebase Storage (bouton Upload ci-dessous), Catbox, n'importe quelle URL de DL direct. Évite Discord et OneDrive (URLs qui expirent / API anonyme verrouillée par Microsoft en 2024)."
                }
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.nativeModpackUrl}
                    onChange={(e) => updateForm("nativeModpackUrl", e.target.value)}
                    placeholder={
                      form.nativeModpackKind === "modrinth"
                        ? "https://cdn.modrinth.com/data/.../pack.mrpack"
                        : "github.com/.../releases/download/...  ·  pixeldrain.com/u/XXX  ·  drive.google.com/file/d/XXX"
                    }
                    className="flex-1 rounded-xl bg-bg-base/60 px-3 py-2 text-xs font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-emerald-400/50 focus:outline-none"
                  />
                  {form.nativeModpackKind === "zip" && form.nativeModpackUrl && (
                    <DetectManifestButton
                      url={form.nativeModpackUrl}
                      onDetected={(m) => {
                        if (m.mcVersion) updateForm("nativeMcVersion", m.mcVersion);
                        if (m.loader && ["vanilla", "fabric", "forge", "neoforge"].includes(m.loader)) {
                          updateForm("nativeLoader", m.loader as FormState["nativeLoader"]);
                        }
                        if (m.loaderVersion) updateForm("nativeLoaderVersion", m.loaderVersion);
                      }}
                    />
                  )}
                </div>
              </Field>
              <UploadDestinationPicker
                form={form}
                updateForm={updateForm}
                modpackUploading={modpackUploading}
                onUploadModpack={onUploadModpack}
                accept={form.nativeModpackKind === "modrinth" ? ".mrpack,.zip" : ".zip"}
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}

/**
 * Single host destination picker for the modpack upload. Shows a
 * pill toggle (Firebase | GitHub Releases) at the top, then renders
 * **only one** of the two upload UIs based on the selection — no more
 * "I clicked the wrong picker" confusion.
 *
 * The current selection lives in component state (not Firestore) since
 * it's purely a UX preference for the upload step. The output URL
 * lands in `nativeModpackUrl` regardless of which destination wins.
 */
function UploadDestinationPicker({
  form,
  updateForm,
  modpackUploading,
  onUploadModpack,
  accept,
}: {
  form: FormState;
  updateForm: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  modpackUploading: { percent: number; uploaded: number; total: number } | null;
  onUploadModpack: (file: File) => void;
  accept: string;
}) {
  const [destination, setDestination] = useState<"firebase" | "github">("firebase");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-fg-muted">
          Destination upload
        </span>
        <div className="flex gap-1 rounded-lg bg-bg-base/40 p-1 ring-1 ring-white/[0.06]">
          {(["firebase", "github"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDestination(d)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                destination === d
                  ? d === "github"
                    ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
                    : "bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40"
                  : "text-fg-muted hover:text-fg-primary",
              )}
            >
              {d === "firebase" ? "Firebase Storage" : "GitHub Releases"}
            </button>
          ))}
        </div>
      </div>
      {destination === "firebase" ? (
        <NativeModpackUpload
          accept={accept}
          uploading={modpackUploading}
          onPick={onUploadModpack}
          hasUrl={!!form.nativeModpackUrl}
          onClear={() => updateForm("nativeModpackUrl", "")}
        />
      ) : (
        <GithubReleaseUpload
          moduleId={form.id}
          onUploaded={(url) => updateForm("nativeModpackUrl", url)}
          onLocalManifestDetected={(m) => {
            if (m.mcVersion) updateForm("nativeMcVersion", m.mcVersion);
            if (m.loader && ["vanilla", "fabric", "forge", "neoforge"].includes(m.loader)) {
              updateForm("nativeLoader", m.loader as FormState["nativeLoader"]);
            }
            if (m.loaderVersion) updateForm("nativeLoaderVersion", m.loaderVersion);
          }}
        />
      )}
    </div>
  );
}

/**
 * Modpack-upload-via-GitHub-Releases panel. Sits right under the
 * Firebase upload card so the admin can choose either host. Workflow:
 *
 *   1. First mount: hits `gh_token_status` to see if a PAT is stored.
 *      Status renders compactly (`Connecté en tant que X` or
 *      `Configurer GitHub`).
 *   2. PAT setup: modal with a textarea + "Generate token" link to
 *      github.com/settings/tokens; on submit, validates + stores in
 *      keyring.
 *   3. Upload: pick a file via the system dialog, choose a repo (or
 *      paste owner/repo), pick a tag (default = today's CalVer).
 *      On success, the public download URL fills `nativeModpackUrl`.
 *
 * Manifest detection runs LOCALLY on the picked file (browser-side
 * fflate) so the admin sees MC version + loader auto-fill the moment
 * the file is selected, even before upload completes.
 */
function GithubReleaseUpload({
  moduleId,
  onUploaded,
  onLocalManifestDetected,
}: {
  moduleId: string;
  onUploaded: (downloadUrl: string) => void;
  onLocalManifestDetected: (m: import("@/lib/mcZip").CurseforgeManifestSummary) => void;
}) {
  const [status, setStatus] = useState<"loading" | "loggedout" | "loggedin">("loading");
  const [user, setUser] = useState<import("@/lib/mcGithub").GithubUser | null>(null);
  const [repos, setRepos] = useState<import("@/lib/mcGithub").GithubRepo[]>([]);
  // Tracks whether `gh_list_repos` is in flight. We need this distinct
  // from the array length so the "no repos detected" empty-state doesn't
  // flash during the boot fetch (`repos = []` initially even when the
  // user actually has repos).
  const [reposLoading, setReposLoading] = useState(false);
  // Forces the manual `<input>` even when `repos.length > 0`. Useful
  // when a freshly-created repo hasn't shown up in the API response
  // yet (GitHub sometimes lags a few seconds), or when the PAT scope
  // filtered it out client-side.
  const [manualRepo, setManualRepo] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [tag, setTag] = useState<string>(() => {
    const d = new Date();
    return `v${String(d.getFullYear() % 100).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  });
  const [uploading, setUploading] = useState<{ pct: number; phase: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Boot: check token + load repos if connected.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { ghTokenStatus, ghListRepos } = await import("@/lib/mcGithub");
        const u = await ghTokenStatus();
        if (cancelled) return;
        if (u) {
          setUser(u);
          setStatus("loggedin");
          setReposLoading(true);
          try {
            const rs = await ghListRepos();
            if (!cancelled) {
              setRepos(rs);
              if (rs[0]) setSelectedRepo(rs[0].fullName);
            }
          } catch {
            // Repo listing is best-effort; user can paste full name manually.
          } finally {
            if (!cancelled) setReposLoading(false);
          }
        } else {
          setStatus("loggedout");
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[admin/gh] status check failed:", err);
          setStatus("loggedout");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePickFile = async () => {
    if (!moduleId) {
      setError("Renseigne d'abord l'ID du module avant d'uploader.");
      return;
    }
    if (!selectedRepo) {
      setError("Sélectionne ou tape un repo (format owner/repo).");
      return;
    }
    setError(null);
    // Open the system file picker (Tauri dialog) and get an absolute
    // path back. We can't reuse `<input type=file>` here because the
    // GitHub upload happens in Rust and needs a real filesystem path.
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({
      multiple: false,
      filters: [{ name: "Modpack ZIP", extensions: ["zip"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    const filePath = picked as string;

    // Fire-and-forget local manifest detection: read the file blob
    // alongside the upload. We can't easily get a File object from a
    // Tauri path (no FileReader API), so we use the Rust side's
    // existing read_manifest by passing a `file://` URL. Quick hack
    // but effective.
    void (async () => {
      try {
        const { mcZipReadManifestUrl } = await import("@/lib/mcZip");
        const fileUrl = `file:///${filePath.replace(/\\/g, "/")}`;
        const m = await mcZipReadManifestUrl(fileUrl);
        onLocalManifestDetected(m);
      } catch {
        // Non-fatal — Rust's reqwest doesn't accept file:// schemes by
        // default. The manifest will still be detected post-upload via
        // the GitHub URL fallback (fast since GitHub CDN is quick).
      }
    })();

    setUploading({ pct: 0, phase: "ensuring-release" });
    let unlistenFn: (() => void) | undefined;
    try {
      const { ghUploadModpack, onGhUploadProgress } = await import("@/lib/mcGithub");
      unlistenFn = await onGhUploadProgress((p) => {
        const pct = p.bytesTotal > 0 ? (p.bytesUploaded / p.bytesTotal) * 100 : 0;
        setUploading({ pct, phase: p.phase });
      });
      const result = await ghUploadModpack({
        repoFullName: selectedRepo,
        tag,
        releaseName: `${moduleId} ${tag}`,
        filePath,
      });
      onUploaded(result.downloadUrl);
      // Once the asset is on the GitHub CDN, do a manifest detect via
      // the public URL — covers the case where the local detect above
      // didn't work (file:// scheme not supported).
      try {
        const { mcZipReadManifestUrl } = await import("@/lib/mcZip");
        const m = await mcZipReadManifestUrl(result.downloadUrl);
        onLocalManifestDetected(m);
      } catch {
        // Non-fatal — admin can fill MC + loader manually.
      }
      setUploading(null);
      setError(null);
      setError(
        `✓ Uploadé sur ${result.releaseName} (${(result.assetSize / 1_048_576).toFixed(1)} Mo). URL collée dans le champ ci-dessus.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setUploading(null);
    } finally {
      unlistenFn?.();
    }
  };

  const handleLogout = async () => {
    const { ghTokenClear } = await import("@/lib/mcGithub");
    await ghTokenClear();
    setUser(null);
    setRepos([]);
    setStatus("loggedout");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-dim">
        <Loader2 className="size-3 animate-spin" /> Vérification du token GitHub…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-3">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-medium text-fg-primary">
            GitHub Releases <span className="text-fg-dim">· alternative au upload Firebase</span>
          </div>
          {status === "loggedin" && user ? (
            <div className="text-fg-muted">
              Connecté en tant que <strong className="text-fg-primary">@{user.login}</strong>{" "}
              <button
                type="button"
                onClick={handleLogout}
                className="ml-1 underline hover:text-fg-primary"
              >
                Déconnecter
              </button>
            </div>
          ) : (
            <div className="text-fg-muted">
              Non connecté. Configure un PAT (Personal Access Token) pour uploader directement
              vers GitHub Releases (gratuit, 2 GB/fichier, jamais expire).
            </div>
          )}
        </div>
        {status === "loggedout" && (
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className="shrink-0 rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30 hover:bg-amber-400/25"
          >
            Configurer GitHub
          </button>
        )}
      </div>

      {status === "loggedin" && (
        <>
          {/* Empty-state helper: many users get stuck wondering "what do
              I put as repo name?". When the API returned 0 push-eligible
              repos (typical for a fresh GitHub account), surface a big
              one-click button to open GitHub's "new repo" page with a
              good default name + Public visibility, plus a clear text
              hint. Once they create the repo, they can refresh the
              picker. */}
          {repos.length === 0 && !reposLoading && (
            <div className="mt-3 rounded-xl bg-amber-400/[0.06] p-3 ring-1 ring-amber-400/20">
              <div className="flex items-start gap-2">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <div className="flex-1 text-[11px] leading-relaxed text-fg-muted">
                  <strong className="text-fg-primary">Aucun repo détecté.</strong> Pour héberger
                  des modpacks sur GitHub Releases, il te faut d'abord un repo (un dossier en
                  ligne). Crée-en un public et vide — il servira juste de bibliothèque pour les
                  ZIP. Une fois fait, clique sur « Rafraîchir » pour le voir apparaître.
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const { openUrl } = await import("@tauri-apps/plugin-opener");
                    await openUrl(
                      "https://github.com/new?name=simple-launcher-modpacks&description=Modpacks+hosted+for+Simple+Launcher&visibility=public",
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/15 px-3 py-1.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-400/25"
                >
                  <Plus className="size-3" />
                  Créer un repo sur GitHub
                  <ExternalLink className="size-2.5 opacity-60" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setReposLoading(true);
                    try {
                      const { ghListRepos } = await import("@/lib/mcGithub");
                      const rs = await ghListRepos();
                      setRepos(rs);
                      if (rs[0]) setSelectedRepo(rs[0].fullName);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setReposLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-[11px] font-medium text-fg-muted ring-1 ring-white/10 hover:bg-white/10 hover:text-fg-primary"
                >
                  <Loader2 className="size-3" />
                  Rafraîchir la liste
                </button>
              </div>
            </div>
          )}

          {reposLoading && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.03] p-2.5 text-[11px] text-fg-muted ring-1 ring-white/10">
              <Loader2 className="size-3 animate-spin" />
              Chargement de tes repos GitHub…
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-muted">
                  <GitBranch className="size-3" />
                  Repo de destination
                </label>
                {repos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setManualRepo((m) => !m)}
                    className="text-[10px] text-fg-dim hover:text-amber-300"
                  >
                    {manualRepo ? "← Choisir dans la liste" : "Saisir manuellement →"}
                  </button>
                )}
              </div>
              {repos.length > 0 && !manualRepo ? (
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="mt-1 w-full rounded-md bg-bg-base/60 px-2 py-1.5 text-xs text-fg-primary ring-1 ring-white/[0.08] focus:ring-amber-400/50 focus:outline-none"
                >
                  {repos.map((r) => (
                    <option key={r.id} value={r.fullName}>
                      {r.fullName} {r.private ? "🔒 privé" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  placeholder={user ? `${user.login}/simple-launcher-modpacks` : "owner/nom-du-repo"}
                  className="mt-1 w-full rounded-md bg-bg-base/60 px-2 py-1.5 text-xs font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-amber-400/50 focus:outline-none"
                />
              )}
              <div className="mt-1 text-[10px] leading-relaxed text-fg-dim">
                Format : <code className="rounded bg-white/5 px-1 py-0.5 font-mono">propriétaire/nom-du-repo</code>{" "}
                (ex.{" "}
                <code className="rounded bg-white/5 px-1 py-0.5 font-mono">
                  {user ? user.login : "moncompte"}/mes-modpacks
                </code>
                )
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-fg-muted">
                Tag (= version)
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="v26.05.03"
                className="mt-1 w-full rounded-md bg-bg-base/60 px-2 py-1.5 text-xs font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-amber-400/50 focus:outline-none"
              />
              <div className="mt-1 text-[10px] leading-relaxed text-fg-dim">
                Tag unique pour cette version. CalVer auto-rempli.
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wider text-fg-muted">&nbsp;</label>
              <button
                type="button"
                onClick={handlePickFile}
                disabled={!!uploading || !selectedRepo}
                className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30 hover:bg-amber-400/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    {uploading.phase === "ensuring-release"
                      ? "Préparation…"
                      : `${uploading.pct.toFixed(0)} %`}
                  </>
                ) : (
                  <>
                    <Upload className="size-3" />
                    Upload sur GitHub
                  </>
                )}
              </button>
              {selectedRepo && repos.length > 0 && (
                <a
                  href={`https://github.com/${selectedRepo}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={async (e) => {
                    e.preventDefault();
                    const { openUrl } = await import("@tauri-apps/plugin-opener");
                    await openUrl(`https://github.com/${selectedRepo}`);
                  }}
                  className="mt-1 inline-flex items-center justify-center gap-1 text-[10px] text-fg-dim hover:text-fg-muted"
                >
                  <ExternalLink className="size-2.5" />
                  Ouvrir le repo
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {uploading && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${uploading.pct}%` }}
          />
        </div>
      )}

      {error && (
        <div
          className={cn(
            "mt-3 rounded-lg p-2 text-[11px]",
            error.startsWith("✓")
              ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30"
              : "bg-danger/10 text-danger ring-1 ring-danger/30",
          )}
        >
          {error}
        </div>
      )}

      <AnimatePresence>
        {showSetupModal && (
          <GithubSetupModal
            onClose={() => setShowSetupModal(false)}
            onConnected={async (u) => {
              setUser(u);
              setStatus("loggedin");
              setShowSetupModal(false);
              try {
                const { ghListRepos } = await import("@/lib/mcGithub");
                const rs = await ghListRepos();
                setRepos(rs);
                if (rs[0]) setSelectedRepo(rs[0].fullName);
              } catch {
                // Ignore — admin can paste owner/repo manually.
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One-time GitHub Personal Access Token setup. Modal with:
 *   1. A clickable link to github.com/settings/tokens with the right
 *      scopes pre-filled (so the user just clicks "Generate").
 *   2. A textarea to paste the resulting token.
 *   3. A submit button that validates via `gh_token_set` (which calls
 *      GET /user under the hood) and stores in the keyring.
 */
function GithubSetupModal({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (user: import("@/lib/mcGithub").GithubUser) => void;
}) {
  const [pat, setPat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openTokenPage = async () => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    // Pre-filled URL: classic PAT page with `public_repo` scope and a
    // friendly description. Fine-grained tokens would be more secure
    // but the UX for those is much heavier (per-repo selection +
    // expiry).
    await openUrl(
      "https://github.com/settings/tokens/new?description=Simple+Launcher+modpack+upload&scopes=public_repo,repo",
    );
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { ghTokenSet } = await import("@/lib/mcGithub");
      const user = await ghTokenSet(pat.trim());
      onConnected(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/80 backdrop-blur-sm p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="no-drag w-full max-w-2xl rounded-2xl bg-bg-soft p-6 ring-1 ring-amber-400/30"
      >
        <h3 className="font-display text-xl text-fg-primary">Configurer GitHub Releases</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Génère un Personal Access Token (PAT) sur GitHub avec le scope <code>public_repo</code>{" "}
          (ou <code>repo</code> si tu veux poster sur un repo privé), puis colle-le ci-dessous.
          Le token sera stocké chiffré dans le coffre-fort Windows.
        </p>

        <div className="mt-4 space-y-3 rounded-xl bg-bg-base/40 p-4 text-sm ring-1 ring-white/[0.06]">
          <ol className="ml-5 list-decimal space-y-1.5 text-fg-muted">
            <li>
              <button
                type="button"
                onClick={openTokenPage}
                className="text-amber-300 underline hover:text-amber-200"
              >
                Ouvrir la page « Generate new token » de GitHub
              </button>{" "}
              (déjà pré-remplie avec le bon scope)
            </li>
            <li>
              Vérifie que <code>public_repo</code> est coché (ou <code>repo</code> pour les
              repos privés)
            </li>
            <li>Choisis une expiration → clique <strong>Generate token</strong></li>
            <li>Copie le token (il commence par <code>ghp_</code>) et colle-le ci-dessous</li>
          </ol>
        </div>

        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-wider text-fg-muted">Personal Access Token</span>
          <textarea
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            rows={2}
            disabled={busy}
            className="mt-1.5 w-full rounded-xl bg-bg-base/60 px-3 py-2 text-xs font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-amber-400/50 focus:outline-none"
          />
        </label>

        {error && (
          <div className="mt-3 rounded-xl bg-danger/10 p-3 text-xs text-danger ring-1 ring-danger/30">
            <pre className="whitespace-pre-wrap break-words font-mono">{error}</pre>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !pat.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400/20 px-5 py-2 text-sm font-medium text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Validation…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" /> Connecter
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Inline button next to the modpack URL field. When clicked,
 * downloads the ZIP at `url`, finds `manifest.json`, and feeds the
 * parsed CurseForge metadata back via `onDetected` so the form
 * auto-populates MC version + loader. Useful when the admin pastes a
 * Discord / MediaFire / external link rather than uploading directly
 * (the upload path already triggers detection automatically).
 */
function DetectManifestButton({
  url,
  onDetected,
}: {
  url: string;
  onDetected: (m: import("@/lib/mcZip").CurseforgeManifestSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const { mcZipReadManifestUrl } = await import("@/lib/mcZip");
      const m = await mcZipReadManifestUrl(url);
      onDetected(m);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setShowErrorModal(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={error ? () => setShowErrorModal(true) : handleClick}
        disabled={busy || !url}
        title={
          error
            ? "Cliquer pour voir le détail de l'erreur"
            : "DL le ZIP + lit son manifest.json (CurseForge) pour pré-remplir MC version + loader"
        }
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 text-xs ring-1 transition-colors",
          error
            ? "bg-danger/10 text-danger ring-danger/30 hover:bg-danger/20"
            : "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30 hover:bg-emerald-400/20",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Lecture…
          </>
        ) : error ? (
          <>
            <AlertTriangle className="size-3" /> Voir l'erreur
          </>
        ) : (
          <>
            <Sparkles className="size-3" /> Détecter manifest
          </>
        )}
      </button>

      <AnimatePresence>
        {showErrorModal && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/80 backdrop-blur-sm p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowErrorModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="no-drag w-full max-w-3xl rounded-2xl bg-bg-soft p-6 ring-1 ring-danger/30 shadow-[0_0_60px_rgba(239,68,68,0.2)]"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 shrink-0 text-danger mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-xl text-fg-primary">
                    Détection du manifest échouée
                  </h3>
                  <p className="mt-1 text-sm text-fg-muted">
                    Le launcher a essayé de DL le fichier mais quelque chose a
                    foiré. Détails ci-dessous.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowErrorModal(false)}
                  className="text-fg-muted hover:text-fg-primary"
                >
                  ×
                </button>
              </div>

              <pre className="info-scroll mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg-base/60 p-4 font-mono text-[11px] leading-relaxed text-fg-primary ring-1 ring-white/[0.06]">
                {error}
              </pre>

              <div className="mt-4 rounded-xl bg-amber-400/[0.06] p-3 text-xs text-amber-200 ring-1 ring-amber-400/20">
                <p className="font-medium text-amber-100 mb-1">Pistes :</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>
                    <strong>Permissions</strong> : le partage doit être en{" "}
                    <em>« Toute personne »</em>, pas{" "}
                    <em>« Personnes avec accès existantes »</em>.
                  </li>
                  <li>
                    <strong>Pas un fichier CurseForge ?</strong> Si tu utilises
                    un ZIP hand-built (sans manifest.json), garde l'option «
                    ZIP custom » mais saisis MC version + loader manuellement
                    — la détection ne fonctionne que pour les exports CF.
                  </li>
                  <li>
                    <strong>Hôte non supporté</strong> : essaie de copier l'URL
                    dans un onglet privé du navigateur — si ça ne télécharge
                    pas direct sans login, le launcher ne pourra pas non plus.
                  </li>
                </ul>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setShowErrorModal(false);
                    void handleClick();
                  }}
                  className="rounded-xl bg-emerald-400/15 px-4 py-2 text-sm text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-400/25"
                >
                  Réessayer
                </button>
                <button
                  type="button"
                  onClick={() => setShowErrorModal(false)}
                  className="rounded-xl bg-bg-elevated/40 px-4 py-2 text-sm text-fg-muted ring-1 ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * File picker + upload progress for the *native* modpack overlay
 * (.mrpack or generic .zip). Uploads to Firebase Storage via the
 * shared `uploadModpackZip` flow and pre-fills `nativeModpackUrl` (and
 * `customZipUrl` for backwards-compat). Cosmetically simpler than the
 * legacy `ModpackZipPicker` because we don't show the URL on screen
 * (the URL lives in the Field above) — just a status row + a button.
 */
function NativeModpackUpload({
  accept,
  uploading,
  onPick,
  hasUrl,
  onClear,
}: {
  accept: string;
  uploading: { percent: number; uploaded: number; total: number } | null;
  onPick: (file: File) => void;
  hasUrl: boolean;
  onClear: () => void;
}) {
  const id = "native-modpack-zip-input";
  const sizeMb = (b: number) => (b / 1_048_576).toFixed(1);
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-3 transition-colors hover:border-emerald-400/40">
      <input
        type="file"
        id={id}
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
        className="hidden"
      />
      {uploading ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-fg-primary">Upload en cours…</span>
            <span className="text-fg-muted">
              {sizeMb(uploading.uploaded)} / {sizeMb(uploading.total)} Mo · {uploading.percent.toFixed(0)}%
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"
              animate={{ width: `${uploading.percent}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
            {hasUrl ? <CheckCircle2 className="size-4" /> : <Upload className="size-4" />}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-medium text-fg-primary">
              {hasUrl ? "Modpack uploadé sur Firebase Storage" : "Upload depuis ton PC"}
            </div>
            <div className="text-fg-muted">
              {hasUrl
                ? "URL pré-remplie ci-dessus. Tu peux remplacer ou retirer."
                : `Pick un fichier ${accept} → uploadé automatiquement, l'URL se remplit toute seule.`}
            </div>
          </div>
          <label
            htmlFor={id}
            className="no-drag shrink-0 cursor-pointer rounded-md bg-white/[0.04] px-3 py-1.5 text-xs text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
          >
            {hasUrl ? "Remplacer" : "Choisir un fichier"}
          </label>
          {hasUrl && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 rounded-md bg-white/[0.02] px-2.5 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.04] hover:bg-danger/10 hover:text-danger"
            >
              Retirer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
