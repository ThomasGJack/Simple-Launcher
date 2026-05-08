// Cosmetics persistence — sub-collection `/users/{uid}/cosmetics/{id}`
// pour les unlocks explicits (admin grant, achievement auto-grant, etc.)
// + champ `equippedCosmetics` sur le user doc pour le slot actif.
//
// Les cosmétiques "default" (disponibles dès le début pour tous) ne
// sont PAS écrites en Firestore — `isUnlocked()` côté client gère.
// Ce qu'on stocke ici, c'est seulement les unlocks "earnés".

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";
import type { CosmeticUnlockSource } from "@/lib/cosmetics";

export type GrantedCosmetic = {
  id: string;
  unlockedAt: number;
  source: CosmeticUnlockSource;
};

export type EquippedCosmetics = {
  /** ID de la frame d'avatar équipée. null = aucune frame. */
  frame: string | null;
};

/**
 * Watch live des cosmétiques granted pour un user. Renvoie la liste
 * des unlocks explicits (pas ceux qui sont default).
 */
export function watchGrantedCosmetics(
  uid: string,
  callback: (granted: GrantedCosmetic[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(fb.db, "users", uid, "cosmetics"),
    (snap) => {
      const list: GrantedCosmetic[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          unlockedAt:
            typeof data.unlockedAt === "number"
              ? data.unlockedAt
              : data.unlockedAt?.toMillis?.() ?? 0,
          source:
            typeof data.source === "string"
              ? (data.source as CosmeticUnlockSource)
              : "admin",
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[cosmetics] watch failed:", err);
      callback([]);
    },
  );
}

/**
 * Grant une cosmétique à un user. Idempotent — re-grant la même ne
 * casse rien. Source documente d'où vient l'unlock pour un audit
 * éventuel.
 */
export async function grantCosmetic(
  uid: string,
  cosmeticId: string,
  source: CosmeticUnlockSource,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "users", uid, "cosmetics", cosmeticId),
    {
      source,
      unlockedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Révoque un grant. Utile pour debug / admin manuel. */
export async function revokeCosmetic(uid: string, cosmeticId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "users", uid, "cosmetics", cosmeticId));
}

/**
 * Met à jour la cosmétique équipée par le user. Écrit dans le doc
 * principal `users/{uid}` au champ `equippedCosmetics`. Pour
 * "désequiper" une slot, passer `null`.
 */
export async function setEquippedFrame(
  uid: string,
  frameId: string | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await updateDoc(doc(fb.db, "users", uid), {
    equippedCosmetics: { frame: frameId },
  });
}
