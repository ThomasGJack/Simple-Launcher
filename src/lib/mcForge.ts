import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrappers for the Forge + NeoForge loader installers. Both
 * share the same install pipeline under the hood (download installer
 * JAR → run with `--installClient` → fold output into shared layout),
 * just with different version listings and Maven repos.
 *
 * Progress events flow through the same `mc-vanilla-progress` channel
 * (subscribe via `onMcVanillaProgress`). Forge/NeoForge phases are
 * `forge-installer-dl` and `forge-installer-run`.
 */

export type ForgeVersionEntry = {
  /** Vanilla MC version this Forge build targets, e.g. "1.20.1". */
  mcVersion: string;
  /** Forge loader version, e.g. "47.4.0". */
  loaderVersion: string;
  /** "recommended" or "latest" — the channel Mojang/Forge calls it. */
  channel: string;
};

/** Lists every (mcVersion, forgeVersion) pair from Forge promotions. */
export async function mcForgeListVersions(): Promise<ForgeVersionEntry[]> {
  return invoke<ForgeVersionEntry[]>("mc_forge_list_versions");
}

/** Lists every NeoForge release from their Maven (newest first). */
export async function mcNeoforgeListVersions(): Promise<string[]> {
  return invoke<string[]>("mc_neoforge_list_versions");
}

/**
 * Installs Forge for the given (mcVersion, forgeVersion) pair.
 * Vanilla install runs first as a prerequisite. The Forge installer
 * JAR is downloaded + executed in headless `--installClient` mode;
 * up to 8 minutes (Forge does a lot of bytecode patching for 1.13+
 * versions).
 */
export async function mcForgeInstall(
  mcVersion: string,
  loaderVersion: string,
  instanceId: string,
): Promise<void> {
  await invoke<void>("mc_forge_install", { mcVersion, loaderVersion, instanceId });
}

/**
 * Installs NeoForge for the given loader version. NeoForge versions
 * encode their MC compat themselves (e.g. `21.5.34-beta` targets
 * Minecraft 1.21.5), but we still pass `mcVersion` so vanilla install
 * runs against the right version.
 */
export async function mcNeoforgeInstall(
  mcVersion: string,
  loaderVersion: string,
  instanceId: string,
): Promise<void> {
  await invoke<void>("mc_neoforge_install", { mcVersion, loaderVersion, instanceId });
}
