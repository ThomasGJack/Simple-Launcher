import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Frontend wrappers for the native vanilla Minecraft installer.
 * Handles version manifest fetch, full install (client + libraries +
 * assets), and progress event subscription. Used by the Minecraft
 * module install button once the user picks a target version.
 */

export type ManifestVersion = {
  id: string;
  /** "release" | "snapshot" | "old_alpha" | "old_beta" */
  kind: string;
  url: string;
  sha1: string;
  releaseTime: string;
};

export type LatestVersions = {
  release: string;
  snapshot: string;
};

export type VersionManifest = {
  latest: LatestVersions;
  versions: ManifestVersion[];
};

export type InstallProgress = {
  mcVersion: string;
  /** "version-json" | "client" | "libraries" | "asset-index" | "assets" | "done" */
  phase: string;
  current: number;
  total: number;
  message: string;
};

/** Fetches Mojang's master version manifest. Cached for 24 h on the
 *  Rust side so this is cheap to call repeatedly. */
export async function mcVanillaListVersions(): Promise<VersionManifest> {
  return invoke<VersionManifest>("mc_vanilla_list_versions");
}

/** Has the user already installed the given vanilla MC version? Cheap
 *  filesystem check, returns instantly. */
export async function mcVanillaIsInstalled(mcVersion: string): Promise<boolean> {
  return invoke<boolean>("mc_vanilla_is_installed", { mcVersion });
}

/** Wipes the per-instance directory (`.minecraft/`, natives, logs) for
 *  a given instance id. Used when an admin deletes a Minecraft module
 *  to keep the disk clean. Idempotent: returns OK if the dir doesn't
 *  exist. Doesn't touch the shared versions/libraries/assets cache so
 *  other instances keep working. */
export async function mcNativeUninstallInstance(instanceId: string): Promise<void> {
  await invoke<void>("mc_native_uninstall_instance", { instanceId });
}

/** Opens the instance's `.minecraft/` directory in the OS file
 *  explorer. Lets users drag-and-drop resourcepacks, shaderpacks,
 *  configs, or anything else without diving into APPDATA manually. The
 *  directory is created on the fly if it doesn't exist yet. Returns
 *  the absolute path that was opened (useful for showing a tooltip). */
export async function mcNativeOpenInstanceDir(instanceId: string): Promise<string> {
  return invoke<string>("mc_native_open_instance_dir", { instanceId });
}

/** Runs the full install pipeline (client jar + libraries + asset index
 *  + asset objects) for the given MC version, extracting native libs
 *  into the per-instance natives dir. Idempotent — re-runs verify
 *  hashes and only re-DL missing/corrupted files. Subscribe to the
 *  progress event with `onMcVanillaProgress` first to drive a UI bar. */
export async function mcVanillaInstall(
  mcVersion: string,
  instanceId: string,
): Promise<void> {
  await invoke<void>("mc_vanilla_install", { mcVersion, instanceId });
}

/**
 * Subscribes to install-progress events. Returns an unlisten function
 * the caller should call on unmount. Events fire ~once per phase plus
 * every 25 assets during the asset-DL step (which is the long pole).
 */
export function onMcVanillaProgress(
  cb: (p: InstallProgress) => void,
): Promise<UnlistenFn> {
  return listen<InstallProgress>("mc-vanilla-progress", (event) => cb(event.payload));
}
