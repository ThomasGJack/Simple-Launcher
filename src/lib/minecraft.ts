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
  return invoke<MinecraftStateLocal>("mc_install_modpack", {
    moduleId: module.id,
    projectId: module.curseforgeProjectId ?? null,
    fileId: versionKey,
    apiKey: useManual ? "" : CURSEFORGE_API_KEY,
    customZipUrl: module.customZipUrl ?? null,
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
