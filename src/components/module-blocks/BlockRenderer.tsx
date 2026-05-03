import { Suspense, lazy, memo } from "react";
import type { LauncherModule } from "@/types/module";
import type { AnyModuleBlock } from "@/types/moduleBlocks";
import { BlockShell } from "./BlockShell";

// ─── Eager (tiny, frequently-rendered) ─────────────────────────────
//
// Blocks kept inline in the main bundle because they are :
//   - Trivial (Divider, Spacer = 1-2 elements + CSS)
//   - Almost always present (Cta — used as the bottom-of-page launch
//     button on most modules, kept eager so the launch UX never has a
//     Suspense fallback flash)
//   - Static layout (Poster — pure <img> + caption, no animation)
import { BlockDivider } from "./Divider";
import { BlockSpacer } from "./Spacer";
import { BlockCta } from "./Cta";
import { BlockPoster } from "./Poster";

// ─── Lazy (everything else) ────────────────────────────────────────
//
// Each block becomes its own chunk. First paint of a module page only
// loads the chunks for blocks actually present on it, instead of the
// previous monolithic ~612 KB BlockRenderer chunk that bundled all 19
// types eagerly.
//
// The Suspense boundary is in `BlockRenderer` below, fallback is null
// (blocks are usually inside a vertical scroll list — a flash of empty
// space is less disruptive than a spinner per block).
const BlockHeroParallaxLazy = lazy(() =>
  import("./HeroParallax").then((m) => ({ default: m.BlockHeroParallax })),
);
const BlockRichTextLazy = lazy(() =>
  import("./RichText").then((m) => ({ default: m.BlockRichText })),
);
const BlockFeatureCardsLazy = lazy(() =>
  import("./FeatureCards").then((m) => ({ default: m.BlockFeatureCards })),
);
const BlockQuoteLazy = lazy(() =>
  import("./Quote").then((m) => ({ default: m.BlockQuote })),
);
const BlockStatsLazy = lazy(() =>
  import("./Stats").then((m) => ({ default: m.BlockStats })),
);
const BlockTimelineLazy = lazy(() =>
  import("./Timeline").then((m) => ({ default: m.BlockTimeline })),
);
const BlockChangelogLazy = lazy(() =>
  import("./Changelog").then((m) => ({ default: m.BlockChangelog })),
);
const BlockScreenshotsGridLazy = lazy(() =>
  import("./ScreenshotsGrid").then((m) => ({ default: m.BlockScreenshotsGrid })),
);
const BlockMascotSpotLazy = lazy(() =>
  import("./MascotSpot").then((m) => ({ default: m.BlockMascotSpot })),
);
const BlockGalleryLazy = lazy(() =>
  import("./Gallery").then((m) => ({ default: m.BlockGallery })),
);
const BlockCarouselLazy = lazy(() =>
  import("./Carousel").then((m) => ({ default: m.BlockCarousel })),
);
const BlockVideoEmbedLazy = lazy(() =>
  import("./VideoEmbed").then((m) => ({ default: m.BlockVideoEmbed })),
);
const BlockComparisonLazy = lazy(() =>
  import("./Comparison").then((m) => ({ default: m.BlockComparison })),
);
const BlockParticlesBandLazy = lazy(() =>
  import("./ParticlesBand").then((m) => ({ default: m.BlockParticlesBand })),
);
const BlockEmbedHtmlLazy = lazy(() =>
  import("./EmbedHtml").then((m) => ({ default: m.BlockEmbedHtml })),
);

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
      return <BlockHeroParallaxLazy {...block.props} />;
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
      return <BlockRichTextLazy {...block.props} />;
    case "feature-cards":
      return <BlockFeatureCardsLazy {...block.props} />;
    case "quote":
      return <BlockQuoteLazy {...block.props} />;
    case "cta":
      return <BlockCta {...block.props} module={module} onLaunch={onLaunch} />;
    case "divider":
      return <BlockDivider {...block.props} />;
    case "spacer":
      return <BlockSpacer {...block.props} />;
    case "stats":
      return <BlockStatsLazy {...block.props} />;
    case "timeline":
      return <BlockTimelineLazy {...block.props} />;
    case "changelog":
      return <BlockChangelogLazy {...block.props} moduleId={module?.id} />;
    case "screenshots-grid":
      return <BlockScreenshotsGridLazy {...block.props} />;
    case "mascot-spot":
      return <BlockMascotSpotLazy {...block.props} />;
    case "particles-band":
      return <BlockParticlesBandLazy {...block.props} />;
    case "embed-html":
      return <BlockEmbedHtmlLazy {...block.props} />;
    default:
      return null;
  }
}
