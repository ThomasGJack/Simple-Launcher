import { motion } from "framer-motion";
import type { SupporterTier } from "@/lib/supporterTier";
import { TIER_LABEL } from "@/lib/supporterTier";
import { cn } from "@/lib/cn";

/**
 * Wraps a display name with tier-specific text styling :
 *
 *   - Soutien : warm bronze color, bold weight
 *   - VIP     : violet→cyan animated gradient text
 *   - Légende : rainbow shimmer with a slow conveyor-belt animation
 *
 * No tier renders the name with the default fg-primary color so it
 * fits seamlessly anywhere a plain `<span>{name}</span>` was before.
 *
 * The component intentionally does not add a separate badge pill —
 * `<TierAvatar>` already shows the corner badge, so the name is left
 * uncluttered in dense lists.
 */
export function TierName({
  tier,
  name,
  className,
  withLabel,
}: {
  tier: SupporterTier | null | undefined;
  name: string;
  className?: string;
  /** When true, append a small bracketed tier label after the name —
   *  e.g. "Goulevent [Légende]". Default false to keep dense lists
   *  clean (the avatar's badge already conveys the tier). */
  withLabel?: boolean;
}) {
  if (!tier) {
    return <span className={cn(className)}>{name}</span>;
  }
  const label = withLabel ? ` [${TIER_LABEL[tier]}]` : "";

  if (tier === "supporter") {
    return (
      <span
        className={cn("font-semibold text-amber-300", className)}
        title={`Supporter — ${TIER_LABEL.supporter}`}
      >
        {name}
        {label && <span className="ml-1 text-[10px] text-amber-400">{label}</span>}
      </span>
    );
  }

  if (tier === "vip") {
    return (
      <motion.span
        className={cn(
          "bg-clip-text font-bold text-transparent",
          className,
        )}
        style={{
          backgroundImage:
            "linear-gradient(90deg, #A78BFA, #22D3EE, #A78BFA)",
          backgroundSize: "200% 100%",
        }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        title={`Supporter — ${TIER_LABEL.vip}`}
      >
        {name}
        {label && (
          <span className="ml-1 text-[10px]" style={{ color: "#A78BFA" }}>
            {label}
          </span>
        )}
      </motion.span>
    );
  }

  // legend
  return (
    <motion.span
      className={cn(
        "bg-clip-text font-bold text-transparent",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #FFD700, #FF6B35, #FF0080, #B266FF, #00B0FF, #00FF95, #FFD700)",
        backgroundSize: "300% 100%",
        textShadow: "0 0 6px rgba(255,215,0,0.4)",
      }}
      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
      transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      title={`Supporter — ${TIER_LABEL.legend}`}
    >
      {name}
      {label && (
        <span className="ml-1 text-[10px]" style={{ color: "#FFD700" }}>
          {label}
        </span>
      )}
    </motion.span>
  );
}
