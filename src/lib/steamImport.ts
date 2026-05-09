// Steam library import — wrappers TS autour de `src-tauri/src/steam.rs`.
// Détecte Steam, liste les jeux installés, et convertit en
// ShortcutModule (pour bulk insert dans /users/{uid}/shortcuts/).

import { invoke } from "@tauri-apps/api/core";

export type SteamInstall = {
  path: string;
  libraryPaths: string[];
};

export type SteamGame = {
  appId: string;
  name: string;
  installDir: string;
};

export async function detectSteam(): Promise<SteamInstall | null> {
  return invoke<SteamInstall | null>("steam_detect");
}

export async function listSteamGames(): Promise<SteamGame[]> {
  return invoke<SteamGame[]>("steam_list_games");
}

/**
 * URL de la cover verticale Steam haute définition d'un appId. C'est
 * exactement la même image que Steam affiche dans sa propre library
 * (l'art "tall capsule" 600×900 que les éditeurs uploadent depuis 2019).
 *
 * Version `_2x` = 1200×1800 px, retina-quality. Match parfaitement le
 * ratio aspect-[4/5] de ModuleCard. Si l'asset n'existe pas (vieux
 * jeu sans library art), 404 → onError fallback vers header.jpg ou
 * placeholder ModuleCard.
 */
export function steamCoverUrl(appId: string): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`;
}

/**
 * Convertit un SteamGame en ShortcutModule prêt à être persisté via
 * saveUserShortcut. Lance le jeu via `steam://run/{appid}` URL —
 * Steam Client résout le chemin lui-même. Pas besoin de parser
 * `appinfo.vdf` binaire.
 *
 * Visual : juste la cover verticale 1200×1800 (la même que Steam
 * utilise dans sa library). Pas d'iconUrl — la cover contient déjà
 * le logo / titre stylisé du jeu, un overlay d'icône serait redondant
 * et moche (header.jpg cramé à 40×40px).
 */
export function steamGameToShortcut(game: SteamGame): {
  id: string;
  type: "shortcut";
  name: string;
  shortDescription: string;
  executablePath: string;
  bannerUrl: string;
} {
  return {
    id: `steam-${game.appId}`,
    type: "shortcut",
    name: game.name,
    shortDescription: `Lancé via Steam (App ID ${game.appId})`,
    executablePath: `steam://run/${game.appId}`,
    // Cover verticale 1200×1800 = celle exacte de Steam library.
    bannerUrl: steamCoverUrl(game.appId),
  };
}
