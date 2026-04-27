import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Download, RotateCcw, Save, Trash2, X, Plus, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import {
  createBackup,
  deleteBackup,
  restoreBackup,
  watchBackups,
  type MinecraftBackup,
} from "@/firebase/backups";
import { getMinecraftState } from "@/lib/minecraft";
import { sounds } from "@/lib/sounds";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/cn";

/**
 * Cloud-backed save/restore panel for a Minecraft modpack instance. Lets
 * the player snapshot their `saves/`, `config/`, `screenshots/`, etc.
 * to Firebase Storage at any time and roll back to a past snapshot from
 * any other PC where they install the same modpack.
 */
export function MinecraftBackups({ moduleId }: { moduleId: string }) {
  // Fetch the local instance name on mount — needed by Rust to locate the
  // Prism instance dir for zipping. Re-fetches if the module id changes.
  const [instanceName, setInstanceName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMinecraftState(moduleId)
      .then((state) => {
        if (!cancelled) setInstanceName(state?.instanceName ?? null);
      })
      .catch(() => {
        if (!cancelled) setInstanceName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);
  const me = useAuthStore((s) => s.user);
  const [backups, setBackups] = useState<MinecraftBackup[]>([]);
  const [busy, setBusy] = useState<"idle" | "creating" | "restoring" | "deleting">("idle");
  const [activeBackup, setActiveBackup] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!me) return;
    return watchBackups(me.uid, moduleId, setBackups);
  }, [me?.uid, moduleId]);

  const installed = !!instanceName;

  const handleCreate = async () => {
    if (!instanceName) return;
    setBusy("creating");
    setFeedback(null);
    try {
      await createBackup({
        moduleId,
        instanceName,
        label: draftLabel,
      });
      sounds.success();
      logger.action("Backup created", {
        source: "MinecraftBackups",
        metadata: { moduleId, label: draftLabel || undefined },
      });
      setDraftLabel("");
      setFeedback({ kind: "ok", message: "Sauvegarde uploadée sur le cloud." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Backup create failed: ${msg}`, { source: "MinecraftBackups" });
      sounds.error();
      setFeedback({ kind: "error", message: msg });
    } finally {
      setBusy("idle");
    }
  };

  const handleRestore = async (backup: MinecraftBackup) => {
    if (!instanceName) return;
    if (
      !confirm(
        `Restaurer cette sauvegarde ?\n\n${backup.label}\n\nCette action écrase ton dossier saves actuel — tu perdras toute progression non sauvegardée.`,
      )
    ) {
      return;
    }
    setBusy("restoring");
    setActiveBackup(backup.id);
    setFeedback(null);
    try {
      await restoreBackup({ instanceName, backup });
      sounds.success();
      logger.action("Backup restored", {
        source: "MinecraftBackups",
        metadata: { moduleId, backupId: backup.id, ts: backup.ts },
      });
      setFeedback({ kind: "ok", message: "Sauvegarde restaurée. Lance le modpack pour continuer." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Backup restore failed: ${msg}`, { source: "MinecraftBackups" });
      sounds.error();
      setFeedback({ kind: "error", message: msg });
    } finally {
      setBusy("idle");
      setActiveBackup(null);
    }
  };

  const handleDelete = async (backup: MinecraftBackup) => {
    if (!confirm(`Supprimer cette sauvegarde ?\n\n${backup.label}\n\nCette action est irréversible.`)) {
      return;
    }
    setBusy("deleting");
    setActiveBackup(backup.id);
    try {
      await deleteBackup(backup);
      sounds.click();
      logger.action("Backup deleted", {
        source: "MinecraftBackups",
        metadata: { moduleId, backupId: backup.id },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Backup delete failed: ${msg}`, { source: "MinecraftBackups" });
      sounds.error();
      setFeedback({ kind: "error", message: msg });
    } finally {
      setBusy("idle");
      setActiveBackup(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="rounded-3xl glass p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-muted">
          <Cloud className="size-3" /> Sauvegardes cloud
        </h3>
        {backups.length > 0 && (
          <span className="text-[10px] text-fg-dim">
            {backups.length} backup{backups.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <p className="mb-4 text-xs leading-relaxed text-fg-muted">
        Sauvegarde tes mondes + configs + captures dans le cloud. Tu pourras
        restaurer n'importe quand depuis n'importe quel PC où le modpack est
        installé.
      </p>

      {/* Create panel */}
      {installed ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-bg-base/40 p-2 ring-1 ring-white/[0.04]">
          <input
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder='Nom de la sauvegarde (« avant raid », « jour 12 »…)'
            disabled={busy !== "idle"}
            maxLength={80}
            className="no-drag min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-fg-primary placeholder:text-fg-dim focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={busy !== "idle"}
            className={cn(
              "no-drag inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              busy === "creating"
                ? "bg-white/[0.04] text-fg-dim ring-1 ring-white/[0.04] cursor-wait"
                : "bg-accent/15 text-accent ring-1 ring-accent/30 hover:bg-accent/25 hover:shadow-[0_0_14px_var(--color-accent-soft)]",
            )}
          >
            {busy === "creating" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {busy === "creating" ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-amber-500/[0.08] p-3 text-xs text-amber-200 ring-1 ring-amber-500/20">
          Installe le modpack d'abord pour pouvoir le sauvegarder.
        </div>
      )}

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ring-1",
              feedback.kind === "ok"
                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20"
                : "bg-rose-500/10 text-rose-200 ring-rose-500/20",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="shrink-0 text-current opacity-60 hover:opacity-100">
              <X className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List of backups */}
      {backups.length === 0 ? (
        <div className="rounded-xl bg-bg-base/40 p-5 text-center text-xs text-fg-muted ring-1 ring-white/[0.04]">
          <Save className="mx-auto mb-2 size-5 text-fg-dim" strokeWidth={1.5} />
          Aucune sauvegarde pour l'instant. Crée la première en cliquant sur « Sauvegarder » ci-dessus.
        </div>
      ) : (
        <div className="space-y-1.5">
          {backups.map((b) => (
            <BackupRow
              key={b.id}
              backup={b}
              busy={activeBackup === b.id ? busy : "idle"}
              onRestore={() => handleRestore(b)}
              onDelete={() => handleDelete(b)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function BackupRow({
  backup,
  busy,
  onRestore,
  onDelete,
}: {
  backup: MinecraftBackup;
  busy: "idle" | "creating" | "restoring" | "deleting";
  onRestore: () => void;
  onDelete: () => void;
}) {
  const sizeMb = (backup.size / 1_048_576).toFixed(1);
  const date = new Date(backup.ts);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg-base/30 p-2.5 ring-1 ring-white/[0.04] transition-colors hover:bg-bg-base/50">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <Save className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg-primary">{backup.label}</div>
        <div className="text-[10px] text-fg-dim">
          {date.toLocaleString("fr-FR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {sizeMb} Mo
        </div>
      </div>
      <a
        href={backup.url}
        target="_blank"
        rel="noopener noreferrer"
        className="no-drag grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
        title="Télécharger le zip"
      >
        <Download className="size-3.5" />
      </a>
      <button
        onClick={onRestore}
        disabled={busy !== "idle"}
        className="no-drag inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-medium text-amber-200 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
      >
        {busy === "restoring" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
        {busy === "restoring" ? "Restauration…" : "Restaurer"}
      </button>
      <button
        onClick={onDelete}
        disabled={busy !== "idle"}
        className="no-drag grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        title="Supprimer"
      >
        {busy === "deleting" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
    </div>
  );
}
