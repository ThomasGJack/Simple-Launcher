import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrappers for the overlay Tauri commands defined in
 * `src-tauri/src/overlay.rs`. The overlay window is a separate Tauri
 * webview ; from the main launcher window we drive it via these
 * helpers (toggle visibility, change the global hotkey, etc.).
 *
 * The overlay window itself (loaded by `overlay.html` →
 * `src/overlay.tsx` → `<OverlayApp>`) only ever calls
 * `overlay_hide` to dismiss itself.
 */

// Default hotkey changed from Ctrl+Shift+O (often grabbed by browsers /
// IDEs / Discord) to Shift+F9 — function keys are rarely bound by
// games or other apps and the Shift modifier prevents accidental
// triggers. The user can change it from Settings → Overlay.
export const DEFAULT_OVERLAY_HOTKEY = "Shift+F9";
const STORAGE_KEY = "overlay-hotkey";
const ENABLED_KEY = "overlay-enabled";

/** Whether the overlay feature itself is enabled (vs hotkey
 *  disabled). Default true so first-time users can discover the
 *  feature without flipping a switch. */
export function getOverlayEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setOverlayEnabled(value: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

/**
 * Read the user's saved overlay hotkey from localStorage. Falls back
 * to the default `Ctrl+Shift+O` when nothing is stored or the value
 * is empty.
 */
export function getSavedOverlayHotkey(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim().length > 0 ? v : DEFAULT_OVERLAY_HOTKEY;
  } catch {
    return DEFAULT_OVERLAY_HOTKEY;
  }
}

/**
 * Persist the user's overlay hotkey choice and re-register it with
 * the OS so the new combo takes effect immediately.
 */
export async function setOverlayHotkey(shortcut: string): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, shortcut);
  } catch {
    /* best effort */
  }
  await invoke("overlay_register_hotkey", { shortcut });
}

/**
 * Boot-time : register whatever shortcut the user previously saved
 * (or the default). Idempotent — calling twice is harmless because
 * the Rust side unregisters the previous binding before installing
 * the new one. Skips registration entirely when the user has
 * disabled the overlay feature in Settings.
 */
export async function bootOverlayHotkey(): Promise<void> {
  if (!getOverlayEnabled()) return;
  await invoke("overlay_register_hotkey", { shortcut: getSavedOverlayHotkey() });
}

/** Manually toggle visibility (e.g. from a sidebar or settings button). */
export async function toggleOverlay(): Promise<void> {
  await invoke("overlay_toggle");
}

/** Force-show the overlay (Settings → "Tester l'overlay" button). */
export async function showOverlay(): Promise<void> {
  await invoke("overlay_show");
}

/** Disable the global hotkey entirely (used when the user toggles off
 *  the overlay in Settings). */
export async function unregisterOverlayHotkey(): Promise<void> {
  await invoke("overlay_unregister_hotkey");
}

// ─── Borderless force (Option A) ────────────────────────────────────

const BORDERLESS_KEY = "overlay-auto-borderless";

/** Whether to auto-force borderless mode on every game launch
 *  (Option A from the perf plan). Default true — solves 95% of
 *  exclusive-fullscreen incompatibility cases without anti-cheat
 *  risk. Users with edge-case games can disable it. */
export function getAutoBorderless(): boolean {
  try {
    const v = localStorage.getItem(BORDERLESS_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setAutoBorderless(value: boolean): void {
  try {
    localStorage.setItem(BORDERLESS_KEY, value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

/**
 * Force the foreground window into borderless windowed mode. Strips
 * WS_POPUP / WS_CAPTION / WS_THICKFRAME via Win32 SetWindowLong and
 * resizes it to fill the work area. Works for the vast majority of
 * games (exception : DirectX 12 swap-chain-flip-discard fullscreen,
 * mostly Forza-tier titles).
 *
 * Used both manually (button on a module page) and automatically
 * after a launch when `getAutoBorderless()` is true.
 */
export async function forceBorderlessForeground(): Promise<void> {
  await invoke("overlay_force_borderless");
}

/**
 * Same as above but targets a specific PID instead of the current
 * foreground window. Used by the auto-launch handler that knows
 * which process it just spawned.
 */
export async function forceBorderlessByPid(pid: number): Promise<void> {
  await invoke("overlay_force_borderless_pid", { pid });
}
