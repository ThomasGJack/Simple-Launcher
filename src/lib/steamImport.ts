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
 * URLs des assets Steam pour un appId donné. Steam héberge les images
 * sur leur CDN public Cloudflare — pas besoin de scraper le filesystem
 * ni d'appeler une API authentifiée.
 *
 * - `library_600x900.jpg` : cover verticale 600×900, idéale pour la
 *   card de la library (ratio 4:5 que ModuleCard attend).
 * - `header.jpg` : bannière horizontale 460×215, sert d'icône carrée
 *   recadrée sur la library (mb-2 size-10 dans ModuleCard).
 * - `library_hero.jpg` : key art 1920×620, utilisé pour la page module
 *   en fond. (Pas tous les jeux ont cet asset, fallback header.)
 *
 * Si un asset est absent (jeu vraiment vieux ou retiré), l'URL renverra
 * un 404 et `<img>` tombera en placeholder ModuleCard (Gamepad2 icon).
 */
function steamAssetUrls(appId: string): { cover: string; header: string } {
  const base = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;
  return {
    cover: `${base}/library_600x900.jpg`,
    header: `${base}/header.jpg`,
  };
}

/**
 * Convertit un SteamGame en ShortcutModule prêt à être persisté via
 * saveUserShortcut. Lance le jeu via `steam://run/{appid}` URL —
 * Steam Client résout le chemin lui-même. Pas besoin de parser
 * `appinfo.vdf` binaire.
 *
 * Récupère aussi les assets visuels depuis le CDN Steam : cover
 * verticale (`bannerUrl`) et header horizontal (`iconUrl`). Sans ça,
 * la library affichait juste le nom sur fond noir → moche. Avec ces
 * URLs, ModuleCard rend la cover comme banner full-card et le header
 * comme icône en bas — UX cohérente avec les modules custom.
 */
export function steamGameToShortcut(game: SteamGame): {
  id: string;
  type: "shortcut";
  name: string;
  shortDescription: string;
  executablePath: string;
  iconUrl: string;
  bannerUrl: string;
} {
  const assets = steamAssetUrls(game.appId);
  return {
    id: `steam-${game.appId}`,
    type: "shortcut",
    name: game.name,
    shortDescription: `Lancé via Steam (App ID ${game.appId})`,
    executablePath: `steam://run/${game.appId}`,
    // Header carré utilisé comme icon (60×60 affiché dans la card).
    iconUrl: assets.header,
    // Cover verticale 4:5 utilisée comme banner full-card.
    bannerUrl: assets.cover,
  };
}
