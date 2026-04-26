import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, X } from "lucide-react";
import { sounds } from "@/lib/sounds";

type Status =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; progress: number; total: number; speed?: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function UpdateBanner() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (cancelled) return;
        if (update) {
          setStatus({ kind: "available", update });
          sounds.notification();
        }
      } catch (err) {
        console.warn("[updater] check failed (probably offline or no endpoint yet):", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInstall = async () => {
    if (status.kind !== "available") return;
    const update = status.update;
    let downloaded = 0;
    let total = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setStatus({ kind: "downloading", progress: 0, total });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setStatus({ kind: "downloading", progress: downloaded, total });
            break;
          case "Finished":
            setStatus({ kind: "ready" });
            break;
        }
      });
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  };

  if (status.kind === "idle" || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 60, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="no-drag fixed bottom-6 right-6 z-50 w-96 overflow-hidden rounded-2xl glass-strong shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-accent/20"
      >
        {status.kind === "available" && (
          <Available
            version={status.update.version}
            notes={status.update.body}
            onInstall={handleInstall}
            onDismiss={() => setDismissed(true)}
          />
        )}
        {status.kind === "downloading" && <Downloading progress={status.progress} total={status.total} />}
        {status.kind === "ready" && <Ready />}
        {status.kind === "error" && <ErrorState message={status.message} onClose={() => setDismissed(true)} />}
      </motion.div>
    </AnimatePresence>
  );
}

function Available({
  version,
  notes,
  onInstall,
  onDismiss,
}: {
  version: string;
  notes?: string;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
            <Download className="size-4" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-medium text-fg-primary">Mise à jour disponible</div>
            <div className="text-xs text-fg-muted">v{version}</div>
          </div>
        </div>
        <button onClick={onDismiss} className="p-1 text-fg-muted transition-colors hover:text-fg-primary">
          <X className="size-4" />
        </button>
      </div>
      {notes && (
        <p className="mb-4 line-clamp-3 text-xs text-fg-muted whitespace-pre-line">{notes}</p>
      )}
      <button
        onClick={onInstall}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_28px_var(--color-accent-glow)]"
      >
        Télécharger et installer
      </button>
    </div>
  );
}

function Downloading({ progress, total }: { progress: number; total: number }) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
          <RefreshCw className="size-4 animate-spin" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <div className="font-medium text-fg-primary">Téléchargement</div>
          <div className="text-xs text-fg-muted">
            {mb(progress)} / {mb(total)} Mo · {pct}%
          </div>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full bg-accent shadow-[0_0_12px_var(--color-accent-glow)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

function Ready() {
  return (
    <div className="p-5 text-center">
      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-success/15 text-success ring-1 ring-success/30">
        <RefreshCw className="size-4" strokeWidth={2.5} />
      </div>
      <div className="font-medium text-fg-primary">Redémarrage…</div>
    </div>
  );
}

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="p-5">
      <div className="mb-2 flex items-start justify-between">
        <div className="font-medium text-danger">Erreur de mise à jour</div>
        <button onClick={onClose} className="p-1 text-fg-muted transition-colors hover:text-fg-primary">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs text-fg-muted">{message}</p>
    </div>
  );
}
