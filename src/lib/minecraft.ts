import { invoke } from "@tauri-apps/api/core";
import type { MinecraftModule } from "@/types/module";

export type MinecraftStateLocal = {
  instanceName: string;
  fileId: number;
  importedAt: number;
};

const CURSEFORGE_API_KEY = (import.meta.env.VITE_CURSEFORGE_API_KEY as string | undefined) ?? "";

export async function findPrism(): Promise<string | null> {
  return invoke<string | null>("mc_find_prism");
}

export async function getMinecraftState(moduleId: string): Promise<MinecraftStateLocal | null> {
  return invoke<MinecraftStateLocal | null>("mc_get_state", { moduleId });
}

export async function installModpack(module: MinecraftModule): Promise<MinecraftStateLocal> {
  if (!CURSEFORGE_API_KEY) {
    throw new Error(
      "Clé API CurseForge manquante. Inscris-toi gratuitement sur https://console.curseforge.com puis ajoute VITE_CURSEFORGE_API_KEY dans .env.local.",
    );
  }
  return invoke<MinecraftStateLocal>("mc_install_modpack", {
    moduleId: module.id,
    projectId: module.curseforgeProjectId,
    fileId: module.curseforgeFileId,
    apiKey: CURSEFORGE_API_KEY,
  });
}

export async function launchMinecraft(module: MinecraftModule, instanceName: string): Promise<void> {
  return invoke<void>("mc_launch", {
    moduleId: module.id,
    moduleName: module.name,
    instanceName,
    serverAddress: module.server?.type === "minecraft" ? module.server.address : null,
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
  if (!CURSEFORGE_API_KEY) {
    return { kind: "no-api-key" };
  }
  const local = await getMinecraftState(module.id);
  if (!local) {
    const prism = await findPrism();
    return { kind: "not-installed", prismDetected: !!prism };
  }
  if (local.fileId !== module.curseforgeFileId) {
    return {
      kind: "update-available",
      localFileId: local.fileId,
      remoteFileId: module.curseforgeFileId,
      instanceName: local.instanceName,
    };
  }
  return { kind: "ready", instanceName: local.instanceName };
}
