import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { ModuleBlockTheme, BlockMaxWidth, BlockPaddingY } from "@/types/moduleBlocks";

type Props = {
  theme?: ModuleBlockTheme;
  className?: string;
  fullBleed?: boolean;
  children: React.ReactNode;
};

const PADDING: Record<BlockPaddingY, string> = {
  none: "py-0",
  sm: "py-4",
  md: "py-8",
  lg: "py-14",
  xl: "py-24",
};

const MAX_WIDTH: Record<BlockMaxWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

const BG_CLASS: Record<NonNullable<ModuleBlockTheme["bg"]>, string> = {
  transparent: "",
  glass: "glass rounded-3xl",
  "glass-strong": "glass-strong rounded-3xl",
  solid: "rounded-3xl",
};

export function BlockShell({ theme, className, fullBleed, children }: Props) {
  const padding = PADDING[theme?.paddingY ?? "md"];
  const maxWidth = MAX_WIDTH[theme?.maxWidth ?? "default"];
  const bg = BG_CLASS[theme?.bg ?? "transparent"];
  const align = theme?.align ?? "left";

  const localStyle: React.CSSProperties & Record<string, string | number | undefined> = {};
  if (theme?.primary) localStyle["--module-primary"] = theme.primary;
  if (theme?.accent) localStyle["--module-accent"] = theme.accent;
  if (theme?.bg === "solid" && theme.bgColor) localStyle.backgroundColor = theme.bgColor;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn("w-full", padding, fullBleed ? "" : "px-4 sm:px-6", className)}
      style={localStyle}
    >
      <div
        className={cn(
          "mx-auto",
          fullBleed ? "max-w-none" : maxWidth,
          bg,
          theme?.bg && theme.bg !== "transparent" ? "px-6 py-8" : "",
          align === "center" && "text-center",
          align === "right" && "text-right",
        )}
      >
        {children}
      </div>
    </motion.section>
  );
}
