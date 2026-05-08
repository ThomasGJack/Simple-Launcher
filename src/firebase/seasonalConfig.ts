// Saisonniers — config globale stockée dans Firestore plutôt qu'en
// localStorage par user. Avant Phase J : chaque user pouvait choisir
// son mode (auto/halloween/christmas/off). Après : c'est un override
// admin-only, le user ne choisit plus rien. Mode "auto" par défaut
// (basé sur la date), admin peut forcer ou désactiver depuis le panel
// admin → onglet Saisons.
//
// Schéma Firestore :
//
//   /config/seasonal
//     mode:       "auto" | "halloween" | "christmas" | "off"
//     updatedAt:  serverTimestamp
//     updatedByUid: <admin uid>
//
// Lit + write gated dans firestore.rules — read tout authed, write
// admin-only (gros avantage de centraliser ce genre de toggle global :
// un seul endroit pour les rules).

import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";
import type { SeasonalMode } from "@/lib/seasonal";

export type SeasonalConfig = {
  mode: SeasonalMode;
  updatedAt: number | null;
  updatedByUid: string | null;
};

const DEFAULT: SeasonalConfig = {
  mode: "auto",
  updatedAt: null,
  updatedByUid: null,
};

/**
 * Watch live la config saisonnière. Rappelle le callback à chaque
 * changement Firestore — utilisé au boot pour piloter le thème, et
 * dans le panel admin pour rafraîchir l'état affiché.
 *
 * Si le doc n'existe pas (premier boot ever, ou supprimé), on émet la
 * config par défaut (mode "auto") plutôt qu'undefined — simplifie les
 * call-sites.
 */
export function watchSeasonalConfig(
  callback: (config: SeasonalConfig) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback(DEFAULT);
    return () => {};
  }
  return onSnapshot(
    doc(fb.db, "config", "seasonal"),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT);
        return;
      }
      const data = snap.data();
      const mode = isMode(data.mode) ? data.mode : "auto";
      const updatedAt =
        data.updatedAt && typeof data.updatedAt.toMillis === "function"
          ? (data.updatedAt.toMillis() as number)
          : null;
      callback({
        mode,
        updatedAt,
        updatedByUid:
          typeof data.updatedByUid === "string" ? data.updatedByUid : null,
      });
    },
    (err) => {
      console.warn("[seasonalConfig] watch failed:", err);
      callback(DEFAULT);
    },
  );
}

/**
 * Persiste un nouveau mode saisonnier. Admin-only côté rules — un user
 * non-admin reçoit `permission-denied` et la promesse rejette.
 */
export async function setSeasonalConfig(
  mode: SeasonalMode,
  adminUid: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await setDoc(
    doc(fb.db, "config", "seasonal"),
    {
      mode,
      updatedAt: serverTimestamp(),
      updatedByUid: adminUid,
    },
    { merge: true },
  );
}

function isMode(value: unknown): value is SeasonalMode {
  return (
    value === "auto" ||
    value === "halloween" ||
    value === "christmas" ||
    value === "off"
  );
}
