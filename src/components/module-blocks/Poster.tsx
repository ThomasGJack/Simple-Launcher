import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { PosterProps } from "@/types/moduleBlocks";

const ASPECT_CLASS: Record<NonNullable<PosterProps["aspect"]>, string> = {
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
  "4/5": "aspect-[4/5]",
  "1/1": "aspect-square",
  "3/4": "aspect-[3/4]",
};

const FRAME_CLASS: Record<NonNullable<PosterProps["frame"]>, string> = {
  none: "",
  glass: "ring-1 ring-white/10 rounded-3xl",
  "neon-glow": "ring-1 rounded-3xl",
};

export function BlockPoster(props: PosterProps) {
  const aspect = ASPECT_CLASS[props.aspect ?? "16/9"];
  const frame = FRAME_CLASS[props.frame ?? "none"];
  const glow = props.frame === "neon-glow";

  return (
    <figure className="space-y-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.4 }}
        className={cn("relative overflow-hidden", aspect, frame)}
        style={
          glow
            ? {
                boxShadow:
                  "0 0 64px 0 var(--module-primary, var(--color-accent-glow)), 0 0 0 1px var(--module-primary, var(--color-accent-soft))",
              }
            : undefined
        }
      >
        {props.imageUrl ? (
          <motion.img
            src={props.imageUrl}
            alt={props.caption ?? ""}
            className="size-full object-cover"
            initial={props.kenBurns ? { scale: 1 } : undefined}
            animate={props.kenBurns ? { scale: 1.08 } : undefined}
            transition={props.kenBurns ? { duration: 14, repeat: Infinity, repeatType: "reverse" } : undefined}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-bg-elevated text-fg-muted">
            <span className="text-sm">Aucune image</span>
          </div>
        )}
      </motion.div>
      {props.caption && (
        <figcaption className="text-center text-sm text-fg-muted">{props.caption}</figcaption>
      )}
    </figure>
  );
}
