import { collection, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { getFirebase } from "@/firebase/config";

export type LogLevel = "info" | "warn" | "error" | "action" | "bug";

/**
 * One log entry as stored in Firestore. The shape stays flat & primitive
 * (no class instances, no functions) so Firestore can serialize it without
 * surprises and the admin panel can display it generically.
 */
export type LogEntry = {
  uid: string;
  userName: string;
  userAvatar: string | null;
  level: LogLevel;
  message: string;
  /** Component / module that produced the entry, e.g. "MessagesPage" or
   *  "minecraft.installModpack" — surfaces in the admin panel as a chip. */
  source?: string;
  /** Free-form structured payload — anything JSON-serializable. Captured
   *  errors include `{ stack, filename, line, col }`; user actions usually
   *  include identifying ids (moduleId, conversationId, etc.). */
  metadata?: Record<string, unknown>;
  /** Client-side `Date.now()` at log time — used for ordering when the
   *  Firestore server timestamp hasn't landed yet. */
  ts: number;
  /** Unique id generated once per app launch, identical across all entries
   *  from the same session — lets the admin group a user's bug report by
   *  the session that triggered it. */
  sessionId: string;
  launcherVersion: string;
  userAgent: string;
};

/**
 * In-memory log buffer with periodic batched flush to Firestore. Calls to
 * `logger.log` are cheap (just a buffer push + console mirror) — the
 * network round-trip is amortized across up to 50 entries every 10s.
 *
 * Designed to never throw: any flush failure restores the failed batch to
 * the buffer head so it gets retried on the next flush. If the user is
 * offline or unauthenticated, entries simply queue until they can ship.
 */
class Logger {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  private uid: string | null = null;
  private userName: string | null = null;
  private userAvatar: string | null = null;
  private launcherVersion: string =
    (import.meta.env?.VITE_LAUNCHER_VERSION as string | undefined) ?? "dev";
  private flushing = false;
  private lastFlushedAt: number | null = null;
  private lastFlushError: string | null = null;
  private totalShipped = 0;

  private readonly FLUSH_INTERVAL_MS = 5_000;
  private readonly MAX_BUFFER_SIZE = 30;
  private readonly MAX_RETAINED = 500;

  /** Diagnostics surface for the AdminLogsPage debug banner. */
  diagnostics(): {
    uid: string | null;
    bufferSize: number;
    lastFlushedAt: number | null;
    lastFlushError: string | null;
    totalShipped: number;
    sessionId: string;
  } {
    return {
      uid: this.uid,
      bufferSize: this.buffer.length,
      lastFlushedAt: this.lastFlushedAt,
      lastFlushError: this.lastFlushError,
      totalShipped: this.totalShipped,
      sessionId: this.sessionId,
    };
  }

  /** Called after Discord auth completes — attaches identity to subsequent
   *  log entries and triggers a flush of any logs queued while anonymous. */
  setUser(uid: string | null, userName: string | null, userAvatar: string | null): void {
    this.uid = uid;
    this.userName = userName;
    this.userAvatar = userAvatar;
    if (uid && this.buffer.length > 0) {
      // Backfill identity on entries logged before login completed
      for (const entry of this.buffer) {
        if (!entry.uid || entry.uid === "anon") entry.uid = uid;
        if (!entry.userName || entry.userName === "Anonymous")
          entry.userName = userName ?? "Anonymous";
        if (entry.userAvatar === null) entry.userAvatar = userAvatar;
      }
      void this.flush();
    }
  }

  /** Sets the launcher version label that gets stamped on every log entry.
   *  Called once at startup with the value from tauri.conf.json. */
  setLauncherVersion(version: string): void {
    this.launcherVersion = version;
  }

  log(level: LogLevel, message: string, opts?: { source?: string; metadata?: Record<string, unknown> }): void {
    const entry: LogEntry = {
      uid: this.uid ?? "anon",
      userName: this.userName ?? "Anonymous",
      userAvatar: this.userAvatar,
      level,
      message: truncate(message, 2000),
      source: opts?.source,
      metadata: opts?.metadata,
      ts: Date.now(),
      sessionId: this.sessionId,
      launcherVersion: this.launcherVersion,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    };

    // Console mirror so devs can still see it during testing.
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

    this.buffer.push(entry);
    // Drop the oldest entries when the buffer balloons (network down for hours).
    if (this.buffer.length > this.MAX_RETAINED) {
      this.buffer.splice(0, this.buffer.length - this.MAX_RETAINED);
    }

    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.FLUSH_INTERVAL_MS);
    }
  }

  // Convenience helpers — all delegate to `log` with a fixed level.
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

  /** Pushes the in-memory buffer to Firestore in one batched commit.
   *  Idempotent + reentrancy-safe: a second flush() during an in-flight
   *  one is a no-op. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.buffer.length === 0) return;
    if (!this.uid || this.uid === "anon") return; // wait for auth
    const fb = getFirebase();
    if (!fb || !fb.auth.currentUser) return;

    this.flushing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Take a snapshot of what we're flushing — new logs arriving during the
    // network round-trip will queue for the next flush.
    const batchSize = Math.min(this.buffer.length, 500);
    const drained = this.buffer.splice(0, batchSize);

    try {
      const batch = writeBatch(fb.db);
      const colRef = collection(fb.db, "logs");
      for (const entry of drained) {
        const ref = doc(colRef);
        // Firestore rejects writes containing `undefined` anywhere in the
        // payload. Strip recursively so optional fields like `source` and
        // `metadata` (or undefined values inside metadata) don't blow up
        // the entire batch.
        const cleaned = stripUndefined({
          ...entry,
          // Server-side timestamp lets the admin panel sort consistently
          // even if user clocks are skewed. We still keep the client `ts`.
          serverTs: serverTimestamp(),
        });
        batch.set(ref, cleaned as Record<string, unknown>);
      }
      await batch.commit();
      this.lastFlushedAt = Date.now();
      this.lastFlushError = null;
      this.totalShipped += drained.length;
    } catch (err) {
      // Restore the failed batch at the head so order is preserved.
      this.buffer.unshift(...drained);
      const msg = err instanceof Error ? err.message : String(err);
      this.lastFlushError = msg;
      // Avoid recursive logging on a logger failure — just console.warn.
      console.warn("[logger] flush failed, will retry:", err);
    } finally {
      this.flushing = false;
    }
  }

  /** Best-effort flush at app shutdown. Browsers don't always honor async
   *  work in `beforeunload`, so this is a fire-and-forget. */
  flushSync(): void {
    void this.flush();
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "…";
}

/**
 * Recursively removes `undefined` values from an object tree. Firestore
 * rejects writes that contain `undefined` anywhere — even nested inside
 * optional metadata. We replace them with absent keys (Firestore handles
 * missing fields gracefully). `null` is preserved (it's a valid Firestore
 * value, distinct from `undefined`).
 *
 * Returns the same shape as input, just with `undefined` keys filtered.
 * Doesn't mutate the original.
 */
function stripUndefined<T>(value: T): T {
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export const logger = new Logger();

// ---------------------------------------------------------------------------
//                           AUTO-CAPTURE WIRING
// ---------------------------------------------------------------------------

let installed = false;

/**
 * Installs window-level error handlers + a `console.error` patch so any
 * uncaught error / rejected promise / explicit `console.error(...)` call
 * gets shipped to Firestore as a `bug`/`error` log entry.
 *
 * Safe to call multiple times — only the first call wires up.
 */
export function installGlobalLoggerHandlers(): void {
  if (installed) return;
  installed = true;

  if (typeof window !== "undefined") {
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

    // Best-effort flush on tab close. addEventListener is preferred over
    // window.onbeforeunload so we don't clobber any other handler.
    window.addEventListener("beforeunload", () => {
      logger.flushSync();
    });

    // Tauri hides the window on close (system tray UX) instead of unloading,
    // so beforeunload doesn't fire on close. Flush whenever the window
    // becomes hidden — covers tray-hide AND tab-switch scenarios.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) logger.flushSync();
      });
    }
  }

  // Patch console.error so explicit error logs also reach Firestore.
  // We keep the original to preserve devtools formatting + stack traces.
  const original = console.error;
  console.error = function (...args: unknown[]) {
    original.apply(console, args);
    try {
      const msg = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message;
          if (typeof arg === "string") return arg;
          return safeStringify(arg);
        })
        .join(" ");
      // Skip our own logger output to avoid feedback loops
      if (msg.startsWith("[logger]")) return;
      logger.error(msg, { source: "console.error" });
    } catch {
      /* never throw from a console patch */
    }
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
