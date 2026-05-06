/**
 * Modules mock pour la démo Library (section 04). Type local simple,
 * découplé du type LauncherModule (qui contient le pageBuilder
 * complet, les sources GitHub, etc. — non nécessaires pour une
 * démo visuelle).
 */

export type DemoModuleSource = "official" | "shortcut" | "custom-mc";
export type DemoModuleStatus = "not-installed" | "downloading" | "installed" | "update-available" | "playing";

export type DemoModule = {
  id: string;
  name: string;
  shortDescription: string;
  source: DemoModuleSource;
  status: DemoModuleStatus;
  bannerUrl?: string;
  iconUrl?: string;
  /** Version courante / version distante pour le badge */
  version?: string;
  remoteVersion?: string;
  /** Si downloading, % de progression. */
  downloadPct?: number;
  /** Pour la card "vivante" — déclenche la boucle d'animation auto. */
  cycleDemo?: boolean;
  /** Tag custom genre "Modpack 200 mods", "Cosmic Horror", etc. */
  tag?: string;
};

export const MOCK_MODULES: DemoModule[] = [
  {
    id: "create-astral",
    name: "Create: Astral",
    shortDescription: "Modpack moddé Forge, expert progression, ~200 mods",
    source: "official",
    status: "installed",
    version: "1.20.1",
    bannerUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=900&q=70",
    tag: "Forge",
  },
  {
    id: "all-the-mods-10",
    name: "All The Mods 10",
    shortDescription: "Kitchen sink classique, multi-progression",
    source: "official",
    status: "update-available",
    version: "1.21",
    remoteVersion: "1.21.1",
    bannerUrl:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=70",
    tag: "NeoForge",
  },
  {
    id: "vault-hunters",
    name: "Vault Hunters",
    shortDescription: "Roguelike RPG, rejoue chaque vault",
    source: "official",
    status: "not-installed",
    cycleDemo: true,
    bannerUrl:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=70",
    tag: "Modpack",
  },
  {
    id: "minecraft-vanilla",
    name: "Minecraft Vanilla",
    shortDescription: "1.21 sans mods, pour les sessions chill",
    source: "official",
    status: "installed",
    version: "1.21",
    bannerUrl:
      "https://images.unsplash.com/photo-1528148343865-51218c4a13e6?auto=format&fit=crop&w=900&q=70",
    tag: "Vanilla",
  },
  {
    id: "steam-shortcut",
    name: "Counter-Strike 2",
    shortDescription: "Raccourci vers ton install Steam local",
    source: "shortcut",
    status: "installed",
    bannerUrl:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=70",
    tag: "Local",
  },
  {
    id: "my-custom-mc",
    name: "Mon labo MC",
    shortDescription: "Instance perso, mods triés à la main",
    source: "custom-mc",
    status: "playing",
    version: "1.20.1",
    bannerUrl:
      "https://images.unsplash.com/photo-1605379399642-870262d3d051?auto=format&fit=crop&w=900&q=70",
    tag: "Mon MC",
  },
];
