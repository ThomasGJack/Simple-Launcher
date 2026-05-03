import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  ArrowDownToLine,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  mcBackupCreate,
  mcBackupDelete,
  mcBackupList,
  mcBackupRestore,
  type BackupEntry,
} from "@/lib/mcBackup";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Modal for managing per-instance Minecraft save backups. Triggered
 * from the module action panel "Backups" button. Lists existing
 * snapshots, lets the user create a new one on demand, restore any
 * existing one (with confirm — saves/ is renamed before extraction so
 * undo is possible), or delete old ones.
 */
export function MinecraftBackupsModal({
  open,
  onClose,
  instanceId,
}: {
  open: boolean;
  onClose: () => void;
  instanceId: string;
}) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // backup id currently being acted on
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setBackups(await mcBackupList(instanceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instanceId]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    sounds.click();
    try {
      await mcBackupCreate(instanceId);
      sounds.success();
      await refresh();
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (
      !confirm(
        "Restaurer ce backup va remplacer le contenu actuel de saves/.\n\n" +
          "Les saves actuelles seront renommées en saves.before-restore-{timestamp}/ pour pouvoir revenir en arrière. Continuer ?",
      )
    )
      return;
    setBusy(id);
    setError(null);
    try {
      await mcBackupRestore(instanceId, id);
      sounds.success();
      alert(
        "Backup restauré.\nLes anciennes saves sont disponibles dans le dossier saves.before-restore-* du module si tu veux les récupérer.",
      );
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer définitivement ce backup ?")) return;
    setBusy(id);
    setError(null);
    try {
      await mcBackupDelete(instanceId, id);
      await refresh();
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[88vh] w-[92vw] max-w-2xl overflow-hidden rounded-3xl bg-bg-soft/95 ring-1 ring-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
              <div className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <Archive className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Backups des saves</div>
                <div className="text-xs text-fg-muted">
                  Snapshots du dossier saves/ — auto avant chaque launch (max 1 / 24 h, 5 conservés).
                </div>
              </div>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="rounded-md bg-bg-elevated p-1.5 ring-1 ring-white/[0.06] hover:bg-bg-base disabled:opacity-50"
                title="Actualiser"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="info-scroll max-h-[calc(88vh-180px)] overflow-y-auto p-6">
              {error && (
                <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              {backups.length === 0 && !loading ? (
                <div className="rounded-xl bg-white/[0.02] p-6 text-center text-sm text-fg-muted ring-1 ring-white/[0.04]">
                  Pas encore de backup pour ce module. Lance Minecraft une première fois — un
                  backup sera créé automatiquement.
                </div>
              ) : (
                <div className="space-y-2">
                  {backups.map((b, i) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04]"
                    >
                      <div
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg",
                          i === 0
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-white/[0.04] text-fg-muted",
                        )}
                      >
                        <Save className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-fg-primary">
                          {new Date(b.createdAtMs).toLocaleString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {i === 0 && (
                            <span className="ml-2 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                              Récent
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-fg-muted">
                          {(b.sizeBytes / 1_048_576).toFixed(1)} Mo
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestore(b.id)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs text-accent ring-1 ring-accent/30 hover:bg-accent/20 disabled:opacity-50"
                        title="Restaurer ce backup"
                      >
                        {busy === b.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <ArrowDownToLine className="size-3" />
                        )}
                        Restaurer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        disabled={busy !== null}
                        className="rounded-md bg-white/[0.03] p-1.5 text-fg-muted ring-1 ring-white/[0.04] hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        title="Supprimer"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-white/[0.06] bg-bg-base/40 px-6 py-3">
              <span className="text-[11px] text-fg-dim">
                {backups.length} / 5 conservés
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-bg-base hover:shadow-[0_0_18px_var(--color-accent-glow)] disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Backup maintenant
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
