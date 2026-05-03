import { motion } from "framer-motion";
import { DynamicIcon } from "lucide-react/dynamic";
import { cn } from "@/lib/cn";
import type { FeatureCardsProps } from "@/types/moduleBlocks";

const COLS: Record<NonNullable<FeatureCardsProps["columns"]>, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
};

/**
 * Lucide DynamicIcon takes the kebab-case icon name (e.g. "sparkles",
 * "zap"), but our config historically stores the PascalCase React
 * component name ("Sparkles", "Zap") as set by IconPicker. Convert here
 * so legacy data keeps working with the lazy-loading path.
 */
function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function BlockFeatureCards(props: FeatureCardsProps) {
  const cols = COLS[props.columns ?? 3];
  const iconStyle = props.iconStyle ?? "neon";

  return (
    <div className={cn("grid gap-4", cols)}>
      {props.cards.map((card, i) => {
        const iconName = card.icon ? pascalToKebab(card.icon) : null;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: i * 0.06, duration: 0.5 }}
            className="rounded-2xl glass p-5 transition-shadow hover:shadow-[0_0_28px_var(--module-primary,var(--color-accent-soft))]"
          >
            {iconName && (
              <div
                className={cn(
                  "mb-3 inline-flex size-10 items-center justify-center rounded-xl",
                  iconStyle === "filled" && "ring-1 ring-white/10",
                  iconStyle === "neon" && "ring-1 ring-white/10",
                  iconStyle === "outline" && "ring-1 ring-white/15",
                )}
                style={{
                  color: card.accent ?? "var(--module-primary, var(--color-accent))",
                  background:
                    iconStyle === "filled"
                      ? "color-mix(in srgb, var(--module-primary, var(--color-accent)) 18%, transparent)"
                      : "transparent",
                  boxShadow:
                    iconStyle === "neon"
                      ? "0 0 18px var(--module-primary, var(--color-accent-soft))"
                      : undefined,
                }}
              >
                <DynamicIcon name={iconName as never} className="size-5" />
              </div>
            )}
            <h3
              className="mb-1 text-base font-semibold"
              style={{ fontFamily: "var(--module-font-display, var(--font-display))" }}
            >
              {card.title}
            </h3>
            {card.description && <p className="text-sm text-fg-muted">{card.description}</p>}
          </motion.div>
        );
      })}
    </div>
  );
}
