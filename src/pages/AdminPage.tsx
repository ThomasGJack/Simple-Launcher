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
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { isAdmin } from "@/lib/admin";
import {
  deleteHostedZip,
  deleteModule,
  saveShortcutModule,
  uploadHostedModule,
  watchModules,
  type UploadProgress,
} from "@/firebase/modules";
import type { LauncherModule } from "@/types/module";
import { cn } from "@/lib/cn";

type ModuleType = "hosted" | "shortcut";
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
};

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [modules, setModules] = useState<LauncherModule[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

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

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setFeedback({ kind: "error", message: err });
      return;
    }
    setFeedback(null);
    setSubmitting(true);
    try {
      if (form.type === "shortcut") {
        await saveShortcutModule({
          type: "shortcut",
          id: form.id,
          name: form.name,
          shortDescription: form.shortDescription || undefined,
          iconUrl: form.iconUrl || undefined,
          bannerUrl: form.bannerUrl || undefined,
          executablePath: form.executablePath,
          args: form.args ? form.args.split(" ").filter(Boolean) : undefined,
        });
      } else {
        await uploadHostedModule(
          {
            type: "hosted",
            id: form.id,
            name: form.name,
            shortDescription: form.shortDescription || undefined,
            iconUrl: form.iconUrl || undefined,
            bannerUrl: form.bannerUrl || undefined,
            version: form.version,
            executable: form.executable,
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
              <Field label="Icône (URL)" icon={ImageIcon}>
                <Input value={form.iconUrl} onChange={(v) => updateForm("iconUrl", v)} placeholder="https://…" />
              </Field>
              <Field label="Bannière (URL)" icon={ImageIcon}>
                <Input value={form.bannerUrl} onChange={(v) => updateForm("bannerUrl", v)} placeholder="https://…" />
              </Field>
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
