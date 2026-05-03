import { invoke } from "@tauri-apps/api/core";
import { uploadLogFile } from "@/firebase/logFiles";

export type LogLevel = "info" | "warn" | "error" | "action" | "bug";

/**
 * Single log entry produced by `logger.log(...)`. Stored locally in a
 * plain-text file (one line per entry) under `<APPDATA>/Simple Launcher/
 * logs/session-{sessionId}-{startedAt}.log` and uploaded periodically to
 * Firebase Storage at `users/{uid}/logs/{fileName}`.
 */
export type LogEntry = {
  ts: number;
  level: LogLevel;
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type OrphanFile = { fileName: string; content: string };

/** How often the active log file is uploaded to Storage. 4 hours is the
 *  user-visible cap on "how stale can the admin's view of my logs be?". */
const UPLOAD_INTERVAL_MS = 4 * 60 * 60 * 1000;

class Logger {
  private uid: string | null = null;
  private userName: string | null = null;
  /** Calver-formatted version (e.g. "v26.04.29.10"). Initialised
   *  synchronously from the Vite-injected `__APP_CALVER__` so the very
   *  first log file written has the right version in its name — no race
   *  vs the async `getVersion()` call from Tauri. Stripped of the leading
   *  "v" so we can re-add it consistently in `computeFileName`. */
  private launcherVersion: string =
    (typeof __APP_CALVER__ === "string" ? __APP_CALVER__ : "vdev").replace(/^v/, "");
  private sessionId: string =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  private sessionStartMs = Date.now();
  /** Lazily computed on first append. Now safe to compute eagerly since
   *  the version is known synchronously at module load — but kept lazy so
   *  `setLauncherVersion` can still override (e.g. dev with a custom
   *  semver) before the first line. Format:
   *  `2026-04-29_23-27_v26.04.29.10_4d8bb1e3.log`. */
  private _fileName: string | null = null;
  private get fileName(): string {
    if (!this._fileName) this._fileName = this.computeFileName();
    return this._fileName;
  }
  private computeFileName(): string {
    const d = new Date(this.sessionStartMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
    const versionTag = `v${this.launcherVersion.replace(/[^\w.-]/g, "")}`;
    const shortId = this.sessionId.replace(/-/g, "").slice(0, 8);
    return `${date}_${time}_${versionTag}_${shortId}.log`;
  }
  /** Async queue: every log() call gets serialized through here so we
   *  don't drop entries when the event loop is busy. */
  private writeQueue: Promise<void> = Promise.resolve();
  /** Periodic upload timer + last attempt's success info. */
  private uploadTimer: ReturnType<typeof setInterval> | null = null;
  private lastUploadedAt: number | null = null;
  private lastUploadError: string | null = null;
  private totalLinesWritten = 0;

  /** Attaches the authenticated user to the logger. Triggers (a) a one-time
   *  sweep of orphan files from previous launches → uploaded then deleted,
   *  and (b) the start of the periodic upload cycle. */
  async setUser(uid: string | null, userName: string | null, _userAvatar: string | null = null): Promise<void> {
    const wasAnonymous = !this.uid;
    this.uid = uid;
    this.userName = userName;

    if (uid && wasAnonymous) {
      // First time we know who the user is — backfill the session header
      // and process orphan files.
      await this.appendLine(this.headerLine());
      void this.uploadOrphans();
      this.startUploadTimer();
    } else if (!uid) {
      this.stopUploadTimer();
    }
  }

  /** Stamped on the log file name (and the session header line).
   *
   *  Accepts either a calver string ("v26.04.29.10") or a raw semver
   *  ("26.429.9") — the latter is auto-converted to calver display form
   *  to match the convention used by the rest of the launcher. Once the
   *  filename has been computed (= a log line has been written) further
   *  calls are silently ignored to keep the filename stable. */
  setLauncherVersion(version: string): void {
    if (this._fileName) return; // filename already locked, ignore.
    this.launcherVersion = semverToCalver(version);
  }

  log(level: LogLevel, message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    // Console mirror — devs see it during development. We DO NOT patch
    // console.error globally anymore; that was the source of the spam in
    // the admin panel before this refactor.
    const consoleFn =
      level === "error" || level === "bug"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    if (opts?.metadata) {
      consoleFn(`[${level}]`, message, opts.metadata);
    } else {
      consoleFn(`[${level}]`, message);
    }

    const line = formatLine({
      ts: Date.now(),
      level,
      message,
      source: opts?.source,
      metadata: opts?.metadata,
    });
    this.appendLine(line);
  }

  info(message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    this.log("info", message, opts);
  }
  warn(message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    this.log("warn", message, opts);
  }
  error(message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    this.log("error", message, opts);
  }
  action(message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    this.log("action", message, opts);
  }
  bug(message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    this.log("bug", message, opts);
  }

  /** Surface for the Settings page diagnostic banner / manual upload button. */
  diagnostics(): {
    uid: string | null;
    sessionId: string;
    fileName: string;
    totalLines: number;
    lastUploadedAt: number | null;
    lastUploadError: string | null;
  } {
    return {
      uid: this.uid,
      sessionId: this.sessionId,
      fileName: this.fileName,
      totalLines: this.totalLinesWritten,
      lastUploadedAt: this.lastUploadedAt,
      lastUploadError: this.lastUploadError,
    };
  }

  /** Reads the active session file from disk + uploads to Storage now.
   *  Used by the "Envoyer mes logs maintenant" button in Settings. */
  async uploadNow(): Promise<void> {
    if (!this.uid) {
      this.lastUploadError = "Pas connecté";
      return;
    }
    try {
      const content = await this.readCurrent();
      await uploadLogFile(this.uid, this.fileName, content);
      this.lastUploadedAt = Date.now();
      this.lastUploadError = null;
    } catch (err) {
      this.lastUploadError = err instanceof Error ? err.message : String(err);
      console.warn("[logger] upload failed:", err);
      throw err;
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private appendLine(line: string): void {
    this.totalLinesWritten++;
    // Chain on the existing queue so writes stay ordered even under
    // bursts. Errors are swallowed (logged once via console.warn) so a
    // failed file write never crashes the caller.
    //
    // Important: if the previous link in the chain rejected (e.g. the
    // `invoke` here threw and we didn't catch — defensive only, the inner
    // try/catch should prevent this), the queue would stay rejected and
    // every subsequent append would silently fail. We append a `.catch()`
    // that resets the chain to a fresh resolved promise so the very next
    // log line gets a clean queue. Cheap insurance.
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          await invoke("logs_append", { fileName: this.fileName, line });
        } catch (err) {
          // Only log the first failure to avoid recursion + noise.
          console.warn("[logger] file append failed:", err);
        }
      })
      .catch((err) => {
        console.warn("[logger] write queue rejected, resetting:", err);
        this.writeQueue = Promise.resolve();
      });
  }

  private async readCurrent(): Promise<string> {
    try {
      return await invoke<string>("logs_read", { fileName: this.fileName });
    } catch (err) {
      console.warn("[logger] file read failed:", err);
      return "";
    }
  }

  private headerLine(): string {
    return formatLine({
      ts: Date.now(),
      level: "info",
      message: `=== Session ${this.sessionId} (launcher ${this.launcherVersion}) ===`,
      source: "logger",
      metadata: {
        uid: this.uid,
        userName: this.userName,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        sessionStartMs: this.sessionStartMs,
      },
    });
  }

  private startUploadTimer(): void {
    if (this.uploadTimer) return;
    this.uploadTimer = setInterval(() => {
      void this.uploadNow().catch(() => {});
    }, UPLOAD_INTERVAL_MS);
    // Also do an initial upload after a short grace period so the admin
    // sees fresh activity within minutes of a launch.
    setTimeout(() => {
      void this.uploadNow().catch(() => {});
    }, 60_000);
  }

  private stopUploadTimer(): void {
    if (!this.uploadTimer) return;
    clearInterval(this.uploadTimer);
    this.uploadTimer = null;
  }

  /** At startup, if the previous launch crashed before its file was
   *  uploaded, we find it in the local logs dir and ship it now. Then
   *  we delete it locally so it doesn't accumulate forever. */
  private async uploadOrphans(): Promise<void> {
    if (!this.uid) return;
    let orphans: OrphanFile[] = [];
    try {
      orphans = await invoke<OrphanFile[]>("logs_take_orphans", {
        currentFileName: this.fileName,
      });
    } catch (err) {
      console.warn("[logger] take_orphans failed:", err);
      return;
    }
    for (const o of orphans) {
      try {
        await uploadLogFile(this.uid, o.fileName, o.content);
        await invoke("logs_delete", { fileName: o.fileName });
      } catch (err) {
        console.warn("[logger] orphan upload failed:", o.fileName, err);
      }
    }
  }
}

/**
 * Converts a Tauri/npm semver like "26.429.9" into its calver display
 * form "26.04.29.10" (without the leading "v" — caller adds it). If the
 * input doesn't look like a calver-encoded semver, returns it unchanged
 * (minus a leading "v" if present). Mirrors `formatDisplay()` from
 * `scripts/bump-version.mjs`.
 */
function semverToCalver(input: string): string {
  const cleaned = input.replace(/^v/, "");
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned);
  if (!m) return cleaned;
  const year = parseInt(m[1], 10);
  const mmdd = parseInt(m[2], 10);
  const seq = parseInt(m[3], 10);
  const month = Math.floor(mmdd / 100);
  const day = mmdd % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) return cleaned;
  const pad = (n: number) => String(n).padStart(2, "0");
  const suffix = seq > 0 ? `.${seq + 1}` : "";
  return `${pad(year)}.${pad(month)}.${pad(day)}${suffix}`;
}

function formatLine(entry: LogEntry): string {
  const iso = new Date(entry.ts).toISOString();
  const level = entry.level.toUpperCase().padEnd(6);
  const src = entry.source ? ` [${entry.source}]` : "";
  const meta = entry.metadata ? ` ${safeStringify(entry.metadata)}` : "";
  return `[${iso}] [${level}]${src} ${entry.message}${meta}`;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = new Logger();

// ---------------------------------------------------------------------------
//                       AUTO-CAPTURE WIRING (window-level only)
// ---------------------------------------------------------------------------
//
// We keep `window.error` + `window.unhandledrejection` capture so unhandled
// errors land in the file. We DO NOT patch `console.error` anymore — the
// previous version converted every `console.error(...)` call into a `bug`
// log entry, which created loops and saturated the admin panel with junk.

let installed = false;

export function installGlobalLoggerHandlers(): void {
  if (installed) return;
  installed = true;
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    logger.bug(event.message || "Uncaught error", {
      source: "window.error",
      metadata: {
        filename: event.filename,
        line: event.lineno,
        col: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : safeStringify(reason);
    logger.bug(`Unhandled rejection: ${msg}`, {
      source: "window.unhandledrejection",
      metadata: {
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    });
  });

  // Best-effort upload at unload — fire-and-forget.
  window.addEventListener("beforeunload", () => {
    void logger.uploadNow().catch(() => {});
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void logger.uploadNow().catch(() => {});
    });
  }
}
