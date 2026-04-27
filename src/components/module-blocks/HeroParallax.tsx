import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { HeroParallaxProps } from "@/types/moduleBlocks";

const HEIGHT_CLASS: Record<NonNullable<HeroParallaxProps["height"]>, string> = {
  md: "h-[420px]",
  lg: "h-[560px]",
  xl: "h-[720px]",
  screen: "h-screen",
};

const OVERLAY_CLASS: Record<NonNullable<HeroParallaxProps["overlay"]>, string> = {
  none: "",
  dark: "bg-black/40",
  "gradient-bottom": "bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent",
  "gradient-radial": "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(7,9,13,0.85)_100%)]",
  vignette: "shadow-[inset_0_0_180px_60px_rgba(7,9,13,0.85)]",
};

export function BlockHeroParallax(props: HeroParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const strength = props.parallaxStrength ?? 0.4;
  const y = useTransform(scrollYProgress, [0, 1], [0, 200 * strength]);

  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden ${HEIGHT_CLASS[props.height ?? "lg"]}`}
    >
      <motion.div className="absolute inset-0" style={{ y }}>
        {props.videoUrl ? (
          <video
            src={props.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
        ) : props.bgUrl ? (
          <img src={props.bgUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--module-primary, #00d4ff) 0%, var(--module-accent, #c084fc) 100%)",
            }}
          />
        )}
      </motion.div>
      <div className={`absolute inset-0 ${OVERLAY_CLASS[props.overlay ?? "gradient-bottom"]}`} />
      <div className="relative z-10 flex h-full flex-col items-center justify-end gap-3 px-6 pb-12 text-center">
        {props.logoUrl && (
          <img src={props.logoUrl} alt="" className="max-h-24 w-auto drop-shadow-2xl" />
        )}
        {props.title && (
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-bold sm:text-6xl"
            style={{
              fontFamily: "var(--module-font-display, var(--font-display))",
              textShadow: "0 4px 24px rgba(0,0,0,0.6)",
            }}
          >
            {props.title}
          </motion.h1>
        )}
        {props.subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl text-base text-white/80 sm:text-lg"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
          >
            {props.subtitle}
          </motion.p>
        )}
      </div>
    </div>
  );
}
