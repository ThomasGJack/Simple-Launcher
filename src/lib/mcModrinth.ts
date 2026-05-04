import { invoke } from "@tauri-apps/api/core";
import { achievementFlags } from "@/lib/achievementFlags";

/**
 * Frontend wrappers for the Modrinth modpack pipeline. Search lets the
 * UI surface a list of modpacks, version listing fetches the available
 * pack versions, and install runs the full DL chain (.mrpack → vanilla
 * + loader + mods + overrides) in one shot.
 *
 * Progress events flow through the same `mc-vanilla-progress` channel
 * used by the rest of the chain. Phases for Modrinth installs:
 *   - `modrinth-dl`        — downloading the .mrpack file
 *   - `modrinth-deps`      — installing vanilla + loader from manifest
 *   - `modrinth-mods`      — downloading mods from CDN
 *   - `modrinth-overrides` — extracting config / resourcepack overrides
 *   - `done`               — instance ready
 */

export type ModrinthProject = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  gameVersions: string[];
  loaders: string[];
};

export type ModrinthVersion = {
  id: string;
  projectId: string;
  versionNumber: string;
  name: string;
  /** "release" | "beta" | "alpha" */
  versionType: string;
  gameVersions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
};

export type ModrinthVersionFile = {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  hashes: { sha1: string; sha512?: string };
};

/** Searches Modrinth for modpacks matching the query (max 30 results). */
export async function mcModrinthSearch(query: string): Promise<ModrinthProject[]> {
  return invoke<ModrinthProject[]>("mc_modrinth_search", { query });
}

/** Lists all versions of a Modrinth project (newest first). */
export async function mcModrinthListVersions(projectId: string): Promise<ModrinthVersion[]> {
  return invoke<ModrinthVersion[]>("mc_modrinth_list_versions", { projectId });
}

/**
 * Installs a Modrinth modpack. `mrpackUrl` should be the URL of the
 * version's primary `.mrpack` file (typically
 * `version.files.find(f => f.primary).url`). On completion the instance
 * has vanilla + loader + every required mod + the override files in
 * place — the frontend just needs to flip its "ready" state.
 */
export async function mcModrinthInstall(
  mrpackUrl: string,
  instanceId: string,
): Promise<void> {
  await invoke<void>("mc_modrinth_install", { mrpackUrl, instanceId });
  // Modpack pipeline succeeded → unlock achievement #28.
  achievementFlags.markModpackInstalled();
}

/** Convenience: pick the file in a Modrinth version that's the primary
 *  `.mrpack`. Most versions have a single file flagged as primary; the
 *  occasional outlier ships separate client/server jars too. */
export function pickPrimaryMrpack(version: ModrinthVersion): ModrinthVersionFile | null {
  return (
    version.files.find((f) => f.primary && f.filename.endsWith(".mrpack")) ??
    version.files.find((f) => f.filename.endsWith(".mrpack")) ??
    null
  );
}
