/**
 * Modules natifs — bundled directement dans le binaire du launcher,
 * jamais publiés sur Firestore `/modules/`. Affichés en haut de la
 * library de chaque user comme tous les autres modules.
 *
 * Aujourd'hui : un seul module natif, **FiveM** (GTA V multiplayer).
 *
 * Pattern :
 *   - Le hook `useNativeModules()` détecte au boot si FiveM.exe est
 *     installé (via `invoke("fivem_detect")` côté Rust, qui scan le
 *     registry Cfx.re + le default install path).
 *   - Si trouvé → le module a `executablePath` set → bouton "Jouer" qui
 *     spawn FiveM.exe direct via `module_launch_shortcut`.
 *   - Si pas trouvé → `executablePath` est null → bouton "Installer
 *     FiveM" qui ouvre https://fivem.net/ dans le navigateur.
 *   - Re-detect au prochain `window.focus` — catch le cas "l'user
 *     vient d'installer FiveM pendant que le launcher tournait".
 *
 * Pourquoi pas via Firestore /modules : ces entrées sont des fonctions
 * client-side (détection registry, install URL) — y'a rien à
 * versionner ni à servir depuis le cloud. Tout est statique au boot
 * du launcher.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FivemModule, LauncherModule } from "@/types/module";

/**
 * Page d'installation officielle FiveM. Quand `executablePath` est
 * null, le bouton primaire de la card ouvre cette URL au lieu d'essayer
 * de lancer un exe.
 */
export const FIVEM_INSTALL_URL = "https://fivem.net/";

/**
 * Template du module FiveM — tout sauf le `executablePath` qui est
 * runtime-dependent (détecté par Rust au boot).
 */
const FIVEM_TEMPLATE: Omit<FivemModule, "executablePath"> = {
  id: "native-fivem",
  type: "fivem",
  name: "FiveM",
  shortDescription:
    "Mod multijoueur officiel de GTA V — serveurs RP, drift, race, DM.",
  iconUrl: "/native-modules/fivem/icon.svg",
  bannerUrl: "/native-modules/fivem/banner.svg",
};

type FivemDetectResponse = { executablePath: string } | null;

/**
 * Hook React qui retourne la liste des modules natifs avec leur état
 * de détection résolu. La liste est stable (même référence si rien
 * n'a changé) pour éviter les re-renders inutiles dans LibraryPage.
 */
export function useNativeModules(): LauncherModule[] {
  const [fivemPath, setFivemPath] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      try {
        const install = await invoke<FivemDetectResponse>("fivem_detect");
        if (cancelled) return;
        setFivemPath(install?.executablePath ?? null);
        setDetected(true);
      } catch (err) {
        if (cancelled) return;
        console.warn("[nativeModules] fivem_detect failed:", err);
        setFivemPath(null);
        setDetected(true);
      }
    };

    detect();

    // Re-detect quand la fenêtre regagne le focus — couvre le cas
    // "l'user vient d'installer FiveM via le bouton Installer et est
    // revenu sur le launcher". Throttle implicite : focus ne fire pas
    // en rafale comme un mousemove.
    const onFocus = () => {
      detect();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Tant que la détection initiale n'a pas répondu, on ne renvoie rien
  // pour éviter de flasher "Non installé" puis "Jouer" en 50 ms quand
  // FiveM est en fait là.
  if (!detected) return [];

  const fivem: FivemModule = {
    ...FIVEM_TEMPLATE,
    executablePath: fivemPath,
  };
  return [fivem];
}
