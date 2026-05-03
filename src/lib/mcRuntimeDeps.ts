import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Windows runtime dependency detector + installer.
 *
 * Why this exists: LWJGL 3.x and various MC mod natives (Distant
 * Horizons, Sodium SIMD libs, etc.) are compiled against multiple
 * generations of the Microsoft Visual C++ runtime. Fresh Windows
 * installs often miss the older 2012/2013 redists which Windows
 * Update doesn't ship, leading to garbage 3D rendering (visible
 * symptom: world looks like random colored noise while HUD remains
 * intact, since HUD doesn't go through the broken native pipeline).
 *
 * Flow:
 *   1. Frontend calls `checkRuntimeDeps()` before the first MC launch.
 *   2. If any are missing, surface a modal explaining the situation
 *      and offer to install them.
 *   3. On accept, frontend calls `installRuntimeDeps()` which
 *      downloads each missing redist from Microsoft and spawns it
 *      with `/quiet /norestart`. UAC prompts once per redist
 *      (Windows requires admin to write `System32`), then the
 *      installer runs silently.
 *   4. Progress events stream over `vcredist-progress`.
 */

export type RuntimeDep = {
  /** Stable id used for keying / progress correlation. */
  id: string;
  /** Friendly display name shown in the modal. */
  displayName: string;
  /** Sentinel DLL probed in `C:\Windows\System32` to detect presence. */
  dll: string;
  /** Official Microsoft download URL (used as a fallback link in the
   *  UI when the auto-install fails — user clicks → opens browser). */
  url: string;
};

export type RuntimeDepInstallProgress = {
  /** Stable id of the redist currently being processed (empty on `done`). */
  currentId: string;
  /** Friendly label shown in the progress modal. */
  currentLabel: string;
  /** "downloading" | "installing" | "done" */
  phase: string;
  /** 1-based index in the install queue. */
  currentIndex: number;
  /** Total number of redists in this run. */
  total: number;
  /** Bytes downloaded — only meaningful in `downloading` phase, 0 otherwise. */
  bytesDownloaded: number;
  /** Bytes expected from Content-Length, 0 if the server didn't send it. */
  bytesTotal: number;
};

/** Returns the list of redistributables that are missing on this
 *  machine. Empty array = nothing to install. */
export async function checkRuntimeDeps(): Promise<RuntimeDep[]> {
  return invoke<RuntimeDep[]>("mc_runtime_deps_check");
}

/** Downloads + installs every missing redistributable. Returns the
 *  list of redist ids that were successfully installed. UAC will
 *  prompt once per redist. */
export async function installRuntimeDeps(): Promise<string[]> {
  return invoke<string[]>("mc_runtime_deps_install");
}

/** Subscribes to install-progress events. Returns an unlisten function
 *  the caller should call on unmount. */
export function onRuntimeDepsProgress(
  cb: (p: RuntimeDepInstallProgress) => void,
): Promise<UnlistenFn> {
  return listen<RuntimeDepInstallProgress>("vcredist-progress", (event) =>
    cb(event.payload),
  );
}
