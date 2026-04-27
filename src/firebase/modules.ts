import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { getFirebase } from "./config";
import type { LauncherModule, ModulePage } from "@/types/module";

export type UploadProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
};

export function watchModules(callback: (modules: LauncherModule[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(collection(fb.db, "modules"), (snap) => {
    const modules = snap.docs.map((d) => d.data() as LauncherModule);
    callback(modules);
  });
}

export async function saveShortcutModule(module: Extract<LauncherModule, { type: "shortcut" }>) {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "modules", module.id),
    { ...module, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function saveMinecraftModule(module: Extract<LauncherModule, { type: "minecraft" }>) {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "modules", module.id),
    { ...module, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Update a hosted module's metadata without touching the binary fields
 * (downloadUrl / sha256 / size / version). Use this when the admin only edits
 * cosmetic fields (icon, banner, description, theme, etc.).
 */
export async function updateHostedModuleMetadata(
  moduleId: string,
  patch: Partial<Omit<Extract<LauncherModule, { type: "hosted" }>, "id" | "type" | "downloadUrl" | "sha256" | "size" | "version" | "executable">>,
) {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "modules", moduleId),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function uploadHostedModule(
  module: Omit<Extract<LauncherModule, { type: "hosted" }>, "downloadUrl" | "sha256" | "size">,
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<Extract<LauncherModule, { type: "hosted" }>> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");

  const buffer = await file.arrayBuffer();
  const sha256 = await computeSha256Hex(buffer);

  const storagePath = `modules/${module.id}/${module.version}.zip`;
  const storageRef = ref(fb.storage, storagePath);
  const task = uploadBytesResumable(storageRef, buffer, {
    contentType: "application/zip",
    customMetadata: { sha256, version: module.version, moduleId: module.id },
  });

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const percent = snap.totalBytes > 0 ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
        onProgress({
          bytesUploaded: snap.bytesTransferred,
          bytesTotal: snap.totalBytes,
          percent,
        });
      },
      reject,
      () => resolve(),
    );
  });

  const downloadUrl = await getDownloadURL(storageRef);
  const fullModule: Extract<LauncherModule, { type: "hosted" }> = {
    ...module,
    downloadUrl,
    size: file.size,
    sha256,
  };

  await setDoc(
    doc(fb.db, "modules", module.id),
    { ...fullModule, updatedAt: serverTimestamp() },
    { merge: true },
  );

  await setDoc(
    doc(fb.db, "modules", module.id, "versions", module.version),
    {
      version: module.version,
      releasedAt: serverTimestamp(),
      sha256,
      size: file.size,
      downloadUrl,
    },
  );

  return fullModule;
}

export async function deleteModule(moduleId: string) {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "modules", moduleId));
}

export async function deleteHostedZip(moduleId: string, version: string) {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  try {
    await deleteObject(ref(fb.storage, `modules/${moduleId}/${version}.zip`));
  } catch (err) {
    console.warn("[modules] delete zip failed:", err);
  }
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadModuleAsset(
  moduleId: string,
  kind: "icon" | "banner",
  file: File,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ext = inferExt(file);
  const path = `modules/${moduleId}/${kind}${ext}`;
  const storageRef = ref(fb.storage, path);
  await uploadBytesResumable(storageRef, file, {
    contentType: file.type || "image/png",
    customMetadata: { moduleId, kind },
  });
  return getDownloadURL(storageRef);
}

function inferExt(file: File): string {
  const name = file.name.toLowerCase();
  for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm"]) {
    if (name.endsWith(ext)) return ext;
  }
  if (file.type.includes("png")) return ".png";
  if (file.type.includes("webp")) return ".webp";
  if (file.type.includes("jpeg")) return ".jpg";
  if (file.type.includes("mp4")) return ".mp4";
  if (file.type.includes("webm")) return ".webm";
  return ".bin";
}

export type { ModulePage };

