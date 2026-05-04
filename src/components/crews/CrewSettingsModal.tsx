import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Crown,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Smile,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  deleteCrew,
  rotateCrewJoinCode,
  updateUserCrew,
  uploadCrewIcon,
  type Crew,
} from "@/firebase/crews";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const EMBLEMS = ["🏰", "⚔️", "🛡️", "🐉", "👑", "🦅", "🐺", "🦊", "🦁", "🔥", "⚡", "🌟", "💀", "🎮", "🎯"];

/**
 * Edit panel for a crew the user owns. Reuses the same form layout as
 * CreateCrewModal but mutates the existing crew doc instead of
 * creating one. Adds three owner-only actions :
 *
 *  - **Rotate join code** : invalidate the current code + generate a
 *    new one (use after a leak)
 *  - **Copy join code** : one-click clipboard for sharing
 *  - **Delete crew** : nukes the crew + member docs, two-step confirm
 *
 * Master crews are NOT editable here — the launcher admin manages
 * those via the AdminPage's CrewsManager.
 */
export function CrewSettingsModal({
  open,
  onClose,
  crew,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  crew: Crew;
  /** Called after a successful delete so the parent can navigate
   *  away from the now-gone crew. */
  onDeleted: () => void;
}) {
  const [name, setName] = useState(crew.name);
  const [description, setDescription] = useState(crew.description);
  const [emblem, setEmblem] = useState(crew.emblem);
  const [color, setColor] = useState(crew.color);
  const [isPublic, setIsPublic] = useState(crew.isPublic);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** Local image preview before upload (blob URL). The actual upload
   *  is deferred to the save click so an aborted edit doesn't cost us
   *  Storage quota. */
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset form whenever the modal opens / the crew changes — keeps it
  // fresh if the user toggles between several crews without closing
  // the launcher.
  useEffect(() => {
    if (!open) return;
    setName(crew.name);
    setDescription(crew.description);
    setEmblem(crew.emblem);
    setColor(crew.color);
    setIsPublic(crew.isPublic);
    setIconFile(null);
    setIconPreview(null);
    setError(null);
    setSuccess(false);
    setCodeCopied(false);
  }, [open, crew]);

  const handlePickIcon = () => fileInputRef.current?.click();
  const handleClearIcon = () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconFile(null);
    setIconPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Le nom ne peut pas être vide");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Push the metadata patch first — even if the icon upload fails
      // afterwards the user's text changes are preserved.
      await updateUserCrew(crew.id, {
        name: name.trim(),
        description: description.trim(),
        emblem,
        color,
        isPublic,
      });
      if (iconFile) {
        setIconUploading(true);
        try {
          await uploadCrewIcon(crew.id, iconFile);
        } finally {
          setIconUploading(false);
        }
      }
      sounds.success();
      setSuccess(true);
      // Auto-close after a short flash so the user sees the success
      // state before the modal disappears.
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!crew.joinCode) return;
    try {
      await navigator.clipboard.writeText(crew.joinCode);
      sounds.success();
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // Clipboard API can be denied in some Tauri webview configs —
      // silently ignore.
    }
  };

  const handleRotateCode = async () => {
    if (
      !confirm(
        "Régénérer un nouveau code d'invitation ? L'ancien code sera invalidé immédiatement, les liens partagés ne fonctionneront plus.",
      )
    )
      return;
    setRotating(true);
    try {
      await rotateCrewJoinCode(crew.id);
      sounds.success();
    } catch (err) {
      console.warn("[crews] rotate code failed:", err);
      sounds.error();
    } finally {
      setRotating(false);
    }
  };

  const handleDelete = async () => {
    // Two-step confirm — the first asks for confirmation, the second
    // requires typing the crew name as a safeguard against fat-finger
    // clicks on a heavily-populated crew.
    if (
      !confirm(
        `Supprimer définitivement le crew "${crew.name}" ? Tous les channels, messages et membres seront perdus. Cette action est irréversible.`,
      )
    )
      return;
    const typed = prompt(
      `Pour confirmer, tape le nom exact du crew :\n\n${crew.name}`,
    );
    if (typed !== crew.name) {
      if (typed !== null) {
        alert("Le nom ne correspond pas. Suppression annulée.");
      }
      return;
    }
    setDeleting(true);
    try {
      await deleteCrew(crew.id);
      sounds.success();
      onDeleted();
      onClose();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
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
            className="no-drag flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <header className="flex items-center justify-between border-b border-white/[0.06] p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
                  <Crown className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl text-fg-primary">
                    Paramètres du crew
                  </h2>
                  <p className="text-xs text-fg-muted">
                    Tu es propriétaire de "{crew.name}".
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

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <Field label="Nom du crew">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  className="no-drag w-full rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={140}
                  rows={2}
                  className="no-drag w-full resize-none rounded-lg bg-bg-base/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                />
              </Field>

              <Field label="Icône du crew">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl bg-bg-base/30 p-3 ring-1 ring-white/[0.06]">
                    <div
                      className="grid size-14 place-items-center overflow-hidden rounded-xl ring-1"
                      style={{
                        background: iconPreview || crew.iconUrl
                          ? "transparent"
                          : `color-mix(in srgb, ${color} 18%, transparent)`,
                        color,
                        ["--tw-ring-color" as string]: color,
                      } as React.CSSProperties}
                    >
                      {iconPreview ? (
                        <img src={iconPreview} alt="" className="size-full object-cover" />
                      ) : crew.iconUrl ? (
                        <img
                          src={crew.iconUrl}
                          alt=""
                          className="size-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-3xl">{emblem}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-fg-primary">
                        {iconFile
                          ? iconFile.name
                          : crew.iconUrl
                            ? "Icône custom uploadée"
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
                        title="Annuler le changement"
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
                        {crew.iconUrl ? "Remplacer" : "Importer"}
                      </button>
                    )}
                  </div>

                  {/* Emoji grid is the fallback when no custom image
                      is set OR being uploaded right now. */}
                  {!iconFile && !crew.iconUrl && (
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
                    <Lock className="size-4" /> Privé
                  </button>
                </div>
              </div>

              {/* Invite code panel */}
              {crew.joinCode && (
                <div className="rounded-xl bg-cyan-500/[0.06] p-4 ring-1 ring-cyan-500/20">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-cyan-300">
                      Code d'invitation
                    </span>
                    <span className="text-[10px] text-fg-dim">
                      Partage-le pour rejoindre
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-bg-base/40 px-3 py-2 text-center font-mono text-xl tracking-widest text-cyan-200 ring-1 ring-cyan-500/30">
                      {crew.joinCode}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      title="Copier"
                      className="grid size-10 place-items-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30 transition hover:bg-cyan-500/25"
                    >
                      {codeCopied ? (
                        <Check className="size-4" />
                      ) : (
                        <ClipboardCopy className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateCode}
                      disabled={rotating}
                      title="Régénérer (invalide l'ancien)"
                      className="grid size-10 place-items-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 disabled:opacity-50"
                    >
                      {rotating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm ring-1 ring-danger/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                  <p className="text-fg-primary">{error}</p>
                </div>
              )}

              {/* Danger zone — delete crew */}
              <div className="rounded-xl border border-danger/20 bg-danger/[0.04] p-4">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-danger/80">
                  Zone dangereuse
                </div>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 text-xs text-fg-muted">
                    Supprimer le crew. Channels, messages, members : tout
                    est effacé. Irréversible.
                  </div>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-3 py-2 text-xs font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger/25 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Supprimer le crew
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.06] p-5">
              <button
                onClick={handleSave}
                disabled={submitting}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-medium transition-shadow disabled:opacity-50",
                  success
                    ? "bg-emerald-500 text-bg-base"
                    : "bg-accent text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] hover:shadow-[0_0_36px_var(--color-accent-glow)]",
                )}
              >
                {success ? (
                  <>
                    <Check className="size-4" /> Enregistré
                  </>
                ) : submitting ? (
                  iconUploading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Upload icône…
                    </>
                  ) : (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Enregistrement…
                    </>
                  )
                ) : (
                  <>
                    <Save className="size-4" /> Enregistrer
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
