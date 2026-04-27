import type {
  CarouselSlide,
  LauncherModule,
  ModulePage,
  ModulePageV1,
  ModulePageV2,
  PageSection,
} from "../types/module";
import { isModulePageV2 } from "../types/module";
import {
  type AnyModuleBlock,
  type ExtendedPageTheme,
  type PlayButtonConfig,
  newBlockId,
} from "../types/moduleBlocks";

const EMPTY_V2: ModulePageV2 = { version: 2, blocks: [] };

export function migrateModulePage(
  raw: ModulePage | undefined | null,
  module?: LauncherModule,
): ModulePageV2 {
  if (!raw) return { ...EMPTY_V2 };
  if (isModulePageV2(raw)) return raw;
  try {
    return convertV1(raw, module);
  } catch (err) {
    console.warn("[modulePageMigration] V1 parse failed, falling back to empty V2", err);
    return { ...EMPTY_V2 };
  }
}

function convertV1(v1: ModulePageV1, module?: LauncherModule): ModulePageV2 {
  const blocks: AnyModuleBlock[] = [];

  if (v1.hero && (v1.hero.title || v1.hero.subtitle || v1.hero.logoUrl)) {
    blocks.push({
      id: newBlockId(),
      type: "hero-parallax",
      props: {
        bgUrl: module?.bannerUrl,
        title: v1.hero.title,
        subtitle: v1.hero.subtitle,
        logoUrl: v1.hero.logoUrl,
        height: "lg",
        overlay: "gradient-bottom",
        parallaxStrength: 0.4,
      },
    });
  }

  for (const section of v1.sections ?? []) {
    const block = sectionToBlock(section);
    if (block) blocks.push(block);
  }

  const theme: ExtendedPageTheme | undefined = v1.theme
    ? {
        primary: v1.theme.primary,
        accent: v1.theme.accent,
        fontDisplay: v1.theme.fontDisplay,
      }
    : undefined;

  const playButton: PlayButtonConfig | undefined = v1.playButton
    ? {
        label: v1.playButton.label,
        position: v1.playButton.position,
        style: v1.playButton.style,
      }
    : undefined;

  return {
    version: 2,
    background: v1.background,
    theme,
    playButton,
    blocks,
  };
}

function sectionToBlock(section: PageSection): AnyModuleBlock | null {
  switch (section.type) {
    case "carousel":
      return {
        id: newBlockId(),
        type: "carousel",
        props: {
          slides: section.slides as CarouselSlide[],
          interval: section.interval,
          transition: section.slides[0]?.animation,
          aspect: "16/9",
          autoplay: true,
          controls: "both",
        },
      };
    case "changelog":
      return {
        id: newBlockId(),
        type: "changelog",
        props: {
          entries: section.entries,
          source: "manual",
        },
      };
    case "screenshots-grid":
      return {
        id: newBlockId(),
        type: "screenshots-grid",
        props: { images: section.images, columns: 3 },
      };
    case "stats":
      return {
        id: newBlockId(),
        type: "stats",
        props: {
          items: section.data.map((d) => ({ label: d.label, value: d.value })),
          columns: Math.min(4, Math.max(2, section.data.length)) as 2 | 3 | 4,
          style: "glass",
          animateOnView: true,
        },
      };
    case "custom-html":
      return {
        id: newBlockId(),
        type: "embed-html",
        props: { html: section.content },
      };
    default:
      return null;
  }
}
