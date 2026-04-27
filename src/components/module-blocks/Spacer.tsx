import type { SpacerProps } from "@/types/moduleBlocks";

const SIZE: Record<NonNullable<SpacerProps["size"]>, number> = {
  sm: 16,
  md: 32,
  lg: 64,
  xl: 128,
};

export function BlockSpacer(props: SpacerProps) {
  return <div aria-hidden style={{ height: SIZE[props.size ?? "md"] }} />;
}
