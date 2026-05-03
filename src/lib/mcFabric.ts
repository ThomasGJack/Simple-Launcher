import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrappers for the Fabric loader installer. Fabric reuses the
 * vanilla client.jar + asset index, so its install path here only adds:
 *   - the Fabric profile JSON (saved to versions/{composite_id}.json)
 *   - the additional libraries Fabric needs (loader, intermediary, ASM…)
 *
 * Progress events flow through the same `mc-vanilla-progress` channel
 * as the vanilla installer (subscribe via `onMcVanillaProgress`); the
 * `phase` field tells you whether you're in the vanilla half or the
 * Fabric half (`fabric-profile`, `fabric-libraries`).
 */

export type FabricGameVersion = {
  version: string;
  /** Whether this is a stable release (`true`) or a snapshot (`false`). */
  stable: boolean;
};

export type FabricLoaderVersion = {
  separator: string;
  build: number;
  /** Maven coordinates, e.g. `net.fabricmc:fabric-loader:0.16.0`. */
  maven: string;
  /** Just the version number, e.g. `0.16.0`. */
  version: string;
  stable: boolean;
};

/** Lists every MC version that has at least one Fabric loader available. */
export async function mcFabricListGameVersions(): Promise<FabricGameVersion[]> {
  return invoke<FabricGameVersion[]>("mc_fabric_list_game_versions");
}

/** Lists every Fabric loader version compatible with `mcVersion`. */
export async function mcFabricListLoaderVersions(
  mcVersion: string,
): Promise<FabricLoaderVersion[]> {
  return invoke<FabricLoaderVersion[]>("mc_fabric_list_loader_versions", { mcVersion });
}

/**
 * Installs Fabric on top of vanilla for the given (mc, loader) pair.
 * Vanilla install is run first as a prerequisite (idempotent — already
 * installed = no DL). Returns when all bits are on disk + verified.
 */
export async function mcFabricInstall(
  mcVersion: string,
  loaderVersion: string,
  instanceId: string,
): Promise<void> {
  await invoke<void>("mc_fabric_install", { mcVersion, loaderVersion, instanceId });
}
