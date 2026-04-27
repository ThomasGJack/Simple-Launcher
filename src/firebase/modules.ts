import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
  updateDoc,
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

/**
 * Persisted version record for a hosted module — one per upload via
 * `uploadHostedModule`, used by the admin rollback UI.
 */
export type ModuleVersionRecord = {
  version: string;
  releasedAt: number | null;
  sha256: string;
  size: number;
  downloadUrl: string;
};

/**
 * Subscribes to all the historical versions of a hosted module, sorted by
 * `releasedAt` descending. Used by the admin "Versions publiées" panel +
 * the rollback flow.
 */
export function watchModuleVersions(
  moduleId: string,
  callback: (versions: ModuleVersionRecord[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "modules", moduleId, "versions"),
    orderBy("releasedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ModuleVersionRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          version: typeof data.version === "string" ? data.version : d.id,
          releasedAt:
            data.releasedAt instanceof Timestamp ? data.releasedAt.toMillis() : null,
          sha256: typeof data.sha256 === "string" ? data.sha256 : "",
          size: typeof data.size === "number" ? data.size : 0,
          downloadUrl: typeof data.downloadUrl === "string" ? data.downloadUrl : "",
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[modules] watchModuleVersions failed:", err);
      callback([]);
    },
  );
}

/**
 * Atomically swap a hosted module's "current" pointer (its `version` /
 * `downloadUrl` / `sha256` / `size` fields on the parent doc) back to a
 * past version. Doesn't touch the binary in Storage — just re-points the
 * module to the existing version blob, which is still there.
 *
 * After this lands, all clients see the older version as "current" and
 * their `derivedStatus` flips to "update available" (current local !=
 * remote). They click Update → re-download the older binary. So a "rollback"
 * is really "advance everyone forward to the older artifact".
 */
export async function rollbackModuleToVersion(
  moduleId: string,
  targetVersion: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const versionRef = doc(fb.db, "modules", moduleId, "versions", targetVersion);
  const snap = await getDoc(versionRef);
  if (!snap.exists()) {
    throw new Error(`Version ${targetVersion} introuvable pour le module ${moduleId}.`);
  }
  const data = snap.data() as ModuleVersionRecord;
  await setDoc(
    doc(fb.db, "modules", moduleId),
    {
      version: data.version,
      downloadUrl: data.downloadUrl,
      sha256: data.sha256,
      size: data.size,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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

/**
 * Upload a modpack .zip (CurseForge export format: manifest.json + overrides/
 * at the root) to Firebase Storage. Returns a public download URL that can be
 * stored as `customZipUrl` on a MinecraftModule.
 *
 * Storage path: `modules/{moduleId}/modpack.zip` — same convention as the
 * other admin-uploaded assets.
 */
export async function uploadModpackZip(
  moduleId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<{ url: string; size: number }> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const path = `modules/${moduleId}/modpack.zip`;
  const storageRef = ref(fb.storage, path);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: "application/zip",
    customMetadata: { moduleId, kind: "modpack" },
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (!onProgress) return;
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
  const url = await getDownloadURL(storageRef);
  return { url, size: file.size };
}

export async function uploadModuleAsset(
  moduleId: string,
  kind: string,
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

export async function updateModulePage(
  moduleId: string,
  page: import("../types/module").ModulePageV2,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const docRef = doc(fb.db, "modules", moduleId);
  await updateDoc(docRef, { page: stripUndefined(page) as Record<string, unknown> });
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
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

