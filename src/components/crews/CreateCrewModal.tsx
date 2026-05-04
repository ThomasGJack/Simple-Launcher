import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Globe,
  Lock,
  Loader2,
  Smile,
  Upload,
  X,
} from "lucide-react";
import { createUserCrew, uploadCrewIcon } from "@/firebase/crews";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const EMBLEMS = ["🏰", "⚔️", "🛡️", "🐉", "👑", "🦅", "🐺", "🦊", "🦁", "🔥", "⚡", "🌟", "💀", "🎮", "🎯"];

/**
 * Modal to create a new user-owned crew. Caller is responsible for
 * the VIP-tier gate — this modal trusts that the button leading here
 * was already filtered. Generates a random join code automatically.
 */
export function CreateCrewModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (crewId: string) => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emblem, setEmblem] = useState("🏰");
  const [color, setColor] = useState("#00d4ff");
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Image picked locally — uploaded only after the crew is created
   *  (we need the crewId in the storage path). The preview blob URL
   *  is shown immediately for instant visual feedback. */
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePickIcon = () => fileInputRef.current?.click();
  const handleClearIcon = () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconFile(null);
    setIconPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!me) return;
    if (!name.trim()) {
      setError("Donne un nom à ton crew");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const id = await createUserCrew(
        {
          name: name.trim(),
          description: description.trim(),
          emblem,
          color,
          isPublic,
        },
        me.uid,
        me.displayName ?? null,
        me.photoURL ?? null,
      );
      // If the user picked a custom icon, upload it now that we have
      // the crewId for the Storage path. Failures are surfaced but
      // don't roll back the crew (the user can re-upload from the
      // edit panel later).
      if (iconFile) {
        setIconUploading(true);
        try {
          await uploadCrewIcon(id, iconFile);
        } catch (uploadErr) {
          console.warn("[crews] icon upload failed:", uploadErr);
          setError(
            "Crew créé mais l'upload de l'icône a échoué : " +
              (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)),
          );
        } finally {
          setIconUploading(false);
        }
      }
      sounds.success();
      onCreated(id);
      onClose();
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-base/80 p-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="no-drag w-full max-w-lg overflow-hidden rounded-3xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <header className="flex items-center justify-between border-b border-white/[0.06] p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
                  <Crown className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl text-fg-primary">Créer un crew</h2>
                  <p className="text-xs text-fg-muted">
                    Avantage tier supporter — ton crew, tes règles.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06]"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <Field label="Nom du crew">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  placeholder="Les Loups Solitaires"
                  className="no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                />
              </Field>

              <Field label="Description (optionnel)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={140}
                  rows={2}
                  placeholder="Le clan des bricoleurs Minecraft hardcore"
                  className="no-drag w-full resize-none rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                />
              </Field>

              <Field label="Icône du crew">
                {/* Image upload card — takes precedence when a file is
                    picked; the emoji grid below is the fallback / un-
                    selected state. */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl bg-bg-base/30 p-3 ring-1 ring-white/[0.06]">
                    <div
                      className="grid size-14 place-items-center overflow-hidden rounded-xl ring-1"
                      style={{
                        background: iconPreview
                          ? "transparent"
                          : `color-mix(in srgb, ${color} 18%, transparent)`,
                        color,
                        ["--tw-ring-color" as string]: color,
                      } as React.CSSProperties}
                    >
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl">{emblem}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-fg-primary">
                        {iconFile
                          ? iconFile.name
                          : "Aucune image — l'emoji est utilisé"}
                      </div>
                      <div className="text-[10px] text-fg-muted">
                        PNG / JPG / WebP · 2 MiB max
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 2 * 1024 * 1024) {
                          setError("Image trop lourde (2 MiB max).");
                          return;
                        }
                        setError(null);
                        if (iconPreview) URL.revokeObjectURL(iconPreview);
                        setIconFile(f);
                        setIconPreview(URL.createObjectURL(f));
                      }}
                      className="hidden"
                    />
                    {iconFile ? (
                      <button
                        type="button"
                        onClick={handleClearIcon}
                        className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-danger/10 hover:text-danger"
                        title="Retirer l'image"
                      >
                        <X className="size-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePickIcon}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] hover:shadow-[0_0_20px_var(--color-accent-glow)]"
                      >
                        <Upload className="size-3.5" />
                        Importer
                      </button>
                    )}
                  </div>

                  {/* Emoji grid (fallback when no image picked) */}
                  {!iconFile && (
                    <>
                      <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-fg-dim">
                        <Smile className="size-3" /> Ou choisis un emoji
                      </div>
                      <div className="grid grid-cols-8 gap-1.5">
                        {EMBLEMS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => setEmblem(e)}
                            className={cn(
                              "flex aspect-square items-center justify-center rounded-lg text-2xl transition",
                              emblem === e
                                ? "bg-accent/20 ring-2 ring-accent"
                                : "bg-bg-base/30 ring-1 ring-white/[0.06] hover:bg-white/[0.04]",
                            )}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Field>

              <Field label="Couleur">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="no-drag size-10 cursor-pointer rounded-lg bg-bg-base/40 ring-1 ring-white/[0.06]"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#00d4ff"
                    className="no-drag flex-1 rounded-lg bg-bg-base/40 px-3 py-2 font-mono text-xs text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                  />
                </div>
              </Field>

              <div className="rounded-xl bg-bg-base/30 p-1 ring-1 ring-white/[0.06]">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                      isPublic
                        ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                        : "text-fg-muted hover:bg-white/[0.04]",
                    )}
                  >
                    <Globe className="size-4" /> Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                      !isPublic
                        ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                        : "text-fg-muted hover:bg-white/[0.04]",
                    )}
                  >
                    <Lock className="size-4" /> Privé (code)
                  </button>
                </div>
                <p className="mt-2 px-2 pb-1 text-[11px] leading-relaxed text-fg-dim">
                  {isPublic
                    ? "Tout le monde peut le découvrir et le rejoindre depuis l'onglet « Découvrir »."
                    : "Seuls les gens avec le code d'invitation peuvent rejoindre. Le code est généré automatiquement et tu peux le copier après création."}
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm ring-1 ring-danger/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                  <p className="text-fg-primary">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-medium text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] hover:shadow-[0_0_36px_var(--color-accent-glow)] disabled:opacity-50"
              >
                {submitting ? (
                  iconUploading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Upload icône…
                    </>
                  ) : (
                    "Création…"
                  )
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Créer le crew
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
