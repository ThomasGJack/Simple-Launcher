import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
  return invoke<void>("module_install_or_update", {
    moduleId: module.id,
    version: module.version,
    downloadUrl: module.downloadUrl,
    sha256Expected: module.sha256,
  });
}

export async function launchModule(module: LauncherModule): Promise<void> {
  if (module.type === "hosted") {
    return invoke<void>("module_launch_hosted", {
      moduleId: module.id,
      moduleName: module.name,
      executable: module.executable,
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
  | { kind: "not-installed" }
  | { kind: "installed"; localVersion: string }
  | { kind: "update-available"; localVersion: string; remoteVersion: string };

export function deriveStatus(module: LauncherModule, local: ModuleStateLocal | null): DerivedStatus {
  if (module.type === "shortcut") return { kind: "shortcut" };
  if (!local) return { kind: "not-installed" };
  if (local.version !== module.version) {
    return { kind: "update-available", localVersion: local.version, remoteVersion: module.version };
  }
  return { kind: "installed", localVersion: local.version };
}
