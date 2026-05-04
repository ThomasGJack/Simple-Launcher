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

export const DEFAULT_OVERLAY_HOTKEY = "Ctrl+Shift+O";
const STORAGE_KEY = "overlay-hotkey";

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
 * the new one.
 */
export async function bootOverlayHotkey(): Promise<void> {
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
