import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "@/lib/logger";
import type { LauncherModule } from "@/types/module";

export type ModuleStateLocal = {
  version: string;
  installedAt: number;
};

export type ModuleProgress = {
  moduleId: string;
  phase: "downloading" | "extracting" | "ready";
  bytesDownloaded: number;
  bytesTotal: number;
};

export async function getModuleState(moduleId: string): Promise<ModuleStateLocal | null> {
  return invoke<ModuleStateLocal | null>("module_get_state", { moduleId });
}

export async function installOrUpdate(module: Extract<LauncherModule, { type: "hosted" }>): Promise<void> {
  logger.action("Module install/update started", {
    source: "modules.installOrUpdate",
    metadata: { moduleId: module.id, version: module.version, sizeMb: (module.size / 1_048_576).toFixed(1) },
  });
  try {
    await invoke<void>("module_install_or_update", {
      moduleId: module.id,
      version: module.version,
      downloadUrl: module.downloadUrl,
      sha256Expected: module.sha256,
    });
    logger.action("Module install/update succeeded", {
      source: "modules.installOrUpdate",
      metadata: { moduleId: module.id, version: module.version },
    });
  } catch (err) {
    logger.error(`Module install/update failed: ${err instanceof Error ? err.message : String(err)}`, {
      source: "modules.installOrUpdate",
      metadata: { moduleId: module.id, version: module.version },
    });
    throw err;
  }
}

export async function launchModule(module: LauncherModule): Promise<void> {
  if (module.type === "hosted") {
    return invoke<void>("module_launch_hosted", {
      moduleId: module.id,
      moduleName: module.name,
      executable: module.executable,
    });
  }
  if (module.type === "minecraft" || module.type === "custom-minecraft") {
    // Both flavours of Minecraft module go through the dedicated native
    // action panel in ModuleDetailPage (it calls `mc_native_launch`
    // directly). This top-level helper is only for non-MC entry points.
    throw new Error("Minecraft modules launch via the native action panel, not launchModule");
  }
  if (module.type === "fivem") {
    if (!module.executablePath) {
      // Should have been gated by the UI (handlePrimary opens the
      // install URL when executablePath is null). If we land here
      // anyway, surface a clear error instead of spawning nothing.
      throw new Error("FiveM n'est pas installé sur ce PC. Clique « Installer FiveM ».");
    }
    return invoke<void>("module_launch_shortcut", {
      moduleId: module.id,
      moduleName: module.name,
      executablePath: module.executablePath,
      args: null,
    });
  }
  return invoke<void>("module_launch_shortcut", {
    moduleId: module.id,
    moduleName: module.name,
    executablePath: module.executablePath,
    args: module.args ?? null,
  });
}

export type ModuleLaunchEvent = {
  moduleId: string;
  moduleName: string;
  startedAt: number;
};

export type ModuleExitEvent = {
  moduleId: string;
  moduleName: string;
  startedAt: number;
  exitedAt: number;
  durationMs: number;
};

export async function uninstallModule(moduleId: string): Promise<void> {
  logger.action("Module uninstall", { source: "modules.uninstallModule", metadata: { moduleId } });
  return invoke<void>("module_uninstall", { moduleId });
}

export function subscribeProgress(
  moduleId: string,
  onProgress: (p: ModuleProgress) => void,
): Promise<UnlistenFn> {
  return listen<ModuleProgress>("module-progress", (event) => {
    if (event.payload.moduleId === moduleId) onProgress(event.payload);
  });
}

export type DerivedStatus =
  | { kind: "shortcut" }
  | { kind: "minecraft" }
  | { kind: "not-installed" }
  | { kind: "installed"; localVersion: string }
  | { kind: "update-available"; localVersion: string; remoteVersion: string };

export function deriveStatus(module: LauncherModule, local: ModuleStateLocal | null): DerivedStatus {
  if (module.type === "shortcut") return { kind: "shortcut" };
  if (module.type === "minecraft" || module.type === "custom-minecraft") {
    return { kind: "minecraft" };
  }
  if (module.type === "fivem") {
    // Native FiveM module : `executablePath` est null tant que FiveM
    // n'a pas été détecté sur la machine. On réutilise "shortcut"
    // comme "prêt à lancer" (zéro install à faire côté Simple Launcher,
    // FiveM lui-même gère sa chaîne) et "not-installed" pour basculer
    // le bouton primaire en "Installer FiveM" (ouvre fivem.net).
    return module.executablePath ? { kind: "shortcut" } : { kind: "not-installed" };
  }
  if (!local) return { kind: "not-installed" };
  if (local.version !== module.version) {
    return { kind: "update-available", localVersion: local.version, remoteVersion: module.version };
  }
  return { kind: "installed", localVersion: local.version };
}
