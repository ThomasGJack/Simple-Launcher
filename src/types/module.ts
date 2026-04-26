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

export type ModulePage = {
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

export type LauncherModule = HostedModule | ShortcutModule;
