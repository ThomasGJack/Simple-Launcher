import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CarouselProps } from "@/types/moduleBlocks";

const ASPECT: Record<NonNullable<CarouselProps["aspect"]>, string> = {
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
  "4/3": "aspect-[4/3]",
};

export function BlockCarousel(props: CarouselProps) {
  const [index, setIndex] = useState(0);
  const slides = props.slides ?? [];
  const interval = props.interval ?? 5000;
  const autoplay = props.autoplay !== false;
  const controls = props.controls ?? "both";

  useEffect(() => {
    if (!autoplay || slides.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(t);
  }, [slides.length, interval, autoplay]);

  if (slides.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-white/10", ASPECT[props.aspect ?? "16/9"])}>
        <div className="flex size-full items-center justify-center text-sm text-fg-muted">
          Aucune diapositive.
        </div>
      </div>
    );
  }

  const slide = slides[index];
  const transition = props.transition ?? slide.animation ?? "fade";
  const next = () => setIndex((i) => (i + 1) % slides.length);
  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl ring-1 ring-white/[0.06]", ASPECT[props.aspect ?? "16/9"])}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={transition === "fade" ? { opacity: 0 } : { x: "100%", opacity: 0 }}
          animate={
            transition === "ken-burns"
              ? { opacity: 1, scale: 1.08 }
              : { opacity: 1, x: 0 }
          }
          exit={transition === "fade" ? { opacity: 0 } : { x: "-30%", opacity: 0 }}
          transition={
            transition === "ken-burns"
              ? { duration: interval / 1000, ease: "linear" }
              : { duration: 0.6 }
          }
          className="absolute inset-0"
        >
          {slide.video ? (
            <video src={slide.video} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
          ) : slide.image ? (
            <img src={slide.image} alt="" className="absolute inset-0 size-full object-cover" />
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
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg-base/90 to-transparent" />
      {(slide.title || slide.subtitle) && (
        <div className="absolute inset-x-0 bottom-0 p-6">
          {slide.title && (
            <h3
              className="text-2xl sm:text-3xl"
              style={{ fontFamily: "var(--module-font-display, var(--font-display))" }}
            >
              {slide.title}
            </h3>
          )}
          {slide.subtitle && <p className="mt-1 text-sm text-fg-muted">{slide.subtitle}</p>}
        </div>
      )}

      {(controls === "arrows" || controls === "both") && slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full glass p-2"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full glass p-2"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
      {(controls === "dots" || controls === "both") && slides.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 24 : 6,
                background:
                  i === index ? "var(--module-primary, var(--color-accent))" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
