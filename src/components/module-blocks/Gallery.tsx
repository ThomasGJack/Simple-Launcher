import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { GalleryProps } from "@/types/moduleBlocks";

const COLS: Record<NonNullable<GalleryProps["columns"]>, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
};

export function BlockGallery(props: GalleryProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const layout = props.layout ?? "grid";
  const lightbox = props.lightbox !== false;
  const cols = COLS[props.columns ?? 3];

  if (props.images.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-fg-muted">
        Aucune image dans la galerie.
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "gap-3",
          layout === "masonry" ? "columns-2 sm:columns-3" : "grid",
          layout === "masonry" ? "" : cols,
        )}
      >
        {props.images.map((img, i) => (
          <motion.button
            key={img.url + i}
            type="button"
            whileHover={{ scale: 1.02 }}
            onClick={() => lightbox && setOpenIdx(i)}
            className={cn(
              "group relative block overflow-hidden rounded-xl ring-1 ring-white/[0.06] transition",
              "hover:shadow-[0_0_24px_var(--module-primary,var(--color-accent-soft))]",
              layout === "masonry" ? "mb-3 break-inside-avoid" : "aspect-video w-full",
            )}
          >
            <img
              src={img.url}
              alt={img.caption ?? ""}
              className={cn(
                "w-full object-cover transition-transform duration-700 group-hover:scale-105",
                layout === "masonry" ? "h-auto" : "size-full",
              )}
            />
            {img.caption && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-left text-xs text-white opacity-0 transition group-hover:opacity-100">
                {img.caption}
              </div>
            )}
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {openIdx !== null && (
          <Lightbox
            images={props.images}
            startIndex={openIdx}
            onClose={() => setOpenIdx(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: GalleryProps["images"];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const img = images[idx];
  const next = () => setIdx((i) => (i + 1) % images.length);
  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 rounded-full glass p-2 text-fg-primary"
      >
        <X className="size-5" />
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-4 rounded-full glass p-3"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-4 rounded-full glass p-3"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}
      <motion.img
        key={img.url}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        src={img.url}
        alt={img.caption ?? ""}
        className="max-h-[88vh] max-w-[88vw] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {img.caption && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full glass px-4 py-2 text-sm text-fg-primary">
          {img.caption}
        </div>
      )}
    </motion.div>
  );
}
