export type ModuleType = "hosted" | "shortcut" | "minecraft" | "custom-minecraft";

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
 * `.minecraft/` for a Minecraft module.
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

/**
 * Minecraft module — always uses the in-house native launch chain
 * (`mc_native_launch` + `mc_vanilla_*` / `mc_fabric_*` / `mc_forge_*` /
 * `mc_modrinth_*` / `mc_zip_*` Tauri commands). Prism support was
 * removed in v26.05.03.8.
 *
 * Fields removed in that release for completeness :
 *   `curseforgeProjectId`, `curseforgeFileId`, `customZipUrl`,
 *   `customZipSize`, `prismInstanceName`, `nativeMc` (always treated
 *   as true now). Existing Firestore documents that still carry these
 *   fields just have them ignored at read time — TypeScript won't see
 *   them through this type and they're harmless on disk.
 */
export type MinecraftModule = BaseModule & {
  type: "minecraft";

  // Optional metadata, displayed but not required for launching.
  minecraftVersion?: string;
  modLoader?: "forge" | "fabric" | "quilt" | "neoforge";

  /**
   * Max heap size for the JVM, in MiB. Default behaviour when unset is
   * `mc_launch.rs` falling back to 4096 MiB. Per-machine user override
   * lives in localStorage (see `getUserRamOverride` in `lib/minecraft.ts`).
   */
  maxRamMb?: number;

  // ─── Native install/launch config ──────────────────────────────────
  /** Vanilla MC version pinned for this module, e.g. "1.20.1". */
  nativeMcVersion?: string;
  /** Loader pick: "vanilla" (no loader) / fabric / forge / neoforge. */
  nativeLoader?: "vanilla" | "fabric" | "forge" | "neoforge";
  /** Loader version (e.g. "0.16.0" for Fabric, "47.4.0" for Forge,
   *  "21.5.34-beta" for NeoForge). Ignored when loader === "vanilla". */
  nativeLoaderVersion?: string;
  /** Optional modpack overlay applied on top of vanilla + loader. */
  nativeModpack?: NativeModpackSource;
};

/**
 * Personal/private Minecraft instance the user creates from the
 * Library page (vs `MinecraftModule` which is admin-published and
 * shared across the launcher community).
 *
 * Same shape as `MinecraftModule` minus the publishing fields, plus a
 * stable `ownerUid` so Firestore rules can gate writes. Stored at
 * `users/{uid}/customMinecraft/{id}` and merged with shortcuts in the
 * Library list. Launch path is identical to hosted MC modules — the
 * native `mc_native_launch` chain only cares about the `instanceId`.
 */
export type CustomMinecraftModule = BaseModule & {
  type: "custom-minecraft";
  ownerUid: string;
  /** Vanilla MC version, e.g. "1.20.1". Required. */
  nativeMcVersion: string;
  /** Loader pick. */
  nativeLoader: "vanilla" | "fabric" | "forge" | "neoforge";
  /** Loader version (ignored for vanilla). */
  nativeLoaderVersion?: string;
  /** Optional Modrinth modpack overlay. */
  nativeModpack?: NativeModpackSource;
  /** Heap allocation in MiB. Defaults to 4096 in `mc_launch.rs`. */
  maxRamMb?: number;
};

export type LauncherModule =
  | HostedModule
  | ShortcutModule
  | MinecraftModule
  | CustomMinecraftModule;
