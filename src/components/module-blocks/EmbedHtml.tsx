import type { EmbedHtmlProps } from "@/types/moduleBlocks";
import { SafeHtml } from "./_shared/SafeHtml";

export function BlockEmbedHtml(props: EmbedHtmlProps) {
  return (
    <SafeHtml
      html={props.html}
      className="prose prose-invert max-w-none rounded-2xl glass p-6 text-sm"
      style={props.height ? { minHeight: props.height } : undefined}
    />
  );
}
