import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/cn";
import type { StatsProps } from "@/types/moduleBlocks";

const COLS: Record<NonNullable<StatsProps["columns"]>, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

function parseNumeric(value: string): { num: number; suffix: string } | null {
  const match = value.match(/^(-?\d[\d\s,.]*)(.*)$/);
  if (!match) return null;
  const cleaned = match[1].replace(/[\s,]/g, "");
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return { num, suffix: match[2] };
}

function CountUp({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  const display = Number.isInteger(to) ? Math.round(n).toLocaleString("fr-FR") : n.toFixed(1);
  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

export function BlockStats(props: StatsProps) {
  const cols = COLS[props.columns ?? 3];
  const style = props.style ?? "glass";
  const animate = props.animateOnView !== false;

  return (
    <div className={cn("grid gap-3", cols)}>
      {props.items.map((item, i) => {
        const numeric = animate ? parseNumeric(item.value) : null;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              "rounded-2xl p-5 text-center",
              style === "glass" && "glass",
              style === "neon" && "ring-1 ring-white/10",
              style === "minimal" && "border-b border-white/10",
            )}
            style={
              style === "neon"
                ? {
                    boxShadow:
                      "0 0 24px color-mix(in srgb, var(--module-primary, var(--color-accent)) 30%, transparent)",
                  }
                : undefined
            }
          >
            <div
              className="text-3xl font-bold sm:text-4xl"
              style={{
                color: item.accent ?? "var(--module-primary, var(--color-accent))",
                fontFamily: "var(--module-font-display, var(--font-display))",
              }}
            >
              {numeric ? <CountUp to={numeric.num} suffix={numeric.suffix + (item.suffix ?? "")} /> : `${item.value}${item.suffix ?? ""}`}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-fg-muted">{item.label}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
