import { Suspense, lazy, memo } from "react";
import type { LauncherModule } from "@/types/module";
import type { AnyModuleBlock } from "@/types/moduleBlocks";
import { BlockShell } from "./BlockShell";

import { BlockHeroParallax } from "./HeroParallax";
import { BlockPoster } from "./Poster";
import { BlockRichText } from "./RichText";
import { BlockFeatureCards } from "./FeatureCards";
import { BlockQuote } from "./Quote";
import { BlockCta } from "./Cta";
import { BlockDivider } from "./Divider";
import { BlockSpacer } from "./Spacer";
import { BlockStats } from "./Stats";
import { BlockTimeline } from "./Timeline";
import { BlockChangelog } from "./Changelog";
import { BlockScreenshotsGrid } from "./ScreenshotsGrid";
import { BlockMascotSpot } from "./MascotSpot";

const BlockGalleryLazy = lazy(() => import("./Gallery").then((m) => ({ default: m.BlockGallery })));
const BlockCarouselLazy = lazy(() => import("./Carousel").then((m) => ({ default: m.BlockCarousel })));
const BlockVideoEmbedLazy = lazy(() => import("./VideoEmbed").then((m) => ({ default: m.BlockVideoEmbed })));
const BlockComparisonLazy = lazy(() => import("./Comparison").then((m) => ({ default: m.BlockComparison })));
const BlockParticlesBandLazy = lazy(() => import("./ParticlesBand").then((m) => ({ default: m.BlockParticlesBand })));
const BlockEmbedHtmlLazy = lazy(() => import("./EmbedHtml").then((m) => ({ default: m.BlockEmbedHtml })));

type Props = {
  blocks: AnyModuleBlock[];
  module?: LauncherModule;
  onLaunch?: () => void;
};

export function BlockRenderer({ blocks, module, onLaunch }: Props) {
  if (!blocks || blocks.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <div className="space-y-2">
        {blocks.map((block) => (
          <SingleBlock key={block.id} block={block} module={module} onLaunch={onLaunch} />
        ))}
      </div>
    </Suspense>
  );
}

const SingleBlock = memo(function SingleBlock({
  block,
  module,
  onLaunch,
}: {
  block: AnyModuleBlock;
  module?: LauncherModule;
  onLaunch?: () => void;
}) {
  if (block.hidden) return null;

  const isFullBleed = block.type === "hero-parallax" || block.type === "particles-band";

  return (
    <BlockShell theme={block.theme} fullBleed={isFullBleed}>
      <BlockBody block={block} module={module} onLaunch={onLaunch} />
    </BlockShell>
  );
});

function BlockBody({
  block,
  module,
  onLaunch,
}: {
  block: AnyModuleBlock;
  module?: LauncherModule;
  onLaunch?: () => void;
}) {
  switch (block.type) {
    case "hero-parallax":
      return <BlockHeroParallax {...block.props} />;
    case "poster":
      return <BlockPoster {...block.props} />;
    case "gallery":
      return <BlockGalleryLazy {...block.props} />;
    case "carousel":
      return <BlockCarouselLazy {...block.props} />;
    case "video-embed":
      return <BlockVideoEmbedLazy {...block.props} />;
    case "comparison":
      return <BlockComparisonLazy {...block.props} />;
    case "rich-text":
      return <BlockRichText {...block.props} />;
    case "feature-cards":
      return <BlockFeatureCards {...block.props} />;
    case "quote":
      return <BlockQuote {...block.props} />;
    case "cta":
      return <BlockCta {...block.props} module={module} onLaunch={onLaunch} />;
    case "divider":
      return <BlockDivider {...block.props} />;
    case "spacer":
      return <BlockSpacer {...block.props} />;
    case "stats":
      return <BlockStats {...block.props} />;
    case "timeline":
      return <BlockTimeline {...block.props} />;
    case "changelog":
      return <BlockChangelog {...block.props} moduleId={module?.id} />;
    case "screenshots-grid":
      return <BlockScreenshotsGrid {...block.props} />;
    case "mascot-spot":
      return <BlockMascotSpot {...block.props} />;
    case "particles-band":
      return <BlockParticlesBandLazy {...block.props} />;
    case "embed-html":
      return <BlockEmbedHtmlLazy {...block.props} />;
    default:
      return null;
  }
}
