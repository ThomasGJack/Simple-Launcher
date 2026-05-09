import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Users,
  Eraser,
} from "lucide-react";
import { useUsers } from "@/store/firebaseStores";
import {
  deleteLogFile,
  getLogFileDownloadUrl,
  listUserLogFiles,
  parseLogFileName,
  readLogFileContent,
  type LogFileEntry,
} from "@/firebase/logFiles";
import { cn } from "@/lib/cn";

/**
 * Embedded 3-column log viewer for the admin panel's "Logs" tab.
 *
 * Each launcher session uploads its `.sl_logs` text file to
 * `users/{uid}/logs/{file}.log` on Firebase Storage. This component lets
 * the admin pick a user, browse their session files (sorted by date), and
 * view / download / delete a specific file.
 *
 * Files older than 7 days are automatically purged by the daily Cloud
 * Function (`cleanupOldData`).
 *
 * Designed to be rendered inside `AdminPage`'s tabbed layout — it keeps
 * its own internal scroll regions and doesn't fight the parent's scroll
 * (we set a fixed min-height on the outer card). Auth gating is done by
 * the parent — this component assumes admin is already verified.
 */
export function LogsManager() {
  const users = useUsers();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [files, setFiles] = useState<LogFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<LogFileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);

  // When the admin picks a user, refresh their file list. Auto-pick the
  // most recent file if any so the viewer isn't empty.
  useEffect(() => {
    if (!selectedUid) return;
    let cancelled = false;
    setFilesLoading(true);
    setFiles([]);
    setSelectedFile(null);
    setFileContent("");
    listUserLogFiles(selectedUid)
      .then((list) => {
        if (cancelled) return;
        // Drop legacy uploads from the previous logging system —
        // `session-{uuid}-{millis}.log` files no longer match a real
        // session, often fail to read (CORS / encoding artefacts), and
        // pollute the viewer. They will eventually be cleaned up by the
        // 7-day retention Cloud Function.
        const cleaned = list.filter((f) => !f.name.startsWith("session-"));
        const sorted = [...cleaned].sort((a, b) => {
          const ta = parseLogFileName(a.name).ts ?? 0;
          const tb = parseLogFileName(b.name).ts ?? 0;
          return tb - ta;
        });
        setFiles(sorted);
        if (sorted[0]) setSelectedFile(sorted[0]);
      })
      .catch((err) => console.warn("[admin-logs] list failed:", err))
      .finally(() => !cancelled && setFilesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedUid]);

  // When a file is picked, fetch its content.
  useEffect(() => {
    if (!selectedFile) {
      setFileContent("");
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setFileContent("");
    readLogFileContent(selectedFile.fullPath)
      .then((c) => !cancelled && setFileContent(c))
      .catch((err) => {
        console.warn("[admin-logs] read failed:", err);
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setFileContent(`(erreur de lecture)\n\n${msg}`);
        }
      })
      .finally(() => !cancelled && setContentLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  const refreshFiles = async () => {
    if (!selectedUid) return;
    setFilesLoading(true);
    try {
      const list = await listUserLogFiles(selectedUid);
      list.sort((a, b) => (parseLogFileName(b.name).ts ?? 0) - (parseLogFileName(a.name).ts ?? 0));
      setFiles(list);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleDownload = async (file: LogFileEntry) => {
    try {
      const url = await getLogFileDownloadUrl(file.fullPath);
      // Download via blob URL → reste dans l'app (pas un onglet browser
      // qui s'ouvre). Le fichier est sauvé dans le dossier
      // Téléchargements de l'OS comme n'importe quel download.
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn("[admin-logs] download failed:", err);
    }
  };

  const handleDelete = async (file: LogFileEntry) => {
    if (!confirm(`Supprimer le log "${file.name}" ?`)) return;
    try {
      await deleteLogFile(file.fullPath);
      setFiles((f) => f.filter((x) => x.fullPath !== file.fullPath));
      if (selectedFile?.fullPath === file.fullPath) {
        setSelectedFile(null);
        setFileContent("");
      }
    } catch (err) {
      console.warn("[admin-logs] delete failed:", err);
    }
  };

  /** Purges every legacy `session-{uuid}-{millis}.log` upload — leftovers
   *  from the previous file-naming scheme. They aren't shown in the list
   *  (filtered above) but still take Storage space until the 7-day
   *  retention sweep gets to them. The admin can wipe them on demand. */
  const handlePurgeLegacy = async () => {
    if (!selectedUid) return;
    setFilesLoading(true);
    try {
      const all = await listUserLogFiles(selectedUid);
      const legacy = all.filter((f) => f.name.startsWith("session-"));
      if (legacy.length === 0) {
        alert("Aucun fichier legacy à purger.");
        return;
      }
      if (!confirm(`Supprimer ${legacy.length} fichier(s) legacy ?`)) return;
      await Promise.allSettled(legacy.map((f) => deleteLogFile(f.fullPath)));
    } catch (err) {
      console.warn("[admin-logs] purge legacy failed:", err);
    } finally {
      setFilesLoading(false);
    }
  };

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)),
    [users],
  );

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[560px] overflow-hidden rounded-2xl ring-1 ring-white/[0.06] bg-bg-soft/30">
      {/* ─── User picker rail ──────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.06] bg-bg-soft/50">
        <header className="border-b border-white/[0.06] p-4">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent">
            <Users className="size-3" /> Utilisateurs
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            Choisis un launcher pour voir ses logs.
          </p>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {sortedUsers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-dim">Aucun utilisateur.</div>
          ) : (
            sortedUsers.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => setSelectedUid(u.uid)}
                className={cn(
                  "no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  u.uid === selectedUid
                    ? "bg-accent/15 text-fg-primary ring-1 ring-accent/30"
                    : "text-fg-muted hover:bg-white/[0.03] hover:text-fg-primary",
                )}
              >
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt=""
                    className="size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-elevated text-[10px] uppercase">
                    {(u.displayName ?? "?").slice(0, 1)}
                  </div>
                )}
                <span className="truncate">{u.displayName ?? "Anonyme"}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ─── File picker rail ─────────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/[0.06] bg-bg-soft/30">
        <header className="flex items-center justify-between border-b border-white/[0.06] p-4">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent">
            <FileText className="size-3" /> Sessions
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePurgeLegacy}
              disabled={!selectedUid || filesLoading}
              className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger disabled:opacity-40"
              title="Purger les anciens fichiers (session-…)"
            >
              <Eraser className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={refreshFiles}
              disabled={!selectedUid || filesLoading}
              className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary disabled:opacity-40"
              title="Rafraîchir"
            >
              <RefreshCw className={cn("size-3.5", filesLoading && "animate-spin")} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {!selectedUid ? (
            <div className="px-3 py-4 text-center text-xs text-fg-dim">
              Sélectionne d'abord un utilisateur.
            </div>
          ) : filesLoading ? (
            <div className="grid place-items-center py-8 text-fg-dim">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-fg-dim">
              Aucun fichier de log uploadé pour cet utilisateur.
              <br />
              <span className="text-[10px]">
                Les fichiers sont uploadés toutes les 4 h ou via le bouton dans Réglages.
              </span>
            </div>
          ) : (
            files.map((f) => (
              <FileRow
                key={f.fullPath}
                file={f}
                active={selectedFile?.fullPath === f.fullPath}
                onSelect={() => setSelectedFile(f)}
                onDownload={() => handleDownload(f)}
                onDelete={() => handleDelete(f)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ─── Viewer ──────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] bg-bg-soft/30 px-5 py-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-accent">Logs</div>
            <div className="truncate font-mono text-xs text-fg-muted">
              {selectedFile ? selectedFile.name : "—"}
            </div>
          </div>
          {selectedFile && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDownload(selectedFile)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base"
              >
                <Download className="size-3.5" /> Télécharger
              </button>
              <button
                type="button"
                onClick={() => handleDelete(selectedFile)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger ring-1 ring-danger/30 hover:bg-danger/20"
              >
                <Trash2 className="size-3.5" /> Supprimer
              </button>
            </div>
          )}
        </header>

        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {!selectedFile ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid h-full place-items-center text-fg-dim"
              >
                <div className="text-center">
                  <FileText className="mx-auto mb-2 size-10" strokeWidth={1.2} />
                  <div className="text-sm">Aucun fichier sélectionné</div>
                </div>
              </motion.div>
            ) : contentLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid h-full place-items-center text-fg-dim"
              >
                <Loader2 className="size-6 animate-spin" />
              </motion.div>
            ) : (
              <motion.pre
                key={selectedFile.fullPath}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="info-scroll h-full overflow-auto whitespace-pre-wrap break-words bg-bg-base/40 p-5 font-mono text-xs leading-relaxed text-fg-primary"
              >
                {fileContent}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function FileRow({
  file,
  active,
  onSelect,
  onDownload,
  onDelete,
}: {
  file: LogFileEntry;
  active: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const parsed = parseLogFileName(file.name);
  const dateStr = parsed.ts
    ? new Date(parsed.ts).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "?";
  // Human-friendly title: "v26.04.29.10 · 29 avr. 23:27" — falls back to
  // raw name when parsing fails (legacy uploads from before the rename).
  const title = parsed.version
    ? `${parsed.version}`
    : file.name.replace(/^session-/, "").replace(/\.log$/, "");
  return (
    <div
      className={cn(
        "group mb-1 cursor-pointer rounded-lg px-3 py-2 ring-1 transition-colors",
        active
          ? "bg-accent/15 ring-accent/30"
          : "ring-transparent hover:bg-white/[0.03]",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <FileText className="size-3.5 shrink-0 text-fg-dim" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-fg-primary">
            {title}
          </div>
          <div className="text-[10px] text-fg-dim">
            {dateStr}
            {parsed.shortId && (
              <span className="ml-1.5 font-mono opacity-70">· {parsed.shortId}</span>
            )}
          </div>
        </div>
        <div className="hidden gap-0.5 group-hover:flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="grid size-6 place-items-center rounded text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
            title="Télécharger"
          >
            <Download className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="grid size-6 place-items-center rounded text-fg-muted hover:bg-danger/15 hover:text-danger"
            title="Supprimer"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
