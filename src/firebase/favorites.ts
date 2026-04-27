import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { getFirebase } from "./config";

export function watchFavorites(uid: string, callback: (ids: string[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(doc(fb.db, "users", uid), (snap) => {
    const data = snap.data();
    const list = Array.isArray(data?.favorites) ? (data!.favorites as string[]) : [];
    callback(list);
  });
}

export async function addFavorite(uid: string, moduleId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(doc(fb.db, "users", uid), { favorites: arrayUnion(moduleId) }, { merge: true });
}

export async function removeFavorite(uid: string, moduleId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(doc(fb.db, "users", uid), { favorites: arrayRemove(moduleId) }, { merge: true });
}
