// Service Steam Web API — orchestre le fetch (via Tauri Rust) + cache
// Firestore. La donnée est partagée entre tous les users du crew (1
// user fait le fetch, les autres lisent du cache).

import { invoke } from "@tauri-apps/api/core";
import {
  loadCachedSteamApp,
  saveCachedSteamApp,
} from "@/firebase/steamApps";

// Mirror du SteamGameInfo struct côté Rust (steam_api.rs).
export type SteamGameInfo = {
  app_id: string;

  name: string | null;
  type: string | null;
  is_free: boolean | null;
  short_description: string | null;
  detailed_description: string | null;
  about_the_game: string | null;
  supported_languages: string | null;
  header_image: string | null;
  capsule_image: string | null;
  background: string | null;
  developers: string[];
  publishers: string[];
  price_overview: PriceOverview | null;
  platforms: Platforms | null;
  categories: NamedItem[];
  genres: NamedItem[];
  screenshots: Screenshot[];
  movies: Movie[];
  recommendations_total: number | null;
  release_date: ReleaseDate | null;
  metacritic_score: number | null;
  metacritic_url: string | null;
  controller_support: string | null;
  dlc: number[];
  pc_requirements_minimum: string | null;
  pc_requirements_recommended: string | null;

  current_players: number | null;

  review_score: number | null;
  review_score_desc: string | null;
  total_positive: number | null;
  total_negative: number | null;
  total_reviews: number | null;

  achievement_percents: AchievementPercent[];
};

export type PriceOverview = {
  currency: string;
  initial: number;
  final: number;
  discount_percent: number;
  initial_formatted: string;
  final_formatted: string;
};

export type Platforms = {
  windows: boolean;
  mac: boolean;
  linux: boolean;
};

export type NamedItem = {
  id: string;
  description: string;
};

export type Screenshot = {
  id: number;
  path_thumbnail: string;
  path_full: string;
};

export type Movie = {
  id: number;
  name: string;
  thumbnail: string;
  webm_max: string | null;
  mp4_max: string | null;
};

export type ReleaseDate = {
  coming_soon: boolean;
  date: string;
};

export type AchievementPercent = {
  name: string;
  percent: number;
};

// Cache mémoire pour la session courante — évite re-fetch Firestore
// pour le même appId pendant qu'on navigue.
const sessionCache = new Map<string, SteamGameInfo>();

/**
 * Récupère l'info enrichie d'un jeu Steam :
 *   1. Cache mémoire (session) → instant
 *   2. Cache Firestore /steamApps/{appId} (TTL 24h) → ~50ms
 *   3. Fetch Steam APIs via Tauri (parallèle 4 endpoints) → ~500-1500ms
 *      puis sauve en Firestore pour les autres users.
 */
export async function getSteamGameInfo(appId: string): Promise<SteamGameInfo | null> {
  if (!appId) return null;

  // 1. Session cache
  const memHit = sessionCache.get(appId);
  if (memHit) return memHit;

  // 2. Firestore cache
  const fsHit = await loadCachedSteamApp(appId);
  if (fsHit) {
    sessionCache.set(appId, fsHit.data);
    return fsHit.data;
  }

  // 3. Fetch fresh from Steam APIs via Rust
  try {
    const fresh = await invoke<SteamGameInfo>("steam_api_get_game_info", { appId });
    sessionCache.set(appId, fresh);
    // Save to Firestore best-effort (don't block return).
    saveCachedSteamApp(appId, fresh).catch(() => {});
    return fresh;
  } catch (err) {
    console.warn("[steamGameInfo] fetch failed for", appId, err);
    return null;
  }
}

/**
 * Force un refresh ignorant le cache. Utile si l'user clique
 * "Rafraîchir" pour avoir le nb de joueurs en ligne live.
 */
export async function refreshSteamGameInfo(
  appId: string,
): Promise<SteamGameInfo | null> {
  sessionCache.delete(appId);
  try {
    const fresh = await invoke<SteamGameInfo>("steam_api_get_game_info", { appId });
    sessionCache.set(appId, fresh);
    saveCachedSteamApp(appId, fresh).catch(() => {});
    return fresh;
  } catch (err) {
    console.warn("[steamGameInfo] refresh failed:", err);
    return null;
  }
}

/**
 * Helper : extrait l'appId depuis l'executablePath d'un shortcut Steam
 * (qui ressemble à `steam://run/{appId}`). Retourne null si ce n'est
 * pas un shortcut Steam.
 */
export function extractSteamAppId(executablePath: string): string | null {
  const match = /^steam:\/\/run\/(\d+)/i.exec(executablePath);
  return match ? match[1] : null;
}

/**
 * Format Mostly Positive / Very Positive en couleur.
 * Steam review_score : 1=Overwhelmingly Negative, 9=Overwhelmingly Positive.
 */
export function reviewScoreColor(score: number | null): string {
  if (score === null) return "text-fg-muted";
  if (score >= 8) return "text-emerald-400"; // Very Positive / Overwhelmingly Positive
  if (score >= 6) return "text-cyan-400"; // Mostly Positive
  if (score >= 4) return "text-amber-400"; // Mixed
  if (score >= 2) return "text-orange-400"; // Mostly Negative
  return "text-rose-400"; // Negative / Overwhelmingly Negative
}

/**
 * Rareté d'un achievement basée sur le % unlock global.
 * < 1% = ultra rare, < 10% = rare, < 50% = peu commun, ≥ 50% = commun.
 */
export type AchievementRarity = "ultra-rare" | "rare" | "uncommon" | "common";

export function achievementRarity(percent: number): AchievementRarity {
  if (percent < 1) return "ultra-rare";
  if (percent < 10) return "rare";
  if (percent < 50) return "uncommon";
  return "common";
}
