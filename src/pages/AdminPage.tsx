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
  Wand2,
  Server,
  Activity,
  Layout,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { NewsManager } from "@/components/admin/NewsManager";
import { CrewsManager } from "@/components/admin/CrewsManager";
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
  watchModules,
  watchModuleVersions,
  type ModuleVersionRecord,
  type UploadProgress,
} from "@/firebase/modules";
import type { LauncherModule, ModulePage, ParticlesConfig, PageSection } from "@/types/module";
import { isModulePageV2 } from "@/types/module";
import { ModulePreviewCard } from "@/components/library/ModulePreviewCard";
import { RamSlider } from "@/components/library/RamSlider";
import { cn } from "@/lib/cn";

type ParticlesPreset = NonNullable<ParticlesConfig["preset"]> | "none";
type BgType = "none" | "image" | "video";
type ModuleType = "hosted" | "minecraft";
type ModLoader = "" | "forge" | "fabric" | "quilt" | "neoforge";
type McSource = "curseforge" | "manual";

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
  mcSource: McSource;
  curseforgeProjectId: string;
  curseforgeFileId: string;
  customZipUrl: string;
  customZipSize: number;
  minecraftVersion: string;
  modLoader: ModLoader;
  // Heap allocation in MiB. 0 = "let Prism decide" (default).
  maxRamMb: number;
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
  mcSource: "manual",
  curseforgeProjectId: "",
  curseforgeFileId: "",
  customZipUrl: "",
  customZipSize: 0,
  minecraftVersion: "",
  modLoader: "",
  maxRamMb: 4096,
};

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [modules, setModules] = useState<LauncherModule[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [modpackUploading, setModpackUploading] = useState<{ percent: number; uploaded: number; total: number } | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isEditing = editingId !== null;

  useEffect(() => {
    return watchModules(setModules);
  }, []);

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
    setShowCustom(false);
    setEditingId(null);
  };

  const startEdit = (m: LauncherModule) => {
    if (m.type === "shortcut") return; // shortcuts are user-side
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
      mcSource: m.type === "minecraft" && m.customZipUrl ? "manual" : "curseforge",
      curseforgeProjectId: m.type === "minecraft" && m.curseforgeProjectId ? String(m.curseforgeProjectId) : "",
      curseforgeFileId: m.type === "minecraft" && m.curseforgeFileId ? String(m.curseforgeFileId) : "",
      customZipUrl: m.type === "minecraft" ? m.customZipUrl ?? "" : "",
      customZipSize: m.type === "minecraft" ? m.customZipSize ?? 0 : 0,
      minecraftVersion: m.type === "minecraft" ? m.minecraftVersion ?? "" : "",
      modLoader: m.type === "minecraft" ? ((m.modLoader ?? "") as ModLoader) : "",
      maxRamMb: m.type === "minecraft" ? m.maxRamMb ?? 4096 : 4096,
    });
    setFile(null);
    setProgress(null);
    setShowCustom(true);
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
      if (form.mcSource === "curseforge") {
        if (!/^\d+$/.test(form.curseforgeProjectId)) return "Project ID CurseForge invalide (numérique)";
        if (!/^\d+$/.test(form.curseforgeFileId)) return "File ID CurseForge invalide (numérique)";
      } else {
        if (!form.customZipUrl) return "Upload un .zip de modpack ou choisis « API CurseForge »";
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
        const useManual = form.mcSource === "manual";
        await saveMinecraftModule({
          type: "minecraft",
          id: form.id,
          name: form.name,
          ...(form.shortDescription && { shortDescription: form.shortDescription }),
          ...(form.iconUrl && { iconUrl: form.iconUrl }),
          ...(form.bannerUrl && { bannerUrl: form.bannerUrl }),
          ...(useManual
            ? { customZipUrl: form.customZipUrl, customZipSize: form.customZipSize }
            : {
                curseforgeProjectId: parseInt(form.curseforgeProjectId, 10),
                curseforgeFileId: parseInt(form.curseforgeFileId, 10),
              }),
          ...(form.minecraftVersion && { minecraftVersion: form.minecraftVersion }),
          ...(form.modLoader && { modLoader: form.modLoader }),
          ...(form.maxRamMb >= 512 && { maxRamMb: form.maxRamMb }),
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
    setModpackUploading({ percent: 0, uploaded: 0, total: uploadedFile.size });
    setFeedback(null);
    try {
      const { url, size } = await uploadModpackZip(form.id, uploadedFile, (p) => {
        setModpackUploading({ percent: p.percent, uploaded: p.bytesUploaded, total: p.bytesTotal });
      });
      updateForm("customZipUrl", url);
      updateForm("customZipSize", size);
      setFeedback({ kind: "ok", message: `Modpack uploadé (${(size / 1_048_576).toFixed(1)} Mo). Pense à publier pour que tes potes le voient.` });
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

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10 flex items-end justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
            <Shield className="size-3" /> Administration
          </p>
          <h1 className="mt-2 font-display text-5xl text-fg-primary">Modules</h1>
          <p className="mt-2 text-sm text-fg-muted">Crée, met à jour et supprime les jeux disponibles dans le launcher.</p>
        </div>
      </motion.div>

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

      {/* News broadcast manager — admin-only, edits propagate live to every
          launcher home page via Firestore onSnapshot. */}
      {!isEditing && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="my-8"
        >
          <NewsManager />
        </motion.div>
      )}

      {!isEditing && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="my-8"
        >
          <CrewsManager />
        </motion.div>
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
                  Builder visuel drag &amp; drop : hero parallax, screenshots, vidéos, textes stylisés, timeline, comparateur avant/après, etc. — 19 types de blocs paramétrables.
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

          <button
            onClick={() => setShowCustom((v) => !v)}
            className="mt-6 flex w-full items-center gap-2 rounded-xl bg-accent/[0.06] px-4 py-2.5 text-sm text-accent ring-1 ring-accent/20 transition-colors hover:bg-accent/[0.1]"
          >
            <Wand2 className="size-4" />
            Personnalisation de la page module {showCustom ? "—" : "+"}
          </button>

          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-5 grid gap-5 rounded-2xl bg-bg-base/30 p-5 ring-1 ring-white/[0.04]">
                  <SectionHeader icon={Palette} title="Thème" />
                  <div className="grid grid-cols-2 gap-4">
                    <ColorField label="Couleur primaire" value={form.themePrimary} onChange={(v) => updateForm("themePrimary", v)} />
                    <ColorField label="Couleur accent" value={form.themeAccent} onChange={(v) => updateForm("themeAccent", v)} />
                  </div>
                  <Field label="Police titre (optionnel)" hint="ex: Audiowide, Orbitron…">
                    <Input value={form.fontDisplay} onChange={(v) => updateForm("fontDisplay", v)} placeholder="Audiowide" />
                  </Field>

                  <SectionHeader icon={Sparkles} title="Particules" />
                  <div className="grid gap-3">
                    <PresetSelect value={form.particlesPreset} onChange={(v) => updateForm("particlesPreset", v)} />
                    {form.particlesPreset !== "none" && (
                      <div className="grid grid-cols-2 gap-4">
                        <ColorField label="Couleur" value={form.particlesColor} onChange={(v) => updateForm("particlesColor", v)} />
                        <Field label="Densité" hint="20–200">
                          <input
                            type="range"
                            min={20}
                            max={200}
                            value={form.particlesDensity}
                            onChange={(e) => updateForm("particlesDensity", Number(e.target.value))}
                            className="no-drag w-full accent-[var(--color-accent)]"
                          />
                          <div className="mt-1 text-xs text-fg-muted">{form.particlesDensity} particules</div>
                        </Field>
                      </div>
                    )}
                  </div>

                  <SectionHeader icon={ImageIcon} title="Background hero" />
                  <BgTypeSelect value={form.bgType} onChange={(v) => updateForm("bgType", v)} />
                  {form.bgType !== "none" && (
                    <Field
                      label={form.bgType === "video" ? "URL vidéo (mp4/webm)" : "URL image"}
                      hint="optionnel · sinon utilise la bannière"
                      icon={LinkIcon}
                    >
                      <Input value={form.bgUrl} onChange={(v) => updateForm("bgUrl", v)} placeholder="https://…" />
                    </Field>
                  )}

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

                  <SectionHeader icon={ImageIcon} title="Captures d'écran" />
                  <Field label="URLs d'images" hint="une URL par ligne · grille auto sur la page module">
                    <Textarea
                      value={form.screenshots}
                      onChange={(v) => updateForm("screenshots", v)}
                      rows={3}
                      placeholder={"https://example.com/screen1.png\nhttps://example.com/screen2.png"}
                    />
                  </Field>

                  <SectionHeader icon={Activity} title="Stats" />
                  <Field label="Lignes label = valeur" hint="ex: Joueurs = 1k+">
                    <Textarea
                      value={form.stats}
                      onChange={(v) => updateForm("stats", v)}
                      rows={3}
                      placeholder={"Joueurs = 1k+\nVersion = 1.20.4\nUptime = 99.9%"}
                    />
                  </Field>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
    { value: "minecraft", label: "Minecraft", hint: "Modpack CurseForge via Prism" },
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
  const handleUrlPaste = (raw: string) => {
    const match = /\/files\/(\d+)/.exec(raw);
    if (match) updateForm("curseforgeFileId", match[1]);
  };

  const loaders: { value: ModLoader; label: string }[] = [
    { value: "", label: "—" },
    { value: "forge", label: "Forge" },
    { value: "fabric", label: "Fabric" },
    { value: "neoforge", label: "NeoForge" },
    { value: "quilt", label: "Quilt" },
  ];

  const sources: { value: McSource; label: string; hint: string }[] = [
    { value: "manual", label: "Upload manuel (fat-zip)", hint: "Aucune UI Prism, mods bundled" },
    { value: "curseforge", label: "API CurseForge", hint: "Récupéré via Project + File ID" },
  ];

  return (
    <div className="grid gap-4 rounded-2xl bg-bg-base/30 p-5 ring-1 ring-white/[0.04]">
      <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 text-xs uppercase tracking-[0.2em] text-accent">
        <Cloud className="size-3" /> Source du modpack
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.06]">
        {sources.map((s) => (
          <button
            key={s.value}
            onClick={() => updateForm("mcSource", s.value)}
            className={cn(
              "relative rounded-lg px-3 py-2.5 text-left transition-colors",
              form.mcSource === s.value ? "text-bg-base" : "text-fg-muted hover:text-fg-primary",
            )}
          >
            {form.mcSource === s.value && (
              <motion.div
                layoutId="mc-source-pill"
                className="absolute inset-0 rounded-lg bg-accent shadow-[0_0_18px_var(--color-accent-soft)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 block text-sm font-medium">{s.label}</span>
            <span className={cn("relative z-10 block text-xs", form.mcSource === s.value ? "text-bg-base/70" : "text-fg-dim")}>
              {s.hint}
            </span>
          </button>
        ))}
      </div>

      {form.mcSource === "manual" ? (
        <ModpackZipPicker
          currentUrl={form.customZipUrl}
          currentSize={form.customZipSize}
          uploading={modpackUploading}
          onPick={onUploadModpack}
          onClear={() => {
            updateForm("customZipUrl", "");
            updateForm("customZipSize", 0);
          }}
        />
      ) : (
        <>
          <Field label="URL du fichier modpack" hint="optionnel · auto-extrait le File ID">
            <Input
              value=""
              onChange={handleUrlPaste}
              placeholder="https://www.curseforge.com/minecraft/modpacks/.../files/6051892"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project ID" hint="numérique · cf. About Project sur CF">
              <Input
                value={form.curseforgeProjectId}
                onChange={(v) => updateForm("curseforgeProjectId", v.replace(/\D/g, ""))}
                placeholder="520914"
                mono
              />
            </Field>
            <Field label="File ID" hint="version spécifique du modpack">
              <Input
                value={form.curseforgeFileId}
                onChange={(v) => updateForm("curseforgeFileId", v.replace(/\D/g, ""))}
                placeholder="6051892"
                mono
              />
            </Field>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Version Minecraft" hint="affichage uniquement">
          <Input value={form.minecraftVersion} onChange={(v) => updateForm("minecraftVersion", v)} placeholder="1.20.1" />
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

      <RamSlider value={form.maxRamMb} onChange={(v) => updateForm("maxRamMb", v)} />

      {form.mcSource === "manual" ? (
        <div className="space-y-2 text-xs leading-relaxed text-fg-dim">
          <p>
            📦 Upload un <strong className="text-fg-muted">« fat zip »</strong> contenant l'export CurseForge <em>plus les .jar des mods bundled directement dedans</em>. Le launcher écrit l'instance Prism (instance.cfg + mmc-pack.json) lui-même et copie les mods : <strong className="text-fg-muted">aucune fenêtre Prism, aucun popup navigateur, aucun appel CurseForge</strong> — tes potes voient juste la barre de progression du launcher puis MC qui démarre.
          </p>
          <p>
            Structure attendue à la racine du <code>.zip</code> :
          </p>
          <ul className="ml-4 list-disc space-y-0.5 font-mono text-[11px] text-fg-muted">
            <li><code>manifest.json</code> <span className="font-sans text-fg-dim">— pour la version MC + le mod loader</span></li>
            <li><code>overrides/mods/*.jar</code> <span className="font-sans text-fg-dim">— les fichiers .jar de tous les mods (à copier depuis ton install qui marche)</span></li>
            <li><code>overrides/config/</code>, <code>overrides/resourcepacks/</code>, <code>overrides/shaderpacks/</code>… <span className="font-sans text-fg-dim">— le reste du contenu CF normal</span></li>
          </ul>
          <p className="text-fg-dim">
            ⚠ <strong className="text-fg-muted">Les <code>files[]</code> du manifest sont ignorés</strong> en mode manuel : si un mod n'est pas bundled dans <code>overrides/mods/</code>, il sera absent de l'instance.
          </p>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-fg-dim">
          ⚠ Marche uniquement si <strong className="text-fg-muted">tous</strong> les mods autorisent la distribution tiers. Si tu hits un 403, bascule sur « Upload manuel » (fat zip).
        </p>
      )}
    </div>
  );
}

function ModpackZipPicker({
  currentUrl,
  currentSize,
  uploading,
  onPick,
  onClear,
}: {
  currentUrl: string;
  currentSize: number;
  uploading: { percent: number; uploaded: number; total: number } | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const id = "modpack-zip-input";
  const sizeMb = (b: number) => (b / 1_048_576).toFixed(1);
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-4 transition-colors hover:border-accent/40">
      <input
        type="file"
        id={id}
        accept=".zip,application/zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
        className="hidden"
      />
      {uploading ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-fg-primary">Upload du modpack…</span>
            <span className="text-fg-muted">
              {sizeMb(uploading.uploaded)} / {sizeMb(uploading.total)} Mo · {uploading.percent.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full bg-accent shadow-[0_0_12px_var(--color-accent-glow)]"
              animate={{ width: `${uploading.percent}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>
      ) : currentUrl ? (
        /* min-w-0 on the flex container itself + on the text wrapper is what
           lets the row shrink correctly; without it, intrinsic content sizing
           (especially long Firebase Storage URLs) was forcing the form column
           to grow past its 7/12 grid track and bleed into the preview. */
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-success/15 text-success ring-1 ring-success/30">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fg-primary">
              Modpack uploadé{currentSize > 0 ? ` (${sizeMb(currentSize)} Mo)` : ""}
            </div>
            {/* No more raw Firebase URL on screen — that 200-char string was
                wrecking the layout. The hover-only tooltip keeps it accessible
                for admins who actually want to copy the URL. */}
            <div
              className="truncate text-xs text-fg-muted"
              title={currentUrl}
            >
              hébergé sur Firebase Storage
            </div>
          </div>
          <label
            htmlFor={id}
            className="no-drag shrink-0 cursor-pointer rounded-md bg-white/[0.04] px-3 py-1.5 text-xs text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
          >
            Remplacer
          </label>
          <button
            onClick={onClear}
            type="button"
            className="shrink-0 rounded-md bg-white/[0.02] px-2.5 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.04] transition-colors hover:bg-danger/10 hover:text-danger"
          >
            Retirer
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="no-drag flex cursor-pointer items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
              <Upload className="size-5" />
            </div>
            <div>
              <div className="text-sm text-fg-primary">Upload du fat-zip modpack</div>
              <div className="text-xs text-fg-muted">manifest.json + overrides/ (mods bundled inclus)</div>
            </div>
          </div>
          <span className="rounded-md bg-white/[0.04] px-3 py-1.5 text-xs text-fg-primary ring-1 ring-white/[0.06]">Parcourir</span>
        </label>
      )}
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
  hint?: string;
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

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint="hex">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#00d4ff"}
          onChange={(e) => onChange(e.target.value)}
          className="no-drag size-10 cursor-pointer rounded-lg bg-bg-base/40 ring-1 ring-white/[0.06]"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#00d4ff"
          className="no-drag flex-1 rounded-lg bg-bg-base/40 px-3 py-2 font-mono text-xs text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            type="button"
            className="rounded-lg bg-white/[0.03] px-2 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
          >
            ×
          </button>
        )}
      </div>
    </Field>
  );
}

function PresetSelect({
  value,
  onChange,
}: {
  value: ParticlesPreset;
  onChange: (v: ParticlesPreset) => void;
}) {
  const presets: { value: ParticlesPreset; label: string }[] = [
    { value: "none", label: "Aucune" },
    { value: "stars", label: "Étoiles" },
    { value: "snow", label: "Neige" },
    { value: "fireflies", label: "Lucioles" },
    { value: "sparkles", label: "Étincelles" },
  ];
  return (
    <div className="grid grid-cols-5 gap-1 rounded-xl bg-bg-base/40 p-1 ring-1 ring-white/[0.06]">
      {presets.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
            value === p.value ? "bg-accent text-bg-base" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function BgTypeSelect({ value, onChange }: { value: BgType; onChange: (v: BgType) => void }) {
  const types: { value: BgType; label: string }[] = [
    { value: "none", label: "Aucun (utilise la bannière)" },
    { value: "image", label: "Image" },
    { value: "video", label: "Vidéo" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-bg-base/40 p-1 ring-1 ring-white/[0.06]">
      {types.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
            value === t.value ? "bg-accent text-bg-base" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
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

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="no-drag w-full resize-none rounded-lg bg-bg-base/40 px-3.5 py-2.5 font-mono text-xs text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
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
