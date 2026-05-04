import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Gem,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import {
  deleteUserCustomMinecraft,
  saveUserCustomMinecraft,
  uploadCustomMinecraftAsset,
} from "@/firebase/customMinecraft";
import {
  mcVanillaListVersions,
  type ManifestVersion,
} from "@/lib/mcVanilla";
import {
  mcFabricListLoaderVersions,
  type FabricLoaderVersion,
} from "@/lib/mcFabric";
import {
  mcForgeListVersions,
  mcNeoforgeListVersions,
  type ForgeVersionEntry,
} from "@/lib/mcForge";
import type { CustomMinecraftModule } from "@/types/module";
import { cn } from "@/lib/cn";

type LoaderKind = "vanilla" | "fabric" | "forge" | "neoforge";

type FormState = {
  id: string;
  name: string;
  shortDescription: string;
  iconUrl: string;
  bannerUrl: string;
  mcVersion: string;
  loader: LoaderKind;
  loaderVersion: string;
  maxRamGb: number;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  shortDescription: "",
  iconUrl: "",
  bannerUrl: "",
  mcVersion: "",
  loader: "vanilla",
  loaderVersion: "",
  maxRamGb: 4,
};

function fromInstance(inst: CustomMinecraftModule): FormState {
  return {
    id: inst.id,
    name: inst.name,
    shortDescription: inst.shortDescription ?? "",
    iconUrl: inst.iconUrl ?? "",
    bannerUrl: inst.bannerUrl ?? "",
    mcVersion: inst.nativeMcVersion,
    loader: inst.nativeLoader,
    loaderVersion: inst.nativeLoaderVersion ?? "",
    maxRamGb: Math.max(1, Math.round((inst.maxRamMb ?? 4096) / 1024)),
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

function buildInstance(uid: string, form: FormState): CustomMinecraftModule {
  // The on-disk instance id MUST be `cmc-{slug}` so it can never clash
  // with the hosted MC modules (which use the bare Firestore module id
  // as their instanceId for the native launch chain).
  const id = form.id || `cmc-${slugify(form.name) || `instance-${Date.now()}`}`;
  return {
    type: "custom-minecraft",
    id: id.startsWith("cmc-") ? id : `cmc-${id}`,
    ownerUid: uid,
    name: form.name.trim(),
    nativeMcVersion: form.mcVersion,
    nativeLoader: form.loader,
    ...(form.loader !== "vanilla" && form.loaderVersion && {
      nativeLoaderVersion: form.loaderVersion,
    }),
    ...(form.shortDescription && { shortDescription: form.shortDescription }),
    ...(form.iconUrl && { iconUrl: form.iconUrl }),
    ...(form.bannerUrl && { bannerUrl: form.bannerUrl }),
    maxRamMb: Math.max(1024, Math.round(form.maxRamGb * 1024)),
  };
}

export function CustomMinecraftForm({
  initial,
  onClose,
}: {
  initial?: CustomMinecraftModule;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState<FormState>(
    initial ? fromInstance(initial) : EMPTY_FORM,
  );
  const [iconUploading, setIconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initial;

  // ─── MC version + loader options ─────────────────────────────────
  const [mcVersions, setMcVersions] = useState<ManifestVersion[]>([]);
  const [mcVersionsLoading, setMcVersionsLoading] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false);

  // Auto-derive id from name on create.
  useEffect(() => {
    if (isEdit) return;
    setForm((f) => {
      const next = `cmc-${slugify(f.name) || ""}`.replace(/-+$/, "");
      if (next === f.id || next === "cmc-") return f;
      return { ...f, id: next };
    });
  }, [form.name, isEdit]);

  // Load MC versions on mount.
  useEffect(() => {
    let cancelled = false;
    setMcVersionsLoading(true);
    mcVanillaListVersions()
      .then((m) => {
        if (cancelled) return;
        setMcVersions(m.versions);
        // Pre-select latest release if creating fresh.
        setForm((f) =>
          f.mcVersion ? f : { ...f, mcVersion: m.latest.release },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Versions Minecraft introuvables : ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setMcVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load loader versions when (loader, mcVersion) changes.
  useEffect(() => {
    if (form.loader === "vanilla" || !form.mcVersion) {
      setLoaderVersions([]);
      return;
    }
    let cancelled = false;
    setLoaderVersionsLoading(true);
    setLoaderVersions([]);
    (async () => {
      try {
        let versions: string[] = [];
        if (form.loader === "fabric") {
          const list = await mcFabricListLoaderVersions(form.mcVersion);
          versions = list.map((v: FabricLoaderVersion) => v.version);
        } else if (form.loader === "forge") {
          const list = await mcForgeListVersions();
          versions = list
            .filter((v: ForgeVersionEntry) => v.mcVersion === form.mcVersion)
            .map((v: ForgeVersionEntry) => v.loaderVersion);
        } else if (form.loader === "neoforge") {
          // NeoForge versions encode their target MC version in the
          // version string (e.g. "21.5.34-beta" → MC 1.21.5). For the
          // picker we just list all of them — the user picks one and
          // the install flow validates compat.
          versions = await mcNeoforgeListVersions();
        }
        if (!cancelled) {
          setLoaderVersions(versions);
          setForm((f) =>
            versions.includes(f.loaderVersion)
              ? f
              : { ...f, loaderVersion: versions[0] ?? "" },
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            `Versions du loader ${form.loader} introuvables : ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } finally {
        if (!cancelled) setLoaderVersionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.loader, form.mcVersion]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const filteredMcVersions = useMemo(
    () => mcVersions.filter((v) => showSnapshots || v.kind === "release"),
    [mcVersions, showSnapshots],
  );

  const validate = (): string | null => {
    if (!form.name.trim()) return "Donne un nom à ton instance";
    if (!form.mcVersion) return "Choisis une version de Minecraft";
    if (form.loader !== "vanilla" && !form.loaderVersion) {
      return "Choisis une version du loader";
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
      const inst = buildInstance(user.uid, form);
      await saveUserCustomMinecraft(user.uid, inst);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !initial) return;
    if (
      !confirm(
        `Supprimer l'instance "${initial.name}" ? Les fichiers locaux ne sont pas effacés (utilise le bouton dédié sur la page module pour ça).`,
      )
    )
      return;
    try {
      await deleteUserCustomMinecraft(user.uid, initial.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const uploadAsset = async (kind: "icon" | "banner", file: File) => {
    if (!user) return;
    const id = form.id || `cmc-${slugify(form.name)}`;
    if (!id || id === "cmc-") {
      setError("Renseigne d'abord le nom de l'instance.");
      return;
    }
    const setUploading = kind === "icon" ? setIconUploading : setBannerUploading;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadCustomMinecraftAsset(user.uid, id, kind, file);
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
          className="no-drag flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        >
          <div className="flex max-h-[90vh] flex-1 flex-col overflow-y-auto p-7">
            <header className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                  {isEdit ? <Wand2 className="size-5" /> : <Gem className="size-5" />}
                </div>
                <div>
                  <h2 className="font-display text-2xl text-fg-primary">
                    {isEdit ? "Modifier l'instance" : "Nouvelle instance Minecraft"}
                  </h2>
                  <p className="text-xs text-fg-muted">
                    Privée, gérée par toi seul. Ajoute tes mods dans le dossier après création.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="grid gap-4">
              <Field label="Nom de l'instance">
                <Input
                  value={form.name}
                  onChange={(v) => update("name", v)}
                  placeholder="Mon serveur SkyFactory perso"
                />
              </Field>
              <Field label="Description courte (optionnel)">
                <Input
                  value={form.shortDescription}
                  onChange={(v) => update("shortDescription", v)}
                  placeholder="Modpack 1.20.1 avec Create + JEI"
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

              <Field
                label="Version de Minecraft"
                hint={
                  <button
                    type="button"
                    onClick={() => setShowSnapshots((v) => !v)}
                    className="text-xs text-accent hover:underline"
                  >
                    {showSnapshots ? "Masquer snapshots" : "Afficher snapshots"}
                  </button>
                }
              >
                <select
                  value={form.mcVersion}
                  onChange={(e) => update("mcVersion", e.target.value)}
                  disabled={mcVersionsLoading}
                  className="no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
                >
                  {mcVersionsLoading && (
                    <option value="">Chargement…</option>
                  )}
                  {filteredMcVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} {v.kind !== "release" ? `(${v.kind})` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Mod loader">
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-bg-base/40 p-1 ring-1 ring-white/[0.06]">
                  {(["vanilla", "fabric", "forge", "neoforge"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => update("loader", l)}
                      className={cn(
                        "rounded-lg px-2 py-2 text-xs font-medium capitalize transition-colors",
                        form.loader === l
                          ? "bg-accent text-bg-base"
                          : "text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Field>

              {form.loader !== "vanilla" && (
                <Field
                  label={`Version ${form.loader}`}
                  hint={
                    loaderVersionsLoading
                      ? "Chargement…"
                      : loaderVersions.length === 0
                        ? "Aucune version trouvée"
                        : `${loaderVersions.length} dispo`
                  }
                >
                  <select
                    value={form.loaderVersion}
                    onChange={(e) => update("loaderVersion", e.target.value)}
                    disabled={loaderVersionsLoading || loaderVersions.length === 0}
                    className="no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
                  >
                    {loaderVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Mémoire allouée" hint={`${form.maxRamGb} GiB`}>
                <input
                  type="range"
                  min={2}
                  max={16}
                  step={1}
                  value={form.maxRamGb}
                  onChange={(e) => update("maxRamGb", Number(e.target.value))}
                  className="no-drag w-full accent-[var(--color-accent)]"
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
                    <CheckCircle2 className="size-4" /> Créer l'instance
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

            <p className="mt-4 text-[11px] leading-relaxed text-fg-dim">
              Une fois l'instance créée, ouvre la depuis ta bibliothèque, clique sur
              "Installer" pour télécharger {form.loader === "vanilla" ? "Vanilla" : `Vanilla + ${form.loader}`} {form.mcVersion || "…"},
              puis utilise "Ouvrir le dossier" pour glisser tes mods dans <code>mods/</code>.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── form helpers (kept light, mirrors ShortcutForm style) ────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>
        {typeof hint === "string" ? (
          <span className="text-xs text-fg-dim">{hint}</span>
        ) : (
          hint
        )}
      </div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] transition-shadow focus:outline-none focus:ring-1 focus:ring-accent/60 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
    />
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
  const id = `cmc-img-${label}`;
  return (
    <Field label={label} hint={hint}>
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
            <img
              src={url}
              alt=""
              className="h-full aspect-square rounded-lg object-cover ring-1 ring-white/10"
            />
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

// Keep the unused-import keep-alive (lucide ImageIcon imported above for
// possible future picker, even if not currently rendered).
void ImageIcon;
void Plus;
