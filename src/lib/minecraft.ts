import { invoke } from "@tauri-apps/api/core";
import { logger } from "@/lib/logger";
import type { MinecraftModule } from "@/types/module";

export type MinecraftStateLocal = {
  instanceName: string;
  fileId: number;
  importedAt: number;
  /** Major Java version (8 / 17 / 21) inferred from the modpack's MC
   *  version at install time. `undefined` for older entries that didn't
   *  capture this info — UI should show "Java auto" then. */
  javaVersion?: number;
};

const CURSEFORGE_API_KEY = (import.meta.env.VITE_CURSEFORGE_API_KEY as string | undefined) ?? "";

export async function findPrism(): Promise<string | null> {
  return invoke<string | null>("mc_find_prism");
}

export async function getMinecraftState(moduleId: string): Promise<MinecraftStateLocal | null> {
  return invoke<MinecraftStateLocal | null>("mc_get_state", { moduleId });
}

/**
 * Per-machine RAM override stored in localStorage. Each user can pick a heap
 * size that fits their hardware regardless of what the admin set as the
 * module-wide default. `null` means "use whatever the admin configured".
 *
 * Stored as plain milligbytes (MiB) so the value reads `8192` for 8 GB. We
 * keep one entry per moduleId so different modpacks can have different RAM.
 */
const USER_RAM_KEY_PREFIX = "mc-user-ram:";

export function getUserRamOverride(moduleId: string): number | null {
  try {
    const raw = localStorage.getItem(USER_RAM_KEY_PREFIX + moduleId);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 512 ? parsed : null;
  } catch {
    return null;
  }
}

export function setUserRamOverride(moduleId: string, ramMb: number | null): void {
  try {
    if (ramMb === null || ramMb < 512) {
      localStorage.removeItem(USER_RAM_KEY_PREFIX + moduleId);
    } else {
      localStorage.setItem(USER_RAM_KEY_PREFIX + moduleId, String(ramMb));
    }
  } catch {
    /* localStorage might be disabled — fail silently */
  }
}

/** Returns the RAM (MiB) that should actually be applied at install/launch
 *  time: the user's per-machine override if any, otherwise the admin's
 *  module-wide default, otherwise `null` (= let Prism use its own default). */
export function getEffectiveRam(module: MinecraftModule): number | null {
  const user = getUserRamOverride(module.id);
  if (user !== null) return user;
  return module.maxRamMb && module.maxRamMb >= 512 ? module.maxRamMb : null;
}

export async function installModpack(module: MinecraftModule): Promise<MinecraftStateLocal> {
  // Two source modes:
  // - "manual" : module.customZipUrl provided → download directly, skip CF API.
  // - "curseforge" : use the CF API with the user's key.
  const useManual = !!module.customZipUrl;
  if (!useManual && !CURSEFORGE_API_KEY) {
    throw new Error(
      "Clé API CurseForge manquante. Inscris-toi gratuitement sur https://console.curseforge.com puis ajoute VITE_CURSEFORGE_API_KEY dans .env.local — OU upload directement le .zip du modpack via l'option « Upload manuel » dans le panel admin.",
    );
  }
  // In manual mode, use a hash of the URL as a synthetic "file id" so we can
  // detect updates when the admin uploads a new zip (different URL).
  const versionKey = useManual
    ? hashStringFnv32(module.customZipUrl ?? "")
    : module.curseforgeFileId ?? 0;
  const ram = getEffectiveRam(module);
  logger.action("Modpack install started", {
    source: "minecraft.installModpack",
    metadata: { moduleId: module.id, mode: useManual ? "manual" : "curseforge", maxRamMb: ram },
  });
  try {
    const state = await invoke<MinecraftStateLocal>("mc_install_modpack", {
      moduleId: module.id,
      projectId: module.curseforgeProjectId ?? null,
      fileId: versionKey,
      apiKey: useManual ? "" : CURSEFORGE_API_KEY,
      customZipUrl: module.customZipUrl ?? null,
      // Use the effective RAM (user override > admin default) at install
      // time so the freshly created instance.cfg already has the right heap
      // size and the user doesn't have to relaunch once for it to apply.
      maxRamMb: ram,
    });
    logger.action("Modpack install succeeded", {
      source: "minecraft.installModpack",
      metadata: { moduleId: module.id, instanceName: state.instanceName },
    });
    return state;
  } catch (err) {
    logger.error(`Modpack install failed: ${err instanceof Error ? err.message : String(err)}`, {
      source: "minecraft.installModpack",
      metadata: { moduleId: module.id, mode: useManual ? "manual" : "curseforge" },
    });
    throw err;
  }
}

export async function launchMinecraft(module: MinecraftModule, instanceName: string): Promise<void> {
  return invoke<void>("mc_launch", {
    moduleId: module.id,
    moduleName: module.name,
    instanceName,
    serverAddress: module.server?.type === "minecraft" ? module.server.address : null,
    // Effective RAM is recomputed each launch — picks up both:
    // - admin bumping the module-wide default after install
    // - user changing their personal override via the module detail page
    // The Rust side patches `instance.cfg` in place so no reinstall needed.
    maxRamMb: getEffectiveRam(module),
  });
}

export async function uninstallModpack(moduleId: string): Promise<void> {
  return invoke<void>("mc_uninstall", { moduleId });
}

export type MinecraftStatus =
  | { kind: "no-api-key" }
  | { kind: "not-installed"; prismDetected: boolean }
  | { kind: "update-available"; localFileId: number; remoteFileId: number; instanceName: string }
  | { kind: "ready"; instanceName: string };

export async function deriveMinecraftStatus(module: MinecraftModule): Promise<MinecraftStatus> {
  const useManual = !!module.customZipUrl;
  // Custom (manual) source doesn't need the CurseForge API key.
  if (!useManual && !CURSEFORGE_API_KEY) {
    return { kind: "no-api-key" };
  }
  const local = await getMinecraftState(module.id);
  if (!local) {
    const prism = await findPrism();
    return { kind: "not-installed", prismDetected: !!prism };
  }
  // For "update available" detection:
  //  - CurseForge mode: compare local.fileId against module.curseforgeFileId.
  //  - Manual mode: use the customZipUrl as the version key (any URL change = new
  //    upload = an update is available).
  const remoteKey = useManual
    ? hashStringFnv32(module.customZipUrl ?? "")
    : module.curseforgeFileId ?? 0;
  if (local.fileId !== remoteKey) {
    return {
      kind: "update-available",
      localFileId: local.fileId,
      remoteFileId: remoteKey,
      instanceName: local.instanceName,
    };
  }
  return { kind: "ready", instanceName: local.instanceName };
}

/**
 * Maps a Minecraft version string ("1.21.1", "1.18.2", …) to the major
 * Java version Mojang requires to run it. Mirror of the Rust function in
 * `minecraft.rs` — kept in sync on both sides because the UI computes it
 * from the admin-configured `module.minecraftVersion` while the Rust side
 * computes it from the manifest at install time. Returns `null` for
 * unparseable versions (snapshot, future format, etc.).
 *
 * Mapping:
 *   - 1.20.5+ / 1.21+   → Java 21
 *   - 1.17 → 1.20.4     → Java 17
 *   - 1.16 and older    → Java 8
 */
export function requiredJavaVersion(mcVersion: string | undefined): number | null {
  if (!mcVersion) return null;
  const parts = mcVersion.split(".");
  if (parts.length < 2) return null;
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parts.length >= 3 ? parseInt(parts[2].split("-")[0], 10) || 0 : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  if (major !== 1) return null;
  if (minor >= 21) return 21;
  if (minor === 20 && patch >= 5) return 21;
  if (minor >= 17) return 17;
  return 8;
}

// Tiny non-cryptographic hash so that customZipUrl changes are detected as
// updates, without storing the URL in the local state file.
function hashStringFnv32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
