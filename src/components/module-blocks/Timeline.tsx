import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { TimelineProps } from "@/types/moduleBlocks";

export function BlockTimeline(props: TimelineProps) {
  const orientation = props.orientation ?? "vertical";
  if (props.entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-fg-muted">
        Ajoute des entrées dans l'inspecteur.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="absolute inset-y-0 w-px"
        style={{
          left: orientation === "alternating" ? "50%" : "16px",
          background:
            "linear-gradient(180deg, transparent 0%, var(--module-primary, var(--color-accent)) 30%, var(--module-primary, var(--color-accent)) 70%, transparent 100%)",
        }}
      />
      <div className="space-y-8">
        {props.entries.map((entry, i) => {
          const right = orientation === "alternating" && i % 2 === 1;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: right ? 24 : -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className={cn(
                "relative",
                orientation === "alternating"
                  ? "grid grid-cols-2 gap-8"
                  : "pl-10",
              )}
            >
              <div
                className="absolute size-3 rounded-full"
                style={{
                  left: orientation === "alternating" ? "calc(50% - 6px)" : "10px",
                  top: 8,
                  background: "var(--module-primary, var(--color-accent))",
                  boxShadow: "0 0 14px var(--module-primary, var(--color-accent-glow))",
                }}
              />
              <div className={cn(right ? "col-start-2 pl-8" : "pr-8", orientation !== "alternating" && "col-span-1")}>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--module-accent, var(--color-accent))" }}>
                  {entry.date}
                </div>
                <h4
                  className="mt-1 text-lg font-semibold"
                  style={{ fontFamily: "var(--module-font-display, var(--font-display))" }}
                >
                  {entry.title}
                </h4>
                {entry.description && <p className="mt-1 text-sm text-fg-muted">{entry.description}</p>}
                {entry.image && (
                  <img src={entry.image} alt="" className="mt-3 max-h-48 rounded-xl object-cover ring-1 ring-white/10" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
