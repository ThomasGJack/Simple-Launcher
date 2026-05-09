// Screenshots — gestion centralisée des captures d'écran. Stockage en
// Firebase Storage (PNG) + metadata sur Firestore (sub-coll
// `/users/{uid}/screenshots/{id}`).
//
// Schéma :
//   /users/{uid}/screenshots/{screenshotId}
//     imageUrl: string         — URL public du PNG
//     storagePath: string      — chemin Storage (pour suppression)
//     moduleId: string | null  — module joué au moment du capture
//     moduleName: string | null
//     width: number
//     height: number
//     createdAt: ms (server)
//     caption: string | null   — éditable par l'user
//
// Storage path : `users/{uid}/screenshots/{ts}.png`

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getFirebase } from "./config";

export type Screenshot = {
  id: string;
  imageUrl: string;
  storagePath: string;
  moduleId: string | null;
  moduleName: string | null;
  width: number;
  height: number;
  createdAt: number;
  caption: string | null;
};

/**
 * Upload un PNG vers Firebase Storage + crée la metadata Firestore.
 * Utilisé après une capture d'écran. Renvoie le screenshot persisté.
 */
export async function uploadScreenshot(
  uid: string,
  bytes: Uint8Array,
  meta: {
    moduleId?: string | null;
    moduleName?: string | null;
    width?: number;
    height?: number;
  } = {},
): Promise<Screenshot> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");

  const ts = Date.now();
  const storagePath = `users/${uid}/screenshots/${ts}.png`;
  const storageRef = ref(fb.storage, storagePath);
  const blob = new Blob([bytes as BlobPart], { type: "image/png" });

  await uploadBytes(storageRef, blob, { contentType: "image/png" });
  const imageUrl = await getDownloadURL(storageRef);

  // Crée le doc Firestore avec la metadata.
  const docRef = await addDoc(
    collection(fb.db, "users", uid, "screenshots"),
    {
      imageUrl,
      storagePath,
      moduleId: meta.moduleId ?? null,
      moduleName: meta.moduleName ?? null,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      caption: null,
      createdAt: serverTimestamp(),
    },
  );

  return {
    id: docRef.id,
    imageUrl,
    storagePath,
    moduleId: meta.moduleId ?? null,
    moduleName: meta.moduleName ?? null,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    createdAt: ts,
    caption: null,
  };
}

export function watchScreenshots(
  uid: string,
  callback: (screenshots: Screenshot[]) => void,
  cap = 100,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "users", uid, "screenshots"),
    orderBy("createdAt", "desc"),
    fbLimit(cap),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: Screenshot[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
          storagePath:
            typeof data.storagePath === "string" ? data.storagePath : "",
          moduleId: typeof data.moduleId === "string" ? data.moduleId : null,
          moduleName:
            typeof data.moduleName === "string" ? data.moduleName : null,
          width: typeof data.width === "number" ? data.width : 0,
          height: typeof data.height === "number" ? data.height : 0,
          createdAt: tsToMs(data.createdAt) ?? 0,
          caption: typeof data.caption === "string" ? data.caption : null,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[screenshots] watch failed:", err);
      callback([]);
    },
  );
}

export async function deleteScreenshot(
  uid: string,
  screenshot: Screenshot,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  // Best-effort cleanup du Storage avant de delete le doc — si le
  // Storage delete échoue (déjà supprimé, etc.), on continue quand
  // même pour ne pas bloquer l'user.
  if (screenshot.storagePath) {
    try {
      await deleteObject(ref(fb.storage, screenshot.storagePath));
    } catch {
      /* silent */
    }
  }
  await deleteDoc(doc(fb.db, "users", uid, "screenshots", screenshot.id));
}

export async function updateScreenshotCaption(
  uid: string,
  screenshotId: string,
  caption: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const cleaned = caption?.trim().slice(0, 200) ?? "";
  await updateDoc(doc(fb.db, "users", uid, "screenshots", screenshotId), {
    caption: cleaned || null,
  });
}

function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
