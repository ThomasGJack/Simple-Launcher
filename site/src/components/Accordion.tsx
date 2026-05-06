import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";

export type FaqItem = {
  q: string;
  a: ReactNode;
  /** Highlight visuel — pour les questions Simple Games (or). */
  highlight?: boolean;
};

export function Accordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={i}
            className={
              "overflow-hidden rounded-2xl glass transition " +
              (item.highlight
                ? "ring-1 ring-[color-mix(in_srgb,var(--color-gold)_22%,transparent)]"
                : "")
            }
          >
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <span
                className={
                  "flex-1 text-[15px] font-medium " +
                  (item.highlight ? "text-fg-primary" : "text-fg-primary")
                }
              >
                {item.highlight && <span className="mr-2 text-[var(--color-gold)]">★</span>}
                {item.q}
              </span>
              <span
                className={
                  "shrink-0 " + (item.highlight ? "text-[var(--color-gold)]" : "text-accent")
                }
              >
                {isOpen ? <Minus className="size-5" /> : <Plus className="size-5" />}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 text-sm leading-relaxed text-fg-muted">
                    {item.a}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
