// Thin TS wrapper around the Rust-side Velopack Tauri commands.
// The frontend doesn't need to know about velopack internals — it
// just calls these helpers which mirror the previous tauri-plugin-
// updater API surface (check / download / apply) so the UI code
// barely changed.
//
// Progress events arrive on "velo:progress" (number 0-100). The
// caller is expected to subscribe via tauri::listen and unsubscribe
// when the download is over (we emit "velo:download-finished" /
// "velo:download-error" as terminal markers).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Mirror of the Rust VeloUpdateSummary struct (see velo_updater.rs). */
export type VeloUpdateSummary = {
  version: string;
  size: number;
  notes: string;
  isDelta: boolean;
};

/**
 * Check the remote feed for an available update. Returns null if up
 * to date or running outside a Velopack-installed context (e.g. dev
 * mode). The Rust side stashes the full UpdateInfo so a subsequent
 * `download()` doesn't need to refetch.
 */
export async function veloCheck(): Promise<VeloUpdateSummary | null> {
  return invoke<VeloUpdateSummary | null>("velo_check");
}

/**
 * Download the previously-checked update. Resolves when the .nupkg
 * has been downloaded + extracted into the staging area (next call
 * is `apply()`).
 *
 * Pass an `onProgress` callback to receive 0-100 percent updates as
 * the download progresses. The callback unsubscribes from the
 * underlying Tauri events automatically when the promise settles.
 */
export async function veloDownload(
  onProgress?: (pct: number) => void,
): Promise<void> {
  let unlistens: UnlistenFn[] = [];
  if (onProgress) {
    unlistens = await Promise.all([
      listen<number>("velo:progress", (e) => onProgress(e.payload)),
    ]);
  }
  try {
    await invoke<void>("velo_download");
  } finally {
    for (const u of unlistens) u();
  }
}

/**
 * Apply the previously-downloaded update and restart the launcher.
 * This call does NOT return on success — the OS process exits and
 * is replaced by the updated binary.
 */
export async function veloApply(): Promise<void> {
  return invoke<void>("velo_apply");
}

/** Returns the currently-running launcher version. Falls back to
 *  Cargo's CARGO_PKG_VERSION when running outside an install. */
export async function veloCurrentVersion(): Promise<string> {
  return invoke<string>("velo_current_version");
}

/** True when the launcher is running from a real Velopack install,
 *  false in dev / portable runs. UI uses this to skip the periodic
 *  update poll when there's no point. */
export async function veloIsInstalled(): Promise<boolean> {
  return invoke<boolean>("velo_is_installed");
}
