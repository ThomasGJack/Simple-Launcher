// Firestore cache pour les infos enrichies des jeux Steam.
// Schéma : /steamApps/{appId} = { data: SteamGameInfo, cachedAt: ts }
// TTL 24h — au-delà, refetch via Tauri command + écrase le cache.
//
// Cache PARTAGÉ entre tous les users du crew → un seul user fait l'appel
// Steam pour 50 personnes. Économie de bande-passante + rate limit.

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getFirebase } from "./config";
import type { SteamGameInfo } from "@/lib/steamGameInfo";

const TTL_MS = 24 * 3600_000; // 24h

export type CachedSteamApp = {
  data: SteamGameInfo;
  cachedAt: number;
};

export async function loadCachedSteamApp(
  appId: string,
): Promise<CachedSteamApp | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const ref = doc(fb.db, "steamApps", appId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const raw = snap.data();
    const cachedAt =
      raw.cachedAt instanceof Timestamp ? raw.cachedAt.toMillis() : 0;
    if (!cachedAt) return null;
    if (Date.now() - cachedAt > TTL_MS) return null; // stale
    return {
      data: raw.data as SteamGameInfo,
      cachedAt,
    };
  } catch (err) {
    console.warn("[steamApps] loadCached failed:", err);
    return null;
  }
}

export async function saveCachedSteamApp(
  appId: string,
  data: SteamGameInfo,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  try {
    const ref = doc(fb.db, "steamApps", appId);
    await setDoc(ref, {
      data,
      cachedAt: serverTimestamp(),
    });
  } catch (err) {
    // Best-effort — si la rule Firestore refuse l'écriture, on continue
    // silencieusement (le frontend a la donnée en mémoire pour cette
    // session, juste pas partagée).
    console.warn("[steamApps] saveCached failed:", err);
  }
}
