import type { ScreenshotsGridProps } from "@/types/moduleBlocks";
import { BlockGallery } from "./Gallery";

export function BlockScreenshotsGrid(props: ScreenshotsGridProps) {
  return (
    <BlockGallery
      images={props.images.map((url) => ({ url }))}
      layout="grid"
      columns={props.columns ?? 3}
      lightbox
    />
  );
}
