import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { sounds } from "@/lib/sounds";
import { formatDisplay } from "@/lib/version";
import { ChangelogRenderer } from "./ChangelogRenderer";

type Status =
  | { kind: "idle" }
  | { kind: "available"; update: Update } // mid-session detection only
  | { kind: "downloading"; progress: number; total: number; auto: boolean }
  | { kind: "ready" }
  | { kind: "error"; message: string }
  // User-triggered manual check states (from tray "Chercher une mise à
  // jour"). The silent poll skips all of these — they're only emitted
  // when the user explicitly asked, so we owe them feedback.
  | { kind: "manual-checking" }
  | { kind: "up-to-date"; version: string };

/** Re-check every 2 min while the app is open — covers the mid-session case
 *  where a release lands while the user is already playing. */
const POLL_INTERVAL_MS = 2 * 60 * 1000;
/** Within this window after startup, an update detection auto-installs
 *  silently. After this window, fresh detections show the centered modal. */
const STARTUP_GRACE_MS = 30_000;

const LS_LAST_SEEN_VERSION = "launcher.lastSeenVersion";
const LS_PENDING_VERSION = "launcher.pendingUpdateVersion";
const LS_PENDING_NOTES = "launcher.pendingUpdateNotes";

export function UpdateBanner() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  /** Mid-session arrival modal — only shown when an update lands AFTER the
   *  startup grace window. On startup, we skip the modal entirely and
   *  auto-install. */
  const [freshArrival, setFreshArrival] = useState<{
    version: string;
    date?: string;
    notes?: string;
    update: Update;
  } | null>(null);
  /** "You just updated to version X" modal shown on the FIRST boot of a
   *  freshly-installed version — purely informational, no install buttons. */
  const [justUpdated, setJustUpdated] = useState<{
    version: string;
    notes: string | null;
  } | null>(null);

  const seenVersion = useRef<string | null>(null);
  const startedAt = useRef(Date.now());

  // ─── 1. Just-updated detection (runs once at boot) ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const currentVer = await getVersion();
        if (cancelled) return;
        const lastSeen = localStorage.getItem(LS_LAST_SEEN_VERSION);
        const pendingVer = localStorage.getItem(LS_PENDING_VERSION);
        const pendingNotes = localStorage.getItem(LS_PENDING_NOTES);

        const isFreshUpdate =
          !!lastSeen && lastSeen !== currentVer && pendingVer === currentVer;
        if (isFreshUpdate) {
          setJustUpdated({ version: currentVer, notes: pendingNotes });
          sounds.success();
          // Consume the pending changelog so it doesn't show again.
          localStorage.removeItem(LS_PENDING_VERSION);
          localStorage.removeItem(LS_PENDING_NOTES);
        }
        // Always remember the version we just booted with so the NEXT
        // launch can detect the next install.
        localStorage.setItem(LS_LAST_SEEN_VERSION, currentVer);
      } catch (err) {
        console.warn("[updater] just-updated detection failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 2. Update polling (boot + every 2 min) ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const update = await check();
        if (cancelled) return;
        if (!update) return;

        // Don't re-process the same pending version.
        if (seenVersion.current === update.version) return;
        seenVersion.current = update.version;

        const elapsedSinceStart = Date.now() - startedAt.current;
        const isStartupWindow = elapsedSinceStart < STARTUP_GRACE_MS;

        if (isStartupWindow) {
          // Auto-install path: stash the changelog so the post-update modal
          // can show it after relaunch, then download+install silently.
          localStorage.setItem(LS_PENDING_VERSION, update.version);
          localStorage.setItem(LS_PENDING_NOTES, update.body ?? "");
          sounds.notification();
          await runInstall(update, true);
        } else {
          // Mid-session: ask the user (no surprise restarts while playing).
          setFreshArrival({
            version: update.version,
            date: update.date,
            notes: update.body,
            update,
          });
          sounds.updateArrived();
        }
      } catch (err) {
        console.warn("[updater] check failed:", err);
      }
    };

    // Initial check
    void tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 2.b. Manual update check from tray menu ───────────────────────
  //
  // The user clicked "Chercher une mise à jour" from the tray context
  // menu. Re-runs `check()` and surfaces feedback ALWAYS — including
  // when no update is available (which the silent poll just ignores).
  // The "no update" feedback is a small auto-fading toast, the "update
  // found" feedback re-uses the existing FreshArrivalModal flow.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("tray-check-update", async () => {
      if (cancelled) return;
      setStatus({ kind: "manual-checking" });
      sounds.click();
      try {
        const update = await check();
        if (cancelled) return;
        if (!update) {
          // Already on the latest. Tiny success toast, auto-clears
          // after 3 seconds so it doesn't sit on the screen forever.
          const currentVer = await getVersion();
          setStatus({ kind: "up-to-date", version: currentVer });
          setDismissed(false);
          window.setTimeout(() => {
            setStatus((s) => (s.kind === "up-to-date" ? { kind: "idle" } : s));
          }, 3000);
          return;
        }
        // Update found — short-circuit the startup-grace check and just
        // ask the user (manual click ⇒ they're awake, surface the modal).
        seenVersion.current = update.version;
        setFreshArrival({
          version: update.version,
          date: update.date,
          notes: update.body,
          update,
        });
        setStatus({ kind: "idle" });
        sounds.updateArrived();
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "error", message });
        sounds.error();
      }
    }).then((u) => {
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ─── 3. Install pipeline ──────────────────────────────────────────────
  const runInstall = async (update: Update, auto: boolean) => {
    let downloaded = 0;
    let total = 0;
    setFreshArrival(null);
    setDismissed(false);
    setStatus({ kind: "downloading", progress: 0, total: 0, auto });

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setStatus({ kind: "downloading", progress: 0, total, auto });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setStatus({ kind: "downloading", progress: downloaded, total, auto });
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

  const showProgressBanner = !(status.kind === "idle" || status.kind === "available" || dismissed);

  return (
    <>
      {showProgressBanner && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="no-drag fixed bottom-6 right-6 z-50 w-96 overflow-hidden rounded-2xl glass-strong shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-accent/20"
          >
            {status.kind === "downloading" && (
              <Downloading progress={status.progress} total={status.total} auto={status.auto} />
            )}
            {status.kind === "ready" && <Ready />}
            {status.kind === "error" && (
              <ErrorState message={status.message} onClose={() => setDismissed(true)} />
            )}
            {status.kind === "manual-checking" && <ManualChecking />}
            {status.kind === "up-to-date" && (
              <UpToDate
                version={status.version}
                onClose={() => setStatus({ kind: "idle" })}
              />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <AnimatePresence>
        {freshArrival && (
          <FreshArrivalModal
            version={freshArrival.version}
            date={freshArrival.date}
            notes={freshArrival.notes}
            onInstall={() => void runInstall(freshArrival.update, false)}
            onLater={() => setFreshArrival(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {justUpdated && (
          <JustUpdatedModal
            version={justUpdated.version}
            notes={justUpdated.notes}
            onClose={() => setJustUpdated(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Downloading({ progress, total, auto }: { progress: number; total: number; auto: boolean }) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
          <RefreshCw className="size-4 animate-spin" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <div className="font-medium text-fg-primary">
            {auto ? "Mise à jour automatique" : "Téléchargement"}
          </div>
          <div className="text-xs text-fg-muted">
            {total > 0 ? `${mb(progress)} / ${mb(total)} Mo · ${pct}%` : "Préparation…"}
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

/** Banner shown while the user-triggered (tray menu) manual check is
 *  in flight. Tiny — usually clears in < 1 second. */
function ManualChecking() {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
        <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-fg-primary">
          Recherche de mises à jour…
        </div>
        <div className="text-xs text-fg-muted">Connexion au serveur</div>
      </div>
    </div>
  );
}

/** "You're already on the latest version" feedback — auto-dismisses
 *  after 3 s but the X button lets the user close it earlier. Only
 *  shown for manual checks (the silent 2-min poll never surfaces this
 *  to avoid notification spam). */
function UpToDate({ version, onClose }: { version: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="grid size-9 place-items-center rounded-lg bg-success/15 text-success ring-1 ring-success/30">
        <CheckCircle2 className="size-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg-primary">
          Tu es déjà à jour
        </div>
        <div className="truncate text-xs text-fg-muted">
          Version actuelle : {formatDisplay(version)}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
        aria-label="Fermer"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Renders a release timestamp in the user's locale, with a relative phrasing
 * for fresh arrivals and a calendar fallback for older releases.
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
          <div className="font-display text-3xl text-fg-primary">{formatDisplay(version)}</div>
          {date && (
            <div className="mt-1 text-xs text-fg-dim">Sortie {formatReleaseDate(date)}</div>
          )}
          <p className="mt-2 text-sm text-fg-muted">
            Une nouvelle version vient de sortir pendant que tu utilisais le launcher. Au prochain démarrage elle s'installera automatiquement, ou tu peux l'installer maintenant.
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

/**
 * Modal shown on the FIRST boot of a freshly auto-installed version.
 * Purely informational — surfaces the changelog of the version that was
 * just installed so the user knows what changed. No install buttons since
 * the install already happened.
 */
function JustUpdatedModal({
  version,
  notes,
  onClose,
}: {
  version: string;
  notes: string | null;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring", stiffness: 280, damping: 22 },
        }}
        exit={{ opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.18 } }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[34rem] max-w-[92vw] overflow-hidden rounded-3xl glass-strong p-7 shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-emerald-400/40"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg-primary"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>

        <div className="relative flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              transition: { type: "spring", stiffness: 380, damping: 18, delay: 0.1 },
            }}
            className="mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40 shadow-[0_0_28px_rgba(74,222,128,0.4)]"
          >
            <CheckCircle2 className="size-7" strokeWidth={2} />
          </motion.div>

          <div className="mb-1 text-xs uppercase tracking-[0.25em] text-emerald-300">
            Launcher mis à jour
          </div>
          <div className="font-display text-3xl text-fg-primary">{formatDisplay(version)}</div>
          <p className="mt-2 text-sm text-fg-muted">
            Tu utilises maintenant la dernière version. Voici ce qui a changé.
          </p>

          {notes && notes.trim().length > 0 ? (
            <div className="mt-5 max-h-[55vh] w-full overflow-y-auto rounded-xl bg-bg-base/30 p-4 text-left ring-1 ring-white/[0.04] [scrollbar-width:thin]">
              <ChangelogRenderer notes={notes} />
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-bg-base/30 px-4 py-3 text-sm text-fg-muted ring-1 ring-white/[0.04]">
              Aucune note de version enregistrée pour cette mise à jour.
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-xl bg-emerald-400/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30 transition-shadow hover:shadow-[0_0_28px_rgba(74,222,128,0.4)]"
          >
            C'est noté !
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
