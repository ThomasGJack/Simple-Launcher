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

export type ShortcutModule = Extract<LauncherModule, { type: "shortcut" }>;

export function watchUserShortcuts(uid: string, callback: (shortcuts: ShortcutModule[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(collection(fb.db, "users", uid, "shortcuts"), (snap) => {
    const list = snap.docs.map((d) => d.data() as ShortcutModule);
    callback(list);
  });
}

export async function saveUserShortcut(uid: string, shortcut: ShortcutModule): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "users", uid, "shortcuts", shortcut.id),
    { ...shortcut, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteUserShortcut(uid: string, shortcutId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "users", uid, "shortcuts", shortcutId));
  // Best-effort cleanup of icon/banner from Storage
  for (const kind of ["icon", "banner"] as const) {
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif"]) {
      try {
        await deleteObject(ref(fb.storage, `users/${uid}/shortcuts/${shortcutId}/${kind}${ext}`));
      } catch {
        /* ignore — file probably doesn't exist */
      }
    }
  }
}

export async function uploadShortcutAsset(
  uid: string,
  shortcutId: string,
  kind: "icon" | "banner",
  file: File,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ext = inferExt(file);
  const path = `users/${uid}/shortcuts/${shortcutId}/${kind}${ext}`;
  const storageRef = ref(fb.storage, path);
  await uploadBytesResumable(storageRef, file, {
    contentType: file.type || "image/png",
    customMetadata: { uid, shortcutId, kind },
  });
  return getDownloadURL(storageRef);
}

function inferExt(file: File): string {
  const name = file.name.toLowerCase();
  for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif"]) {
    if (name.endsWith(ext)) return ext;
  }
  if (file.type.includes("png")) return ".png";
  if (file.type.includes("webp")) return ".webp";
  if (file.type.includes("jpeg")) return ".jpg";
  return ".png";
}
