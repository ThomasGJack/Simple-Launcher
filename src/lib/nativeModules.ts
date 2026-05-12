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
import type { FivemModule, LauncherModule, ModulePageV2 } from "@/types/module";

/**
 * Page d'installation officielle FiveM. Quand `executablePath` est
 * null, le bouton primaire de la card ouvre cette URL au lieu d'essayer
 * de lancer un exe.
 */
export const FIVEM_INSTALL_URL = "https://fivem.net/";

/**
 * Page detail riche pour le module FiveM — affichée quand l'user clique
 * sur la tile dans la library. Compose les blocks pré-existants
 * (hero-parallax, rich-text, feature-cards, cta) pour expliquer ce
 * qu'est FiveM, lister les principaux modes de jeu, et offrir des
 * raccourcis vers les sites officiels Cfx.re.
 */
const FIVEM_PAGE: ModulePageV2 = {
  version: 2,
  background: {
    type: "color",
    value: "#0a0710",
  },
  theme: {
    primary: "#f40552",
    accent: "#ff7a3d",
    fontDisplay: "Audiowide",
  },
  playButton: {
    label: "JOUER",
    position: "bottom-center",
    style: "neon-pulse",
    sizeScale: 1.0,
  },
  blocks: [
    {
      id: "fivem-hero",
      type: "hero-parallax",
      props: {
        bgUrl: "/native-modules/fivem/banner.svg",
        title: "FiveM",
        subtitle: "Le mod multijoueur officiel de GTA V",
        height: "lg",
        overlay: "gradient-bottom",
        parallaxStrength: 0.3,
      },
    },
    {
      id: "fivem-desc",
      type: "rich-text",
      props: {
        markdown: [
          "FiveM ouvre GTA V à des **milliers de serveurs communautaires**",
          "avec des règles, scripts et économies propres : RP médiéval,",
          "drift à San Andreas, course Mario Kart-style, deathmatch infini.",
          "",
          "Le launcher Simple détecte FiveM.exe sur ton PC et le lance",
          "directement quand tu cliques **Jouer**. Tu gardes ton compte",
          "Rockstar Social Club (rien à reconfigurer côté Simple Launcher).",
          "Le Rich Presence Discord et le tracking du temps de jeu sont",
          "automatiques — comme pour tes autres jeux.",
        ].join("\n"),
        align: "left",
        prose: "default",
        appearAnimation: "fade-up",
      },
      theme: {
        bg: "glass",
        paddingY: "md",
        maxWidth: "default",
      },
    },
    {
      id: "fivem-modes",
      type: "feature-cards",
      props: {
        cards: [
          {
            icon: "🎭",
            title: "Roleplay",
            description:
              "Incarne un perso dans une ville persistante. Police, médecin, mafia, mécano…",
            accent: "#f40552",
          },
          {
            icon: "🏎️",
            title: "Drift & Race",
            description:
              "Circuits dédiés, tunings poussés, leaderboards. Du fun pur sans timer.",
            accent: "#ff7a3d",
          },
          {
            icon: "💥",
            title: "Deathmatch",
            description:
              "Arènes free-for-all ou en équipe. Loadouts custom, respawn rapide.",
            accent: "#ffb547",
          },
          {
            icon: "🌍",
            title: "Custom maps",
            description:
              "Mondes entièrement remodelés : Liberty City, San Andreas étendu, lunaire.",
            accent: "#bd0a4c",
          },
        ],
        columns: 4,
        iconStyle: "filled",
      },
      theme: {
        paddingY: "lg",
        maxWidth: "wide",
      },
    },
    {
      id: "fivem-cta-servers",
      type: "cta",
      props: {
        title: "Découvre les serveurs",
        description:
          "Le browser officiel liste plus de 5 000 serveurs FiveM actifs, triés par joueurs et catégorie.",
        buttonLabel: "Ouvrir le browser de serveurs",
        buttonAction: "url",
        buttonUrl: "https://servers.fivem.net/",
      },
      theme: {
        bg: "glass-strong",
        paddingY: "md",
        maxWidth: "default",
      },
    },
    {
      id: "fivem-cta-wiki",
      type: "cta",
      props: {
        title: "Tu veux créer ton propre serveur ?",
        description:
          "Le wiki officiel Cfx.re documente l'installation d'un serveur, l'écriture de resources Lua/JS, l'admin de ta communauté.",
        buttonLabel: "Lire le wiki Cfx.re",
        buttonAction: "url",
        buttonUrl: "https://docs.fivem.net/",
      },
      theme: {
        bg: "glass",
        paddingY: "md",
        maxWidth: "default",
      },
    },
  ],
};

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
  page: FIVEM_PAGE,
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
