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

export async function installModpack(
  module: MinecraftModule,
  prismPath: string,
): Promise<MinecraftStateLocal> {
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
    prismPath,
  });
}

export async function launchMinecraft(
  module: MinecraftModule,
  prismPath: string,
  instanceName: string,
): Promise<void> {
  return invoke<void>("mc_launch", {
    moduleId: module.id,
    moduleName: module.name,
    prismPath,
    instanceName,
    serverAddress: module.server?.type === "minecraft" ? module.server.address : null,
  });
}

export async function uninstallModpack(moduleId: string): Promise<void> {
  return invoke<void>("mc_uninstall", { moduleId });
}

export type MinecraftStatus =
  | { kind: "no-api-key" }
  | { kind: "no-prism"; downloadUrl: string }
  | { kind: "not-installed"; prismPath: string }
  | { kind: "update-available"; prismPath: string; localFileId: number; remoteFileId: number; instanceName: string }
  | { kind: "ready"; prismPath: string; instanceName: string };

export async function deriveMinecraftStatus(module: MinecraftModule): Promise<MinecraftStatus> {
  if (!CURSEFORGE_API_KEY) {
    return { kind: "no-api-key" };
  }
  const prism = await findPrism();
  if (!prism) {
    return { kind: "no-prism", downloadUrl: "https://prismlauncher.org/download/" };
  }
  const local = await getMinecraftState(module.id);
  if (!local) {
    return { kind: "not-installed", prismPath: prism };
  }
  if (local.fileId !== module.curseforgeFileId) {
    return {
      kind: "update-available",
      prismPath: prism,
      localFileId: local.fileId,
      remoteFileId: module.curseforgeFileId,
      instanceName: local.instanceName,
    };
  }
  return { kind: "ready", prismPath: prism, instanceName: local.instanceName };
}
