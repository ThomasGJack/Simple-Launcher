import {
  isPermissionGranted,
  requestPermission,
  sendNotification as sendNative,
} from "@tauri-apps/plugin-notification";
import { logger } from "@/lib/logger";

/**
 * Thin wrapper around `tauri-plugin-notification`. Handles:
 *  - Requesting notification permission on first use (Windows shows a one-time
 *    consent prompt; subsequent calls don't re-prompt).
 *  - No-op on web / when the plugin isn't available.
 *  - Skipping the OS-level notification when the launcher window is already
 *    focused (would be redundant since the in-app sound + UI already fire).
 */

let permissionState: "unknown" | "checking" | "granted" | "denied" = "unknown";

async function ensurePermission(): Promise<boolean> {
  if (permissionState === "granted") return true;
  if (permissionState === "denied") return false;
  if (permissionState === "checking") {
    // Concurrent call before the first permission resolves — wait briefly
    // by yielding to the event loop, then re-check via the pure store
    // (TypeScript can't track the mutation across the await otherwise).
    await new Promise((r) => setTimeout(r, 100));
    return (permissionState as "unknown" | "checking" | "granted" | "denied") === "granted";
  }
  permissionState = "checking";
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    permissionState = granted ? "granted" : "denied";
    return granted;
  } catch (err) {
    logger.warn(`Notification permission check failed: ${err instanceof Error ? err.message : String(err)}`, {
      source: "notifications.ensurePermission",
    });
    permissionState = "denied";
    return false;
  }
}

/**
 * Sends a native OS notification. Silently no-ops when:
 *  - the notification plugin isn't available (e.g. running in pure web)
 *  - the user denied permission
 *  - `skipIfFocused` is true and the launcher window is currently focused
 *    (which it usually is — we only want OS notifs when minimized / hidden).
 *
 * Always logs the attempt as an `info` so the admin panel can correlate
 * "user got pinged at HH:MM" with subsequent actions.
 */
export async function notify(opts: {
  title: string;
  body: string;
  /** When true, suppress the notification if the document is currently
   *  visible. Defaults to true since OS notifs are most useful when the
   *  launcher is minimized / hidden / on another desktop. */
  skipIfFocused?: boolean;
  /** A bag of metadata logged alongside the notification — module ID,
   *  conversation ID, etc. */
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const skipIfFocused = opts.skipIfFocused !== false;
  if (skipIfFocused && typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) {
    return;
  }
  try {
    const granted = await ensurePermission();
    if (!granted) return;
    await sendNative({ title: opts.title, body: opts.body });
    logger.info(`Notif Windows envoyée : ${opts.title}`, {
      source: "notifications.notify",
      metadata: { body: opts.body, ...opts.metadata },
    });
  } catch (err) {
    // Plugin not available or platform doesn't support it — silent no-op.
    logger.warn(`Native notification failed: ${err instanceof Error ? err.message : String(err)}`, {
      source: "notifications.notify",
    });
  }
}
