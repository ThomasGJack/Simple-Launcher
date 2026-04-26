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
import type { LauncherModule } from "@/types/module";

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
