import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  X,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Palette,
  Sparkles,
  Upload,
  Wand2,
  Server,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Save,
  Plus,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import {
  saveUserShortcut,
  deleteUserShortcut,
  uploadShortcutAsset,
  type ShortcutModule,
} from "@/firebase/shortcuts";
import type { ModulePage, ParticlesConfig } from "@/types/module";
import { ModuleParticles } from "@/components/ui/Particles";
import { cn } from "@/lib/cn";

type ParticlesPreset = NonNullable<ParticlesConfig["preset"]> | "none";

type FormState = {
  id: string;
  name: string;
  shortDescription: string;
  iconUrl: string;
  bannerUrl: string;
  executablePath: string;
  args: string;
  themePrimary: string;
  themeAccent: string;
  fontDisplay: string;
  particlesPreset: ParticlesPreset;
  particlesColor: string;
  particlesDensity: number;
  serverAddress: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  shortDescription: "",
  iconUrl: "",
  bannerUrl: "",
  executablePath: "",
  args: "",
  themePrimary: "",
  themeAccent: "",
  fontDisplay: "",
  particlesPreset: "none",
  particlesColor: "#00d4ff",
  particlesDensity: 60,
  serverAddress: "",
};

function fromShortcut(sc: ShortcutModule): FormState {
  const page = sc.page;
  const bg = page?.background && "particles" in page.background ? page.background.particles : undefined;
  return {
    id: sc.id,
    name: sc.name,
    shortDescription: sc.shortDescription ?? "",
    iconUrl: sc.iconUrl ?? "",
    bannerUrl: sc.bannerUrl ?? "",
    executablePath: sc.executablePath,
    args: (sc.args ?? []).join(" "),
    themePrimary: page?.theme?.primary ?? "",
    themeAccent: page?.theme?.accent ?? "",
    fontDisplay: page?.theme?.fontDisplay ?? "",
    particlesPreset: bg?.preset ?? "none",
    particlesColor: bg?.color ?? "#00d4ff",
    particlesDensity: bg?.density ?? 60,
    serverAddress: sc.server?.type === "minecraft" ? sc.server.address : "",
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildShortcut(uid: string, form: FormState): ShortcutModule {
  const args = form.args.split(" ").filter(Boolean);
  const theme: ModulePage["theme"] = {};
  if (form.themePrimary) theme.primary = form.themePrimary;
  if (form.themeAccent) theme.accent = form.themeAccent;
  if (form.fontDisplay) theme.fontDisplay = form.fontDisplay;

  const particles =
    form.particlesPreset !== "none"
      ? { preset: form.particlesPreset, color: form.particlesColor, density: form.particlesDensity }
      : undefined;

  let background: ModulePage["background"] | undefined;
  if (particles) {
    background = { type: "image", url: form.bannerUrl || "", particles };
  }

  const page: ModulePage = {};
  if (Object.keys(theme).length > 0) page.theme = theme;
  if (background) page.background = background;

  const id = form.id || slugify(form.name) || `shortcut-${Date.now()}`;
  const out: ShortcutModule = {
    type: "shortcut",
    id,
    name: form.name,
    executablePath: form.executablePath,
    ...(form.shortDescription && { shortDescription: form.shortDescription }),
    ...(form.iconUrl && { iconUrl: form.iconUrl }),
    ...(form.bannerUrl && { bannerUrl: form.bannerUrl }),
    ...(args.length > 0 && { args }),
    ...(Object.keys(page).length > 0 && { page }),
    ...(form.serverAddress && {
      server: { type: "minecraft" as const, address: form.serverAddress.trim() },
    }),
  };
  void uid; // ownership is encoded via Firestore path
  return out;
}

export function ShortcutForm({
  initial,
  onClose,
}: {
  initial?: ShortcutModule;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState<FormState>(initial ? fromShortcut(initial) : EMPTY_FORM);
  const [iconUploading, setIconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initial;

  // Auto-derive ID from name when creating
  useEffect(() => {
    if (!isEdit && !form.id && form.name) {
      setForm((f) => ({ ...f, id: slugify(f.name) }));
    }
  }, [form.name, form.id, isEdit]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const previewModule = useMemo(() => (user ? buildShortcut(user.uid, form) : null), [user, form]);

  const validate = (): string | null => {
    if (!form.name.trim()) return "Le nom est obligatoire";
    if (!form.executablePath.trim()) return "Le chemin de l'exécutable est obligatoire";
    if (!/\.(exe|bat|cmd|lnk)$/i.test(form.executablePath.trim())) {
      return "Le chemin doit pointer vers un .exe (ou .bat / .cmd / .lnk)";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!user) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const shortcut = buildShortcut(user.uid, form);
      await saveUserShortcut(user.uid, shortcut);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !initial) return;
    if (!confirm(`Supprimer le raccourci "${initial.name}" ? Cette action est irréversible.`)) return;
    try {
      await deleteUserShortcut(user.uid, initial.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const uploadAsset = async (kind: "icon" | "banner", file: File) => {
    if (!user) return;
    const id = form.id || slugify(form.name);
    if (!id) {
      setError("Renseigne d'abord le nom du raccourci.");
      return;
    }
    const setUploading = kind === "icon" ? setIconUploading : setBannerUploading;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadShortcutAsset(user.uid, id, kind, file);
      update(kind === "icon" ? "iconUrl" : "bannerUrl", url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-stretch justify-center bg-bg-base/80 p-6 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 30, scale: 0.96 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 30, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 280, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="no-drag flex w-full max-w-6xl overflow-hidden rounded-3xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        >
          {/* Form side */}
          <div className="flex max-h-[90vh] flex-1 flex-col overflow-y-auto p-7">
            <header className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
                  {isEdit ? <Wand2 className="size-5" /> : <Plus className="size-5" />}
                </div>
                <h2 className="font-display text-2xl text-fg-primary">
                  {isEdit ? "Modifier le raccourci" : "Ajouter un jeu"}
                </h2>
              </div>
              <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary">
                <X className="size-5" />
              </button>
            </header>

            <div className="grid gap-4">
              <Field label="Nom du jeu">
                <Input value={form.name} onChange={(v) => update("name", v)} placeholder="Mon Jeu" />
              </Field>
              <Field label="Description courte">
                <Input
                  value={form.shortDescription}
                  onChange={(v) => update("shortDescription", v)}
                  placeholder="Une phrase qui décrit le jeu"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <ImageField
                  label="Icône"
                  url={form.iconUrl}
                  uploading={iconUploading}
                  onPick={(f) => uploadAsset("icon", f)}
                  onClear={() => update("iconUrl", "")}
                />
                <ImageField
                  label="Bannière"
                  hint="16:9 idéal"
                  url={form.bannerUrl}
                  uploading={bannerUploading}
                  onPick={(f) => uploadAsset("banner", f)}
                  onClear={() => update("bannerUrl", "")}
                />
              </div>

              <Field label="Exécutable du jeu" icon={Folder} hint=".exe à lancer">
                <ExePicker
                  value={form.executablePath}
                  onChange={(v) => update("executablePath", v)}
                  defaultName={form.name}
                />
              </Field>
              <Field label="Arguments (optionnel)" hint="séparés par des espaces">
                <Input
                  value={form.args}
                  onChange={(v) => update("args", v)}
                  placeholder="--fullscreen"
                />
              </Field>

              <SectionLabel icon={Palette} title="Couleurs personnalisées" />
              <div className="grid grid-cols-2 gap-4">
                <ColorField label="Couleur primaire" value={form.themePrimary} onChange={(v) => update("themePrimary", v)} />
                <ColorField label="Couleur accent" value={form.themeAccent} onChange={(v) => update("themeAccent", v)} />
              </div>
              <Field label="Police titre (optionnel)">
                <Input value={form.fontDisplay} onChange={(v) => update("fontDisplay", v)} placeholder="Audiowide" />
              </Field>

              <SectionLabel icon={Sparkles} title="Particules" />
              <PresetSelect value={form.particlesPreset} onChange={(v) => update("particlesPreset", v)} />
              {form.particlesPreset !== "none" && (
                <div className="grid grid-cols-2 gap-4">
                  <ColorField
                    label="Couleur"
                    value={form.particlesColor}
                    onChange={(v) => update("particlesColor", v)}
                  />
                  <Field label="Densité" hint={`${form.particlesDensity}`}>
                    <input
                      type="range"
                      min={20}
                      max={200}
                      value={form.particlesDensity}
                      onChange={(e) => update("particlesDensity", Number(e.target.value))}
                      className="no-drag w-full accent-[var(--color-accent)]"
                    />
                  </Field>
                </div>
              )}

              <SectionLabel icon={Server} title="Serveur Minecraft (optionnel)" />
              <Field label="Adresse" hint="ex: play.example.com">
                <Input
                  value={form.serverAddress}
                  onChange={(v) => update("serverAddress", v)}
                  placeholder="play.example.com"
                  mono
                />
              </Field>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 flex items-start gap-3 rounded-xl bg-danger/10 p-3 text-sm text-fg-primary ring-1 ring-danger/30"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={2.5} />
                <p>{error}</p>
              </motion.div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-medium text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_36px_var(--color-accent-glow)] disabled:opacity-50"
              >
                {submitting ? (
                  "Enregistrement…"
                ) : isEdit ? (
                  <>
                    <Save className="size-4" /> Enregistrer
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Créer le raccourci
                  </>
                )}
              </button>
              {isEdit && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger ring-1 ring-danger/30 transition-colors hover:bg-danger/20"
                >
                  <Trash2 className="size-4" />
                  Supprimer
                </button>
              )}
            </div>
          </div>

          {/* Preview side */}
          <div className="hidden w-[420px] shrink-0 border-l border-white/[0.06] bg-bg-base/40 p-7 lg:block">
            <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
              <Sparkles className="size-3" /> Aperçu en temps réel
            </div>
            {previewModule && <PreviewCard module={previewModule} />}
            <p className="mt-5 text-xs text-fg-muted leading-relaxed">
              C'est le rendu exact qui apparaîtra dans ta bibliothèque. Joue avec les couleurs, particules, et bannière jusqu'à obtenir le look voulu — c'est privé, seul toi vois ce raccourci.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PreviewCard({ module }: { module: ShortcutModule }) {
  const themePrimary = module.page?.theme?.primary;
  const fontDisplay = module.page?.theme?.fontDisplay;
  const particles =
    module.page?.background && "particles" in module.page.background
      ? module.page.background.particles
      : undefined;

  return (
    <div
      className="relative aspect-[4/5] overflow-hidden rounded-2xl glass"
      style={
        themePrimary
          ? ({
              ["--module-primary" as string]: themePrimary,
              boxShadow: `inset 0 0 30px ${themePrimary}33`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {module.bannerUrl ? (
        <img src={module.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: themePrimary
              ? `linear-gradient(135deg, ${themePrimary}40, transparent 60%, ${themePrimary}20)`
              : "linear-gradient(135deg, var(--color-accent-soft), transparent 60%, var(--color-accent-soft))",
          }}
        />
      )}

      {particles && <ModuleParticles config={particles} />}

      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex justify-start p-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-fuchsia-300 ring-1 ring-fuchsia-500/30 backdrop-blur-md">
          Local
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        {module.iconUrl && (
          <img src={module.iconUrl} alt="" className="mb-2 size-10 rounded-lg ring-1 ring-white/10" />
        )}
        <div
          className="text-base font-semibold text-fg-primary line-clamp-1"
          style={fontDisplay ? { fontFamily: fontDisplay } : undefined}
        >
          {module.name || "Sans nom"}
        </div>
        {module.shortDescription && (
          <p className="mt-0.5 text-xs text-fg-muted line-clamp-2">{module.shortDescription}</p>
        )}
        <div className="mt-3">
          <button
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{
              background: themePrimary ?? "var(--color-accent)",
              color: "var(--color-bg-base)",
              boxShadow: `0 0 20px ${themePrimary ?? "var(--color-accent-soft)"}66`,
            }}
          >
            Jouer
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04]" />
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
  icon?: typeof Folder;
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

function SectionLabel({ icon: Icon, title }: { icon: typeof Palette; title: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 border-b border-white/[0.04] pb-2 text-xs uppercase tracking-[0.2em] text-accent">
      <Icon className="size-3" /> {title}
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

function ExePicker({
  value,
  onChange,
  defaultName,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultName?: string;
}) {
  const [picking, setPicking] = useState(false);

  const fileName = value ? value.split(/[\\/]/).pop() : "";

  const pick = async () => {
    setPicking(true);
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: defaultName ? `Choisir l'exécutable de ${defaultName}` : "Choisir un exécutable",
        filters: [
          { name: "Exécutables Windows", extensions: ["exe", "bat", "cmd", "lnk"] },
          { name: "Tous les fichiers", extensions: ["*"] },
        ],
      });
      if (typeof selected === "string" && selected.length > 0) {
        onChange(selected);
      }
    } catch (e) {
      console.warn("[exe picker] failed:", e);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-3 transition-colors hover:border-accent/40">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <FolderOpen className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        {value ? (
          <>
            <div className="truncate text-sm text-fg-primary">{fileName}</div>
            <div className="truncate font-mono text-[10px] text-fg-dim">{value}</div>
          </>
        ) : (
          <>
            <div className="text-sm text-fg-primary">Aucun fichier sélectionné</div>
            <div className="text-xs text-fg-muted">Clique sur Parcourir pour choisir un .exe</div>
          </>
        )}
      </div>
      {value && (
        <button
          onClick={() => onChange("")}
          type="button"
          className="rounded-md bg-white/[0.02] px-2 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.04] transition-colors hover:bg-danger/10 hover:text-danger"
        >
          ×
        </button>
      )}
      <button
        onClick={pick}
        disabled={picking}
        type="button"
        className="no-drag inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-bg-base shadow-[0_0_16px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_22px_var(--color-accent-glow)] disabled:opacity-60"
      >
        <FolderOpen className="size-3.5" />
        {picking ? "…" : "Parcourir"}
      </button>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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

function PresetSelect({ value, onChange }: { value: ParticlesPreset; onChange: (v: ParticlesPreset) => void }) {
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

function ImageField({
  label,
  hint,
  url,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  hint?: string;
  url: string;
  uploading: boolean;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const id = `shortcut-img-${label}`;
  return (
    <Field label={label} hint={hint} icon={ImageIcon}>
      <div className="flex h-[100px] items-center gap-3 overflow-hidden rounded-xl border border-dashed border-white/10 bg-bg-base/30 p-3 transition-colors hover:border-accent/40">
        <input
          type="file"
          id={id}
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
          className="hidden"
        />
        {url ? (
          <>
            <img src={url} alt="" className="h-full aspect-square rounded-lg object-cover ring-1 ring-white/10" />
            <div className="flex flex-1 flex-col gap-1.5">
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
              <div className="text-sm text-fg-primary">{uploading ? "Upload…" : "Choisir"}</div>
              <div className="text-xs text-fg-muted">PNG / JPG / WebP / GIF</div>
            </div>
          </label>
        )}
      </div>
    </Field>
  );
}
