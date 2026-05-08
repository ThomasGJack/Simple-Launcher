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
 * Convertit un SteamGame en ShortcutModule prêt à être persisté via
 * saveUserShortcut. Lance le jeu via `steam://run/{appid}` URL —
 * Steam Client résout le chemin lui-même. Pas besoin de parser
 * `appinfo.vdf` binaire.
 */
export function steamGameToShortcut(game: SteamGame): {
  id: string;
  type: "shortcut";
  name: string;
  shortDescription: string;
  executablePath: string;
} {
  return {
    id: `steam-${game.appId}`,
    type: "shortcut",
    name: game.name,
    shortDescription: `Lancé via Steam (App ID ${game.appId})`,
    executablePath: `steam://run/${game.appId}`,
  };
}
