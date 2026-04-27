import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, Sparkles, X } from "lucide-react";
import { sounds } from "@/lib/sounds";
import { formatDisplay } from "@/lib/version";
import { ChangelogRenderer } from "./ChangelogRenderer";

type Status =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; progress: number; total: number; speed?: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/** How often we re-check the updater while the app is open. 2 minutes is a
 *  good compromise between "feels real-time" and "doesn't hammer the host." */
const POLL_INTERVAL_MS = 2 * 60 * 1000;
/** Within this window after startup, treat any detected update as "found on
 *  startup" (subdued banner only). After this window, fresh detections show
 *  the prominent centered modal + arpeggio sound. */
const STARTUP_GRACE_MS = 30_000;

export function UpdateBanner() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  /**
   * Set when an update is detected mid-session (i.e. *after* the startup grace
   * window). Drives the centered modal that pulls the user's attention away
   * from whatever they were doing. Independent from `status` so dismissing the
   * modal doesn't dismiss the persistent corner banner.
   */
  const [freshArrival, setFreshArrival] = useState<{ version: string; date?: string; notes?: string } | null>(null);
  /** Tracks the last update version we've notified the user about. Lets us
   *  re-trigger the modal *only* when an even newer version drops, not on
   *  every successful poll of the same pending update. */
  const seenVersion = useRef<string | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const update = await check();
        if (cancelled) return;
        if (!update) return;

        const isNew = seenVersion.current !== update.version;
        if (!isNew) return;

        const wasFirstSighting = seenVersion.current === null;
        seenVersion.current = update.version;
        setStatus({ kind: "available", update });
        // If a previous popup was dismissed, clear that state so the user can
        // see the corner banner again with the new version info.
        setDismissed(false);

        // Always show the centered popup when a new version is detected —
        // both at startup and mid-session. Rationale: the corner banner is
        // easy to miss after a launch (users often immediately click into a
        // game), and the centered modal makes the update opportunity
        // un-missable. We still distinguish the two cases via the sound:
        //  - Startup detection → discreet `notification` chime (soft, doesn't
        //    startle the user as the app finishes booting).
        //  - Mid-session arrival → festive `updateArrived` arpeggio (more
        //    attention-grabbing because the user is in the middle of doing
        //    something else).
        const elapsedSinceStart = Date.now() - startedAt.current;
        const isMidSessionArrival = !wasFirstSighting || elapsedSinceStart > STARTUP_GRACE_MS;
        setFreshArrival({ version: update.version, date: update.date, notes: update.body });
        if (isMidSessionArrival) {
          sounds.updateArrived();
        } else {
          sounds.notification();
        }
      } catch (err) {
        console.warn("[updater] check failed (probably offline or no endpoint yet):", err);
      }
    };

    // Initial check
    tick();
    // Recurring poll for the lifetime of the app
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const handleInstall = async () => {
    if (status.kind !== "available") return;
    const update = status.update;
    let downloaded = 0;
    let total = 0;

    // Close the popup if it's open — user is committing to the install.
    setFreshArrival(null);

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

  const showBanner = !(status.kind === "idle" || dismissed);

  return (
    <>
      {showBanner && (
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
                date={status.update.date}
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
      )}

      <AnimatePresence>
        {freshArrival && (
          <FreshArrivalModal
            version={freshArrival.version}
            date={freshArrival.date}
            notes={freshArrival.notes}
            onInstall={handleInstall}
            onLater={() => setFreshArrival(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Available({
  version,
  date,
  notes,
  onInstall,
  onDismiss,
}: {
  version: string;
  date?: string;
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
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-mono text-accent">{formatDisplay(version)}</span>
              {date && (
                <>
                  <span className="text-fg-dim">·</span>
                  <span className="text-fg-muted">{formatReleaseDate(date)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={onDismiss} className="p-1 text-fg-muted transition-colors hover:text-fg-primary">
          <X className="size-4" />
        </button>
      </div>
      {notes && (
        <div className="mb-4 max-h-44 overflow-y-auto pr-1 [scrollbar-width:thin]">
          <ChangelogRenderer notes={notes} compact />
        </div>
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

/**
 * Centered, attention-grabbing modal that appears when a new launcher version
 * is detected *while* the user is already in the app (vs. on startup, where
 * the corner banner is enough). Dismissing this modal leaves the corner banner
 * intact so the user can still install whenever they want.
 */
/**
 * Renders a release timestamp in the user's locale, with a relative phrasing
 * for fresh arrivals (« aujourd'hui à 14h26 », « hier à 09h12 », « il y a 3 j »)
 * and a calendar fallback for older releases (« le 27 avril 2026 à 14h26 »).
 *
 * The Tauri updater plugin returns `date` as an ISO 8601 string from
 * `latest.json#pub_date`. If parsing fails for any reason we just show the
 * raw string — never crash the modal over a date format glitch.
 */
function formatReleaseDate(raw: string): string {
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return raw;
  const date = new Date(ts);
  const diffMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffMs < day && date.getDate() === new Date().getDate()) {
    return `aujourd'hui à ${time}`;
  }
  if (diffMs < 2 * day) {
    return `hier à ${time}`;
  }
  if (diffMs < 7 * day) {
    return `il y a ${Math.floor(diffMs / day)} j`;
  }
  return `le ${date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })} à ${time}`;
}

function FreshArrivalModal({
  version,
  date,
  notes,
  onInstall,
  onLater,
}: {
  version: string;
  date?: string;
  notes?: string;
  onInstall: () => void;
  onLater: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/70 backdrop-blur-md"
      onClick={onLater}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 40 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring", stiffness: 280, damping: 22 },
        }}
        exit={{ opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.18 } }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[34rem] max-w-[92vw] overflow-hidden rounded-3xl glass-strong p-7 shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-accent/40"
      >
        {/* Pulsing glow halo behind the icon */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        <button
          onClick={onLater}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg-primary"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>

        <div className="relative flex flex-col items-center text-center">
          <motion.div
            initial={{ rotate: -8 }}
            animate={{ rotate: [-8, 8, -8] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/40 shadow-[0_0_28px_var(--color-accent-glow)]"
          >
            <Sparkles className="size-7" strokeWidth={2} />
          </motion.div>

          <div className="mb-1 text-xs uppercase tracking-[0.25em] text-accent">
            Mise à jour fraîche
          </div>
          <div className="font-display text-3xl text-fg-primary">
            {formatDisplay(version)}
          </div>
          {date && (
            <div className="mt-1 text-xs text-fg-dim">
              Sortie {formatReleaseDate(date)}
            </div>
          )}
          <p className="mt-2 text-sm text-fg-muted">
            Une nouvelle version du launcher vient d'être déployée. Mets à jour pour récupérer les dernières features et fixes.
          </p>

          {notes && (
            <div className="mt-5 max-h-[55vh] w-full overflow-y-auto rounded-xl bg-bg-base/30 p-4 text-left ring-1 ring-white/[0.04] [scrollbar-width:thin]">
              <ChangelogRenderer notes={notes} />
            </div>
          )}

          <div className="mt-6 flex w-full gap-3">
            <button
              onClick={onLater}
              className="flex-1 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
            >
              Plus tard
            </button>
            <button
              onClick={onInstall}
              className="flex-[1.4] rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_36px_var(--color-accent-glow)]"
            >
              Installer maintenant
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
