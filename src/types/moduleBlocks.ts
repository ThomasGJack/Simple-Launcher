import type { CarouselSlide, ParticlesConfig } from "./module";

export type BlockId = string;

export type BlockBg = "transparent" | "glass" | "glass-strong" | "solid";
export type BlockPaddingY = "none" | "sm" | "md" | "lg" | "xl";
export type BlockMaxWidth = "narrow" | "default" | "wide" | "full";
export type BlockAlign = "left" | "center" | "right";

export type ModuleBlockTheme = {
  primary?: string;
  accent?: string;
  bg?: BlockBg;
  bgColor?: string;
  paddingY?: BlockPaddingY;
  maxWidth?: BlockMaxWidth;
  align?: BlockAlign;
};

export type HeroParallaxProps = {
  bgUrl?: string;
  videoUrl?: string;
  title?: string;
  subtitle?: string;
  logoUrl?: string;
  height?: "md" | "lg" | "xl" | "screen";
  overlay?: "none" | "dark" | "gradient-bottom" | "gradient-radial" | "vignette";
  parallaxStrength?: number;
};

export type PosterProps = {
  imageUrl: string;
  aspect?: "16/9" | "21/9" | "4/5" | "1/1" | "3/4";
  caption?: string;
  frame?: "none" | "glass" | "neon-glow";
  kenBurns?: boolean;
};

export type GalleryImage = { url: string; caption?: string };
export type GalleryProps = {
  images: GalleryImage[];
  layout?: "grid" | "masonry" | "carousel-3d";
  columns?: 2 | 3 | 4;
  lightbox?: boolean;
};

export type CarouselProps = {
  slides: CarouselSlide[];
  interval?: number;
  transition?: "ken-burns" | "fade" | "slide";
  aspect?: "16/9" | "21/9" | "4/3";
  autoplay?: boolean;
  controls?: "dots" | "arrows" | "both" | "none";
};

export type VideoEmbedProps = {
  provider: "youtube" | "vimeo" | "mp4" | "twitch";
  urlOrId: string;
  aspect?: "16/9" | "21/9" | "4/3" | "9/16";
  autoplay?: boolean;
  mute?: boolean;
  loop?: boolean;
  controls?: boolean;
};

export type ComparisonProps = {
  before: { url: string; label?: string };
  after: { url: string; label?: string };
  orientation?: "horizontal" | "vertical";
  initialPosition?: number;
};

export type RichTextProps = {
  markdown: string;
  align?: BlockAlign;
  prose?: "compact" | "default" | "relaxed";
  appearAnimation?: "none" | "fade" | "fade-up" | "typewriter";
};

export type FeatureCard = {
  icon?: string;
  title: string;
  description?: string;
  accent?: string;
};
export type FeatureCardsProps = {
  cards: FeatureCard[];
  columns?: 2 | 3 | 4;
  iconStyle?: "filled" | "outline" | "neon";
};

export type QuoteProps = {
  text: string;
  author?: string;
  role?: string;
  avatarUrl?: string;
  style?: "glass" | "pull-quote" | "speech";
};

export type CtaAction = "launch" | "url" | "scroll-top";
export type CtaProps = {
  title: string;
  description?: string;
  buttonLabel: string;
  buttonAction: CtaAction;
  buttonUrl?: string;
  bgUrl?: string;
};

export type DividerProps = {
  style?: "line" | "glow" | "gradient" | "particles-strip";
  thickness?: number;
  color?: string;
};

export type SpacerProps = {
  size?: "sm" | "md" | "lg" | "xl";
};

export type StatItem = {
  label: string;
  value: string;
  suffix?: string;
  accent?: string;
};
export type StatsProps = {
  items: StatItem[];
  columns?: 2 | 3 | 4;
  style?: "glass" | "neon" | "minimal";
  animateOnView?: boolean;
};

export type TimelineEntry = {
  date: string;
  title: string;
  description?: string;
  image?: string;
};
export type TimelineProps = {
  entries: TimelineEntry[];
  orientation?: "vertical" | "alternating";
};

export type ChangelogEntry = { version: string; date: string; notes: string[] };
export type ChangelogProps = {
  entries?: ChangelogEntry[];
  source?: "manual" | "auto-from-versions";
  limit?: number;
};

export type ScreenshotsGridProps = {
  images: string[];
  columns?: 2 | 3 | 4;
};

export type MascotMood = "idle" | "happy" | "gaming" | "chat" | "sleeping";
export type MascotSpotProps = {
  mood?: MascotMood;
  position?: "left" | "center" | "right";
  caption?: string;
};

export type ParticlesBandProps = {
  preset?: ParticlesConfig["preset"];
  color?: string;
  density?: number;
  height?: "sm" | "md" | "lg";
};

export type EmbedHtmlProps = {
  html: string;
  height?: number;
};

export type BlockKindMap = {
  "hero-parallax": HeroParallaxProps;
  "poster": PosterProps;
  "gallery": GalleryProps;
  "carousel": CarouselProps;
  "video-embed": VideoEmbedProps;
  "comparison": ComparisonProps;
  "rich-text": RichTextProps;
  "feature-cards": FeatureCardsProps;
  "quote": QuoteProps;
  "cta": CtaProps;
  "divider": DividerProps;
  "spacer": SpacerProps;
  "stats": StatsProps;
  "timeline": TimelineProps;
  "changelog": ChangelogProps;
  "screenshots-grid": ScreenshotsGridProps;
  "mascot-spot": MascotSpotProps;
  "particles-band": ParticlesBandProps;
  "embed-html": EmbedHtmlProps;
};

export type ModuleBlockType = keyof BlockKindMap;

export type BlockPropsFor<T extends ModuleBlockType> = BlockKindMap[T];

export type ModuleBlock<T extends ModuleBlockType = ModuleBlockType> = {
  id: BlockId;
  type: T;
  props: BlockKindMap[T];
  theme?: ModuleBlockTheme;
  hidden?: boolean;
};

export type AnyModuleBlock = {
  [K in ModuleBlockType]: ModuleBlock<K>;
}[ModuleBlockType];

export type PlayButtonStyle = "neon-pulse" | "solid" | "outline" | "ghost";
export type PlayButtonPosition = "bottom-right" | "bottom-center" | "center" | "top-right";

export type PlayButtonConfig = {
  label?: string;
  position?: PlayButtonPosition;
  style?: PlayButtonStyle;
  sizeScale?: number;
  glow?: boolean;
};

export type ExtendedPageTheme = {
  primary?: string;
  accent?: string;
  fontDisplay?: string;
  fontDisplayUrl?: string;
  fontBody?: string;
};

export function isBlockOfType<T extends ModuleBlockType>(
  block: AnyModuleBlock,
  type: T,
): block is Extract<AnyModuleBlock, { type: T }> {
  return block.type === type;
}

export function newBlockId(): BlockId {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
