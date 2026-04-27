import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { invoke } from "@tauri-apps/api/core";
import { getFirebase } from "./config";

/**
 * One Minecraft backup record stored in Firestore at
 * `/users/{uid}/minecraftBackups/{backupId}`. The actual zip lives in
 * Firebase Storage at the path indicated by `storagePath`. Backups are
 * private to each user — only their own UID can read them (per rules).
 */
export type MinecraftBackup = {
  id: string;
  moduleId: string;
  url: string;
  storagePath: string;
  size: number;
  ts: number;
  /** Optional human label set when creating the backup ("avant raid",
   *  "après dragon"). Defaults to a timestamp string. */
  label: string;
};

/**
 * Backup the current saves of a Minecraft module instance, upload to
 * Firebase Storage, and record metadata in Firestore. Composed entirely
 * client-side (the Rust side does the zip + REST upload, this layer does
 * the Firestore write so the UI can list/restore).
 */
export async function createBackup(opts: {
  moduleId: string;
  instanceName: string;
  label?: string;
}): Promise<MinecraftBackup> {
  const fb = getFirebase();
  if (!fb || !fb.auth.currentUser) throw new Error("Connecte-toi pour sauvegarder");
  const user = fb.auth.currentUser;

  // Storage bucket name comes from the Firebase config.
  const bucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? "";
  if (!bucket) throw new Error("Bucket Storage non configuré");

  // The REST upload from Rust needs an ID token to authenticate. JS-side
  // tokens auto-rotate every hour; we fetch a fresh one for the upload.
  const idToken = await user.getIdToken();

  // Rust does the zip + upload to Firebase Storage REST API
  const meta = await invoke<{
    url: string;
    size: number;
    ts: number;
    moduleId: string;
    storagePath: string;
    downloadToken?: string;
  }>("mc_backup_save", {
    moduleId: opts.moduleId,
    instanceName: opts.instanceName,
    bucket,
    idToken,
    uid: user.uid,
  });

  // Persist metadata in Firestore so the UI can list backups without
  // listing Storage (which the JS SDK doesn't support cleanly).
  const ref = await addDoc(collection(fb.db, "users", user.uid, "minecraftBackups"), {
    moduleId: meta.moduleId,
    url: meta.url,
    storagePath: meta.storagePath,
    size: meta.size,
    ts: meta.ts,
    label: opts.label?.trim() || new Date(meta.ts).toLocaleString("fr-FR"),
    createdAt: serverTimestamp(),
  });

  return {
    id: ref.id,
    moduleId: meta.moduleId,
    url: meta.url,
    storagePath: meta.storagePath,
    size: meta.size,
    ts: meta.ts,
    label: opts.label?.trim() || new Date(meta.ts).toLocaleString("fr-FR"),
  };
}

export async function restoreBackup(opts: {
  instanceName: string;
  backup: MinecraftBackup;
}): Promise<void> {
  await invoke<void>("mc_restore_backup", {
    instanceName: opts.instanceName,
    downloadUrl: opts.backup.url,
  });
}

export async function deleteBackup(backup: MinecraftBackup): Promise<void> {
  const fb = getFirebase();
  if (!fb || !fb.auth.currentUser) return;
  const uid = fb.auth.currentUser.uid;
  // Wipe the Storage object first; if that fails (e.g. already deleted),
  // we still drop the Firestore record so the UI doesn't show a ghost.
  try {
    await deleteObject(storageRef(fb.storage, backup.storagePath));
  } catch (err) {
    console.warn("[backups] storage delete failed:", err);
  }
  await deleteDoc(doc(fb.db, "users", uid, "minecraftBackups", backup.id));
}

/**
 * Subscribes to all backups owned by `uid` for a given moduleId. Sorted
 * newest-first.
 */
export function watchBackups(
  uid: string,
  moduleId: string,
  callback: (backups: MinecraftBackup[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "users", uid, "minecraftBackups"),
    orderBy("ts", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const out: MinecraftBackup[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.moduleId !== moduleId) continue; // client-side filter
        out.push({
          id: d.id,
          moduleId: data.moduleId ?? "",
          url: data.url ?? "",
          storagePath: data.storagePath ?? "",
          size: typeof data.size === "number" ? data.size : 0,
          ts: typeof data.ts === "number"
            ? data.ts
            : data.ts instanceof Timestamp
              ? data.ts.toMillis()
              : 0,
          label: typeof data.label === "string" ? data.label : "Backup",
        });
      }
      callback(out);
    },
    (err) => {
      console.warn("[backups] watch failed:", err);
      callback([]);
    },
  );
}
