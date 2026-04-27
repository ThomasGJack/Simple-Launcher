export type ModuleType = "hosted" | "shortcut";

export type ModuleStatus =
  | "not-installed"
  | "downloading"
  | "extracting"
  | "ready"
  | "update-available"
  | "running"
  | "error";

export type PageBackground =
  | { type: "image"; url: string; overlay?: string; particles?: ParticlesConfig }
  | { type: "video"; url: string; overlay?: string; particles?: ParticlesConfig }
  | { type: "color"; value: string };

export type ParticlesConfig = {
  preset?: "stars" | "snow" | "fireflies" | "sparkles";
  color?: string;
  density?: number;
};

export type CarouselSlide = {
  image?: string;
  video?: string;
  title?: string;
  subtitle?: string;
  animation?: "ken-burns" | "fade" | "slide";
};

export type PageSection =
  | { type: "carousel"; slides: CarouselSlide[]; interval?: number }
  | { type: "changelog"; entries: { version: string; date: string; notes: string[] }[] }
  | { type: "screenshots-grid"; images: string[] }
  | { type: "stats"; data: { label: string; value: string }[] }
  | { type: "custom-html"; content: string };

/** @deprecated V1 schema. Use ModulePageV2. Kept for rétrocompat reads. */
export type ModulePageV1 = {
  background?: PageBackground;
  hero?: {
    title?: string;
    subtitle?: string;
    logoUrl?: string;
  };
  sections?: PageSection[];
  theme?: {
    primary?: string;
    accent?: string;
    fontDisplay?: string;
  };
  playButton?: {
    label?: string;
    position?: "bottom-right" | "bottom-center" | "center";
    style?: "neon-pulse" | "solid" | "outline";
  };
};

export type ModulePageV2 = {
  version: 2;
  background?: PageBackground;
  theme?: import("./moduleBlocks").ExtendedPageTheme;
  playButton?: import("./moduleBlocks").PlayButtonConfig;
  blocks: import("./moduleBlocks").AnyModuleBlock[];
};

export type ModulePage = ModulePageV1 | ModulePageV2;

export function isModulePageV2(page: ModulePage | undefined | null): page is ModulePageV2 {
  return !!page && (page as ModulePageV2).version === 2 && Array.isArray((page as ModulePageV2).blocks);
}

export type ServerInfo =
  | { type: "minecraft"; address: string };

export type BaseModule = {
  id: string;
  name: string;
  shortDescription?: string;
  iconUrl?: string;
  bannerUrl?: string;
  page?: ModulePage;
  allowedDiscordIds?: string[];
  server?: ServerInfo;
};

export type HostedModule = BaseModule & {
  type: "hosted";
  version: string;
  executable: string;
  downloadUrl: string;
  size: number;
  sha256: string;
};

export type ShortcutModule = BaseModule & {
  type: "shortcut";
  executablePath: string;
  args?: string[];
  workingDirectory?: string;
};

export type MinecraftModule = BaseModule & {
  type: "minecraft";
  // CurseForge IDs are optional when the modpack is self-hosted (customZipUrl).
  curseforgeProjectId?: number;
  curseforgeFileId?: number;
  /**
   * Direct download URL to a CurseForge-format modpack .zip
   * (`manifest.json` + `overrides/` at the root). When set, the launcher
   * skips the CurseForge API entirely and uses this URL instead.
   * Typically a Firebase Storage URL produced by the admin UI.
   */
  customZipUrl?: string;
  /** Size in bytes of the custom zip (display only). */
  customZipSize?: number;
  // Optional metadata, displayed but not required for launching
  minecraftVersion?: string;
  modLoader?: "forge" | "fabric" | "quilt" | "neoforge";
  // Optional override for the Prism instance name (default: from modpack manifest)
  prismInstanceName?: string;
  /**
   * Max heap size for the JVM, in MiB. When set, the launcher writes
   * `OverrideMemory=true` + `MaxMemAlloc=<value>` to the Prism `instance.cfg`
   * so the modpack runs with that allocation regardless of the user's global
   * Prism settings. Recommended: 4096 (4 GB) for vanilla-ish, 6144–8192 for
   * heavy modpacks. The min heap is automatically set to ~half this value.
   */
  maxRamMb?: number;
};

export type LauncherModule = HostedModule | ShortcutModule | MinecraftModule;
