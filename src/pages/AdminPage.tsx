import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  Folder,
  Hash,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
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
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { isAdmin } from "@/lib/admin";
import {
  deleteHostedZip,
  deleteModule,
  saveShortcutModule,
  uploadHostedModule,
  uploadModuleAsset,
  watchModules,
  type UploadProgress,
} from "@/firebase/modules";
import type { LauncherModule, ModulePage, ParticlesConfig, PageSection } from "@/types/module";
import { cn } from "@/lib/cn";

type ModuleType = "hosted" | "shortcut";
type ParticlesPreset = NonNullable<ParticlesConfig["preset"]> | "none";
type BgType = "none" | "image" | "video";

type FormState = {
  type: ModuleType;
  id: string;
  name: string;
  shortDescription: string;
  iconUrl: string;
  bannerUrl: string;
  version: string;
  executable: string;
  executablePath: string;
  args: string;
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
};

const EMPTY_FORM: FormState = {
  type: "shortcut",
  id: "",
  name: "",
  shortDescription: "",
  iconUrl: "",
  bannerUrl: "",
  version: "1.0.0",
  executable: "",
  executablePath: "",
  args: "",
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
  const [showCustom, setShowCustom] = useState(false);

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
  };

  const validate = (): string | null => {
    if (!form.id || !/^[a-z0-9-]+$/.test(form.id)) return "ID invalide (lowercase, chiffres, tirets uniquement)";
    if (!form.name) return "Nom obligatoire";
    if (form.type === "hosted") {
      if (!file) return "Fichier .zip obligatoire";
      if (!form.version || !/^\d+\.\d+\.\d+$/.test(form.version)) return "Version semver requise (ex: 1.0.0)";
      if (!form.executable) return "Nom de l'exécutable requis (ex: MyGame.exe)";
    } else {
      if (!form.executablePath) return "Chemin de l'exécutable requis";
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
      if (form.type === "shortcut") {
        const args = form.args.split(" ").filter(Boolean);
        await saveShortcutModule({
          type: "shortcut",
          id: form.id,
          name: form.name,
          ...(form.shortDescription && { shortDescription: form.shortDescription }),
          ...(form.iconUrl && { iconUrl: form.iconUrl }),
          ...(form.bannerUrl && { bannerUrl: form.bannerUrl }),
          executablePath: form.executablePath,
          ...(args.length > 0 && { args }),
          ...(page && { page }),
          ...(server && { server }),
        });
      } else {
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
      setFeedback({ kind: "ok", message: `Module "${form.name}" publié.` });
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

      <div className="grid grid-cols-12 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-12 rounded-3xl glass-strong p-7 lg:col-span-7"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
              <Plus className="size-5" />
            </div>
            <div className="font-display text-2xl text-fg-primary">Nouveau module</div>
          </div>

          <TypeSwitch value={form.type} onChange={(v) => updateForm("type", v)} />

          <div className="mt-6 grid gap-4">
            <Field label="ID (slug)" hint="minuscules, chiffres, tirets · ex: mancho-land">
              <Input value={form.id} onChange={(v) => updateForm("id", v)} placeholder="mon-jeu" />
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
              </>
            ) : (
              <>
                <Field label="Chemin local de l'exécutable" hint="ex: C:\\Games\\Minecraft\\launcher.exe" icon={Folder}>
                  <Input
                    value={form.executablePath}
                    onChange={(v) => updateForm("executablePath", v)}
                    placeholder="C:\\…"
                    mono
                  />
                </Field>
                <Field label="Arguments (optionnel)" hint="séparés par des espaces">
                  <Input value={form.args} onChange={(v) => updateForm("args", v)} placeholder="--fullscreen" />
                </Field>
              </>
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
              {submitting ? "Publication…" : form.type === "hosted" ? "Uploader & publier" : "Publier"}
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
          className="col-span-12 lg:col-span-5"
        >
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-fg-muted">
            <Cloud className="size-3" />
            Modules publiés ({modules.length})
          </div>
          <div className="space-y-3">
            {modules.length === 0 && (
              <div className="rounded-2xl glass p-6 text-center text-sm text-fg-muted">
                Aucun module pour l'instant. Crée le premier à gauche.
              </div>
            )}
            {modules.map((m) => (
              <ModuleCard key={m.id} module={m} onDelete={() => handleDelete(m)} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function TypeSwitch({ value, onChange }: { value: ModuleType; onChange: (v: ModuleType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1.5 ring-1 ring-white/[0.06]">
      {(["shortcut", "hosted"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            value === t ? "text-bg-base" : "text-fg-muted hover:text-fg-primary",
          )}
        >
          {value === t && (
            <motion.div
              layoutId="type-pill"
              className="absolute inset-0 rounded-lg bg-accent shadow-[0_0_18px_var(--color-accent-soft)]"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">{t === "shortcut" ? "Raccourci local" : "Hébergé sur Firebase"}</span>
        </button>
      ))}
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]",
        mono && "font-mono text-xs",
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

function ModuleCard({ module, onDelete }: { module: LauncherModule; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group flex items-center gap-4 rounded-2xl glass p-4"
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
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1",
              module.type === "hosted"
                ? "bg-accent/10 text-accent ring-accent/30"
                : "bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30",
            )}
          >
            {module.type === "hosted" ? `v${module.version}` : "Local"}
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
      <button
        onClick={onDelete}
        className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <Trash2 className="size-4" />
      </button>
    </motion.div>
  );
}
