import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { getFirebase } from "./config";
import type { CustomMinecraftModule } from "@/types/module";

/**
 * Per-user custom Minecraft instances. Stored privately under
 * `users/{uid}/customMinecraft/{id}`, owner-only read/write.
 *
 * The instance id is also used as the launch `instanceId` in the
 * native MC launch chain — that's what determines the on-disk
 * `.minecraft/` folder. We prefix it with `cmc-` so it can't collide
 * with hosted MC module ids (which use the Firestore module doc id).
 */

export function watchUserCustomMinecraft(
  uid: string,
  callback: (list: CustomMinecraftModule[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "users", uid, "customMinecraft"),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CustomMinecraftModule);
      callback(list);
    },
    (err) => {
      console.warn("[customMinecraft] watch failed:", err);
      callback([]);
    },
  );
}

export async function saveUserCustomMinecraft(
  uid: string,
  instance: CustomMinecraftModule,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "users", uid, "customMinecraft", instance.id),
    { ...instance, ownerUid: uid, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteUserCustomMinecraft(
  uid: string,
  instanceId: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "users", uid, "customMinecraft", instanceId));
  // Best-effort cleanup of icon/banner from Storage.
  for (const kind of ["icon", "banner"] as const) {
    for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif"]) {
      try {
        await deleteObject(
          ref(
            fb.storage,
            `users/${uid}/customMinecraft/${instanceId}/${kind}${ext}`,
          ),
        );
      } catch {
        /* ignore — file probably doesn't exist */
      }
    }
  }
}

export async function uploadCustomMinecraftAsset(
  uid: string,
  instanceId: string,
  kind: "icon" | "banner",
  file: File,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ext = inferExt(file);
  const path = `users/${uid}/customMinecraft/${instanceId}/${kind}${ext}`;
  const storageRef = ref(fb.storage, path);
  await uploadBytesResumable(storageRef, file, {
    contentType: file.type || "image/png",
    customMetadata: { uid, instanceId, kind },
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
