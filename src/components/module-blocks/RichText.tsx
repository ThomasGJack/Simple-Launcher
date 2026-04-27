import { useMemo } from "react";
import { motion } from "framer-motion";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { cn } from "@/lib/cn";
import type { RichTextProps } from "@/types/moduleBlocks";

const PROSE: Record<NonNullable<RichTextProps["prose"]>, string> = {
  compact: "prose-sm leading-relaxed",
  default: "prose-base leading-relaxed",
  relaxed: "prose-lg leading-loose",
};

export function BlockRichText(props: RichTextProps) {
  const html = useMemo(() => sanitizeHtml(marked.parse(props.markdown ?? "", { async: false }) as string), [props.markdown]);
  const align = props.align ?? "left";
  const animation = props.appearAnimation ?? "fade-up";

  const motionProps =
    animation === "none"
      ? {}
      : animation === "fade"
        ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true } }
        : animation === "fade-up"
          ? {
              initial: { opacity: 0, y: 16 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true },
            }
          : {
              initial: { opacity: 0 },
              whileInView: { opacity: 1 },
              viewport: { once: true },
            };

  return (
    <motion.div
      {...motionProps}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "prose prose-invert max-w-none",
        PROSE[props.prose ?? "default"],
        align === "center" && "text-center",
        align === "right" && "text-right",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
