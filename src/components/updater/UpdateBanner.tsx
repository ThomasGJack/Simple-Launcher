import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Rocket,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { sounds } from "@/lib/sounds";
import { formatDisplay } from "@/lib/version";
import { achievementFlags } from "@/lib/achievementFlags";
import { ChangelogRenderer } from "./ChangelogRenderer";
import { cn } from "@/lib/cn";

type Status =
  | { kind: "idle" }
  | { kind: "available"; update: Update } // mid-session detection only
  | {
      kind: "downloading";
      progress: number;
      total: number;
      auto: boolean;
      version: string;
      /** Bytes-per-second EWMA — recomputed on every Progress chunk
       *  via a 0.7 / 0.3 smoothing factor so the displayed speed
       *  doesn't flicker on bursty network. */
      bytesPerSec: number;
      /** Wall-clock (ms) when the download started — used as the
       *  basis for ETA calculation when no rolling window data
       *  is available yet. */
      startedAtMs: number;
    }
  | { kind: "installing"; version: string }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string; canRetry: boolean }
  // User-triggered manual check states (from tray "Chercher une mise à
  // jour"). The silent poll skips all of these — they're only emitted
  // when the user explicitly asked, so we owe them feedback.
  | { kind: "manual-checking" }
  | { kind: "up-to-date"; version: string };

/** Visual step shown in the stepper at top of the download HUD. */
type Step = "check" | "download" | "install" | "relaunch";

/** Index in the 4-step flow used to drive the stepper UI. */
function statusToStep(status: Status): Step {
  switch (status.kind) {
    case "manual-checking":
      return "check";
    case "downloading":
      return "download";
    case "installing":
      return "install";
    case "ready":
      return "relaunch";
    default:
      return "check";
  }
}

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
  /** Welcome modal shown on the VERY FIRST boot ever (no prior
   *  lastSeenVersion in localStorage). One-shot onboarding, polished
   *  to feel like a flagship product launch. Skipped after a normal
   *  upgrade since lastSeen is already set. */
  const [welcome, setWelcome] = useState<{ version: string } | null>(null);

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

        // Three mutually-exclusive boot kinds :
        //  1. lastSeen === null            → very first boot ever, show
        //                                    welcome modal
        //  2. fresh update detected        → show just-updated modal
        //  3. otherwise                    → no modal
        if (lastSeen === null) {
          setWelcome({ version: currentVer });
          sounds.success();
        } else {
          const isFreshUpdate =
            lastSeen !== currentVer && pendingVer === currentVer;
          if (isFreshUpdate) {
            setJustUpdated({ version: currentVer, notes: pendingNotes });
            sounds.success();
          }
        }
        // Consume any pending changelog so we don't replay it later.
        localStorage.removeItem(LS_PENDING_VERSION);
        localStorage.removeItem(LS_PENDING_NOTES);
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
        setStatus({ kind: "error", message, canRetry: false });
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
  // Tracks an EWMA of the download speed across Progress events. EWMA
  // (instead of raw delta) smooths out the displayed Mo/s + ETA so they
  // don't flicker every chunk. Reset on each new install.
  const downloadStatsRef = useRef<{
    lastTickMs: number;
    bytesPerSec: number;
  }>({ lastTickMs: 0, bytesPerSec: 0 });

  const runInstall = async (update: Update, auto: boolean) => {
    let downloaded = 0;
    let total = 0;
    const startedAtMs = Date.now();
    downloadStatsRef.current = { lastTickMs: startedAtMs, bytesPerSec: 0 };
    setFreshArrival(null);
    setDismissed(false);
    setStatus({
      kind: "downloading",
      progress: 0,
      total: 0,
      auto,
      version: update.version,
      bytesPerSec: 0,
      startedAtMs,
    });

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setStatus({
              kind: "downloading",
              progress: 0,
              total,
              auto,
              version: update.version,
              bytesPerSec: 0,
              startedAtMs,
            });
            break;
          case "Progress": {
            downloaded += event.data.chunkLength;
            // EWMA on bytes-per-second over the time delta since the
            // last chunk. α=0.3 means new measurement contributes 30 %,
            // history 70 % — feels responsive without jittering.
            const now = Date.now();
            const last = downloadStatsRef.current;
            const dt = Math.max(1, now - last.lastTickMs);
            const instant = (event.data.chunkLength * 1000) / dt;
            const smoothed =
              last.bytesPerSec === 0
                ? instant
                : last.bytesPerSec * 0.7 + instant * 0.3;
            downloadStatsRef.current = {
              lastTickMs: now,
              bytesPerSec: smoothed,
            };
            setStatus({
              kind: "downloading",
              progress: downloaded,
              total,
              auto,
              version: update.version,
              bytesPerSec: smoothed,
              startedAtMs,
            });
            break;
          }
          case "Finished":
            // Download done — flip into "installing" while Tauri runs
            // the NSIS silent install. The Finished event fires before
            // the install actually completes, so we get a clean
            // "Téléchargement → Installation" transition for the user.
            setStatus({ kind: "installing", version: update.version });
            break;
        }
      });
      // downloadAndInstall resolves → install actually finished. Show
      // a brief "Ready" state with countdown before relaunch.
      setStatus({ kind: "ready", version: update.version });
      // Update finished downloading + installing → unlock #40 "Up to
      // date". The relaunch happens immediately after but we mark first
      // because relaunch tears down localStorage write paths abruptly.
      achievementFlags.markUpdateInstalled();
      // Brief pause so the "Ready / countdown" state has time to render
      // before the relaunch tears the window down (~700 ms feels good
      // — long enough to perceive, short enough not to feel sluggish).
      await new Promise((r) => setTimeout(r, 700));
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message, canRetry: true });
      sounds.error();
    }
  };

  const showProgressBanner = !(
    status.kind === "idle" || status.kind === "available" || dismissed
  );

  // Stepper is shown for the long-form HUD states only (downloading
  // through relaunch). Manual check / up-to-date / error use the
  // tiny banner shape — they're transient feedback, not a multi-step
  // process the user needs to track.
  const hasStepper =
    status.kind === "downloading" ||
    status.kind === "installing" ||
    status.kind === "ready";

  // Latest update we attempted to install. Captured so the retry
  // button on the error state can re-call runInstall without a
  // fresh check() round-trip.
  const lastUpdateRef = useRef<Update | null>(null);
  if (
    freshArrival?.update &&
    lastUpdateRef.current?.version !== freshArrival.update.version
  ) {
    lastUpdateRef.current = freshArrival.update;
  }

  return (
    <>
      <AnimatePresence>
        {showProgressBanner && (
          <motion.div
            key="update-hud"
            initial={{ opacity: 0, y: 60, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className={cn(
              "no-drag fixed bottom-6 right-6 z-50 overflow-hidden rounded-2xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1",
              hasStepper ? "w-[28rem]" : "w-96",
              status.kind === "error"
                ? "ring-danger/30"
                : status.kind === "ready"
                  ? "ring-emerald-400/40"
                  : "ring-accent/30",
            )}
          >
            {/* Animated background sheen — only during the long-form
                states where the user is watching for several seconds.
                Cyan/transparent gradient sweep that reads as "in
                progress" without being distracting. */}
            {hasStepper && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/[0.08] to-accent/0"
                animate={{ x: ["-100%", "100%"] }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
            )}

            {hasStepper && <Stepper currentStep={statusToStep(status)} />}

            {status.kind === "downloading" && (
              <Downloading
                progress={status.progress}
                total={status.total}
                auto={status.auto}
                version={status.version}
                bytesPerSec={status.bytesPerSec}
                startedAtMs={status.startedAtMs}
              />
            )}
            {status.kind === "installing" && (
              <Installing version={status.version} />
            )}
            {status.kind === "ready" && <Ready version={status.version} />}
            {status.kind === "error" && (
              <ErrorState
                message={status.message}
                canRetry={status.canRetry && !!lastUpdateRef.current}
                onRetry={() => {
                  if (lastUpdateRef.current) {
                    void runInstall(lastUpdateRef.current, false);
                  }
                }}
                onClose={() => setDismissed(true)}
              />
            )}
            {status.kind === "manual-checking" && <ManualChecking />}
            {status.kind === "up-to-date" && (
              <UpToDate
                version={status.version}
                onClose={() => setStatus({ kind: "idle" })}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {welcome && (
          <WelcomeModal
            version={welcome.version}
            onClose={() => setWelcome(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * 4-step progress indicator at the top of the update HUD. Each step
 * is a labelled dot ; the current step pulses, completed steps fill
 * solid + a connecting line draws between them. Mirrors the
 * "Vérification → Téléchargement → Installation → Redémarrage" flow.
 */
function Stepper({ currentStep }: { currentStep: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "check", label: "Vérification" },
    { id: "download", label: "Téléchargement" },
    { id: "install", label: "Installation" },
    { id: "relaunch", label: "Redémarrage" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === currentStep);
  return (
    <div className="relative border-b border-white/[0.06] bg-bg-base/30 px-5 pb-3 pt-4">
      <div className="flex items-center justify-between gap-1">
        {steps.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div
              key={s.id}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div className="flex w-full items-center">
                {/* Connector to previous step */}
                {i > 0 && (
                  <div
                    className={cn(
                      "h-px flex-1 transition-colors",
                      i <= currentIdx ? "bg-accent/60" : "bg-white/[0.08]",
                    )}
                  />
                )}
                <motion.div
                  initial={false}
                  animate={{
                    scale: active ? [1, 1.18, 1] : 1,
                  }}
                  transition={
                    active
                      ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.2 }
                  }
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full ring-1 transition-colors",
                    done
                      ? "bg-accent text-bg-base ring-accent shadow-[0_0_10px_var(--color-accent-glow)]"
                      : active
                        ? "bg-accent/20 text-accent ring-accent/60"
                        : "bg-bg-base/60 text-fg-dim ring-white/[0.08]",
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="size-3" strokeWidth={3} />
                  ) : (
                    <span className="text-[9px] font-bold tabular-nums">
                      {i + 1}
                    </span>
                  )}
                </motion.div>
                {/* Connector to next step */}
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-px flex-1 transition-colors",
                      i < currentIdx ? "bg-accent/60" : "bg-white/[0.08]",
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-[9px] uppercase tracking-wider transition-colors",
                  active
                    ? "text-accent"
                    : done
                      ? "text-fg-muted"
                      : "text-fg-dim",
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Format a Mo/s number into a compact human-readable label. Below
 * 1 Mo/s we drop to Ko/s ; above 100 Mo/s we round to integers.
 */
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "—";
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps < 1) {
    const kbps = bytesPerSec / 1024;
    return `${kbps.toFixed(0)} Ko/s`;
  }
  if (mbps >= 100) return `${Math.round(mbps)} Mo/s`;
  return `${mbps.toFixed(1)} Mo/s`;
}

/** Format a remaining-seconds number into "Xs" or "Xm Ys". */
function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "calcul…";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds - m * 60);
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

function Downloading({
  progress,
  total,
  auto,
  version,
  bytesPerSec,
  startedAtMs,
}: {
  progress: number;
  total: number;
  auto: boolean;
  version: string;
  bytesPerSec: number;
  startedAtMs: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  // ETA = remaining bytes / current speed. If the EWMA hasn't
  // converged yet, fall back to an average over the wall-clock since
  // the download started — feels more stable in the first second.
  const remainingBytes = Math.max(0, total - progress);
  const speedForEta = (() => {
    if (bytesPerSec > 0) return bytesPerSec;
    const elapsedSec = (Date.now() - startedAtMs) / 1000;
    return elapsedSec > 0.4 ? progress / elapsedSec : 0;
  })();
  const etaSec = speedForEta > 0 ? remainingBytes / speedForEta : Infinity;

  return (
    <div className="relative p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative shrink-0">
          {/* Pulsing halo behind the icon */}
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-xl bg-accent/30 blur-md"
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative grid size-11 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/40 shadow-[0_0_18px_var(--color-accent-soft)]">
            <Download className="size-5" strokeWidth={2.4} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg-primary">
              {auto ? "Mise à jour automatique" : "Téléchargement en cours"}
            </span>
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent ring-1 ring-accent/30">
              {formatDisplay(version)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-fg-muted">
            {total > 0
              ? `${mb(progress)} / ${mb(total)} Mo`
              : "Connexion au serveur…"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl tabular-nums text-fg-primary">
            {pct}
            <span className="text-sm text-fg-dim">%</span>
          </div>
        </div>
      </div>

      {/* Progress bar with shimmer overlay */}
      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/[0.04]">
        <motion.div
          className="relative h-full bg-gradient-to-r from-accent to-accent shadow-[0_0_18px_var(--color-accent-glow)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{
            backgroundImage:
              "linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 80%, white 0%), var(--color-accent), color-mix(in srgb, var(--color-accent) 80%, white 0%))",
          }}
        >
          {/* Inner shimmer that sweeps left-to-right inside the
              filled portion. Adds a "live" feel without obscuring
              the actual fill. */}
          <motion.div
            aria-hidden
            className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ["0%", "400%"] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        </motion.div>
      </div>

      {/* Stats row : speed + ETA */}
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <div className="inline-flex items-center gap-1.5 text-accent">
          <Zap className="size-3" strokeWidth={2.5} />
          <span className="font-mono tabular-nums">
            {formatSpeed(bytesPerSec)}
          </span>
        </div>
        <div className="text-fg-dim">
          {total > 0 ? (
            <>
              Reste{" "}
              <span className="font-mono tabular-nums text-fg-muted">
                {formatEta(etaSec)}
              </span>
            </>
          ) : (
            <span className="text-fg-dim">Préparation…</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shown between download finish and final relaunch — the NSIS
 * silent install runs here. No determinate progress, just an
 * indeterminate state with a soft pulse.
 */
function Installing({ version }: { version: string }) {
  return (
    <div className="relative p-5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-xl bg-accent/40 blur-md"
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            className="relative grid size-11 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/40"
          >
            <Package className="size-5" strokeWidth={2.4} />
          </motion.div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg-primary">
              Installation en cours
            </span>
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent ring-1 ring-accent/30">
              {formatDisplay(version)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted">
            Application des fichiers — quelques secondes…
          </div>
        </div>
      </div>
      {/* Indeterminate progress bar */}
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </div>
  );
}

/** Final "we're done, restarting now" state. Shown for ~700 ms
 *  before the relaunch tears down the window. */
function Ready({ version }: { version: string }) {
  return (
    <div className="relative p-5 text-center">
      <motion.div
        initial={{ scale: 0.5, rotate: -20 }}
        animate={{
          scale: 1,
          rotate: 0,
          transition: { type: "spring", stiffness: 380, damping: 16 },
        }}
        className="relative mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40 shadow-[0_0_28px_rgba(74,222,128,0.4)]"
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-emerald-400/30 blur-md"
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <Rocket className="relative size-6" strokeWidth={2.2} />
      </motion.div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">
        Prêt
      </div>
      <div className="mt-1 font-display text-xl text-fg-primary">
        Redémarrage en cours
      </div>
      <div className="mt-1 text-[11px] text-fg-muted">
        Tu seras à jour vers {formatDisplay(version)} dans une seconde…
      </div>
    </div>
  );
}

function ErrorState({
  message,
  canRetry,
  onRetry,
  onClose,
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/15 text-danger ring-1 ring-danger/40">
          <AlertTriangle className="size-5" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-danger">
            Échec de la mise à jour
          </div>
          <p className="mt-1 line-clamp-3 break-words text-[11px] text-fg-muted">
            {message || "Erreur inconnue."}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
          aria-label="Fermer"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex gap-2">
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/25"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <RefreshCw className="size-3" /> Réessayer
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.04] hover:text-fg-primary",
            canRetry ? "" : "flex-1",
          )}
        >
          Fermer
        </button>
      </div>
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

// ─── Welcome modal (very first boot ever) ────────────────────────────
//
// Shown once, the very first time the launcher boots after a fresh
// install. Detected by `lastSeenVersion === null` in localStorage.
// After this modal closes, lastSeenVersion is set and subsequent boots
// skip the welcome flow entirely.
//
// Visual brief : full-bleed cyan accent gradient + animated logo halo +
// typed-on tagline + 4 highlights + a single "Démarrer" CTA. No skip
// button — the user only sees this once, and we want it to feel like a
// proper product introduction.

const WELCOME_HIGHLIGHTS: { icon: typeof Rocket; title: string; body: string }[] =
  [
    {
      icon: Rocket,
      title: "Lance tes jeux",
      body: "Bibliothèque centralisée, pages custom par jeu, lancements en un clic.",
    },
    {
      icon: Sparkles,
      title: "Crews & overlay",
      body: "Channels Discord-style, voice tools en chantier, overlay in-game shift+F9.",
    },
    {
      icon: CheckCircle2,
      title: "Achievements & profil",
      body: "50 succès à débloquer, heatmap des heures de jeu, profil partageable.",
    },
    {
      icon: Zap,
      title: "Mises à jour live",
      body: "Auto-update silencieux, changelog joli, jamais d'install gênante.",
    },
  ];

function WelcomeModal({
  version,
  onClose,
}: {
  version: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/85 backdrop-blur-xl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.86, y: 30 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring", stiffness: 240, damping: 24 },
        }}
        exit={{ opacity: 0, scale: 0.92, y: 20, transition: { duration: 0.2 } }}
        className="relative w-[40rem] max-w-[94vw] overflow-hidden rounded-3xl glass-strong shadow-[0_40px_100px_rgba(0,0,0,0.7)] ring-1 ring-accent/40"
      >
        {/* Animated multi-layer background glow */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-accent/25 blur-3xl"
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-0 size-[20rem] rounded-full bg-fuchsia-500/20 blur-3xl"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.2,
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-0 size-[20rem] rounded-full bg-violet-500/20 blur-3xl"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.6,
          }}
        />

        {/* Top accent rule */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent"
        />

        <div className="relative px-9 pb-8 pt-10">
          <div className="flex flex-col items-center text-center">
            {/* Animated logo halo */}
            <motion.div
              initial={{ scale: 0.5, rotate: -15 }}
              animate={{
                scale: 1,
                rotate: 0,
                transition: {
                  type: "spring",
                  stiffness: 220,
                  damping: 18,
                  delay: 0.1,
                },
              }}
              className="relative mb-5"
            >
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-2xl bg-accent/40 blur-xl"
                animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.95, 1.1, 0.95] }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <div className="relative grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/40 shadow-[0_0_36px_var(--color-accent-glow)]">
                <Rocket className="size-8" strokeWidth={2} />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.25 } }}
              className="mb-1 text-xs uppercase tracking-[0.3em] text-accent"
            >
              Bienvenue à bord
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.32 } }}
              className="font-display text-4xl text-fg-primary"
            >
              Simple Launcher
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.4 } }}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 font-mono text-[11px] text-accent ring-1 ring-accent/25"
            >
              <Sparkles className="size-3" />
              {formatDisplay(version)}
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.48 } }}
              className="mt-5 max-w-md text-sm leading-relaxed text-fg-muted"
            >
              Ton launcher multi-jeux est installé. Voici ce qui t'attend pour
              démarrer du bon pied.
            </motion.p>

            {/* Highlights grid — 2 × 2 on desktop, animated in sequence */}
            <div className="mt-7 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {WELCOME_HIGHLIGHTS.map((h, i) => {
                const Icon = h.icon;
                return (
                  <motion.div
                    key={h.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: 0.55 + i * 0.08 },
                    }}
                    className="flex items-start gap-3 rounded-xl bg-bg-base/30 p-3.5 text-left ring-1 ring-white/[0.05]"
                  >
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
                      <Icon className="size-4" strokeWidth={2.4} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-fg-primary">
                        {h.title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-fg-muted">
                        {h.body}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  delay: 0.55 + WELCOME_HIGHLIGHTS.length * 0.08 + 0.1,
                },
              }}
              onClick={() => {
                sounds.click();
                onClose();
              }}
              className="no-drag mt-7 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-bg-base shadow-[0_0_24px_var(--color-accent-glow)] transition-shadow hover:shadow-[0_0_36px_var(--color-accent-glow)]"
              style={{ color: "var(--color-on-accent)" }}
            >
              <Rocket className="size-4" strokeWidth={2.5} />
              Démarrer
            </motion.button>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: {
                  delay: 0.55 + WELCOME_HIGHLIGHTS.length * 0.08 + 0.2,
                },
              }}
              className="mt-3 text-[10px] text-fg-dim"
            >
              Tu peux ouvrir le menu de l'icône bas-gauche à tout moment
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
