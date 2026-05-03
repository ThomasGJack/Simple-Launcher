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

/**
 * Native modpack source — describes how the launcher should populate
 * `.minecraft/` for a Minecraft module that uses the native launch path
 * (no Prism). Only relevant when `nativeMc === true`.
 *
 * - `none`: pure vanilla + loader, no extra mods
 * - `modrinth`: pull a `.mrpack` from `mrpackUrl` (manifest resolves
 *   loader + mod URLs)
 * - `zip`: pull a generic ZIP that already contains a `.minecraft/`
 *   layout (mods/, config/, etc.) and extract it verbatim
 */
export type NativeModpackSource =
  | { kind: "none" }
  | { kind: "modrinth"; mrpackUrl: string; modrinthProjectId?: string; versionLabel?: string }
  | { kind: "zip"; zipUrl: string };

export type MinecraftModule = BaseModule & {
  type: "minecraft";
  // ─── Legacy Prism-based config (still used when nativeMc !== true) ──
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

  // ─── Native launch path (no Prism dependency) ──────────────────────
  /**
   * When `true`, the launcher uses the in-house native chain (mc_auth +
   * mc_java + mc_vanilla + mc_fabric/mc_forge + mc_modrinth/mc_zip +
   * mc_launch) instead of Prism. The Prism-related fields above are
   * ignored — the native config below drives the install + launch.
   */
  nativeMc?: boolean;
  /** Vanilla MC version pinned for this module, e.g. "1.20.1" or
   *  "26.1.2". Required when `nativeMc === true`. */
  nativeMcVersion?: string;
  /** Loader pick: "vanilla" (no loader) / fabric / forge / neoforge. */
  nativeLoader?: "vanilla" | "fabric" | "forge" | "neoforge";
  /** Loader version (e.g. "0.16.0" for Fabric, "47.4.0" for Forge,
   *  "21.5.34-beta" for NeoForge). Ignored when loader === "vanilla". */
  nativeLoaderVersion?: string;
  /** Optional modpack overlay applied on top of vanilla + loader. */
  nativeModpack?: NativeModpackSource;
};

export type LauncherModule = HostedModule | ShortcutModule | MinecraftModule;
