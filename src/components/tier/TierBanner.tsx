import { motion } from "framer-motion";
import type { SupporterTier } from "@/lib/supporterTier";

/**
 * Renders absolute-positioned decorative overlays inside a `relative`
 * parent to mark the row/card as belonging to a tiered supporter. The
 * parent stays in control of its own background/padding/layout — this
 * component only adds tier-specific border + glow effects on top.
 *
 * Visual hierarchy :
 *  - Soutien : warm bronze static border + soft pulsing aura
 *  - VIP     : cyan→violet animated gradient border + saturated glow
 *  - Légende : rainbow conveyor-belt border + multi-color halo
 *
 * For non-tier users the component renders `null` so it's free to
 * sprinkle conditionally without checking outside.
 *
 * Usage :
 *   <motion.div className="relative ... rounded-2xl ...">
 *     <TierBannerOverlay tier={user.tier} rounded="2xl" />
 *     {actualContent}
 *   </motion.div>
 *
 * The parent must be `position: relative` and have matching corner
 * radius for the borders to align cleanly. Children of the parent
 * render *after* the overlay in source order so they paint on top
 * naturally, no z-index needed.
 */
export function TierBannerOverlay({
  tier,
  rounded = "2xl",
}: {
  tier: SupporterTier | null | undefined;
  rounded?: "lg" | "xl" | "2xl" | "3xl" | "full";
}) {
  if (!tier) return null;

  const radiusClass =
    rounded === "lg"
      ? "rounded-lg"
      : rounded === "xl"
        ? "rounded-xl"
        : rounded === "2xl"
          ? "rounded-2xl"
          : rounded === "3xl"
            ? "rounded-3xl"
            : "rounded-full";

  if (tier === "supporter") {
    return (
      <>
        {/* Bronze gradient border via padding-mask trick */}
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{
            background:
              "linear-gradient(135deg, #cd7f32 0%, #ffb75e 40%, #ffe0b3 50%, #ffb75e 60%, #cd7f32 100%)",
            backgroundSize: "200% 100%",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: 1.5,
          }}
          animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        {/* Pulsing bronze aura */}
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{
            boxShadow:
              "0 0 24px rgba(205,127,50,0.4), 0 0 12px rgba(255,165,79,0.35)",
          }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Bronze accent stripe on the left edge */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-3/4 w-[3px] -translate-y-1/2 rounded-r-full blur-[1px]"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, #ffb75e 35%, #ffd9a3 50%, #ffb75e 65%, transparent 100%)",
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </>
    );
  }

  if (tier === "vip") {
    return (
      <>
        {/* Animated cyan/violet gradient border — conveyor belt */}
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{
            background:
              "linear-gradient(90deg, #A78BFA 0%, #22D3EE 30%, #67E8F9 50%, #A78BFA 70%, #818CF8 100%)",
            backgroundSize: "200% 100%",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: 1.5,
          }}
          animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        {/* Saturated outer glow */}
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{
            boxShadow:
              "0 0 32px rgba(167,139,250,0.45), 0 0 14px rgba(34,211,238,0.4)",
          }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Cyan accent stripe on the left edge */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-4/5 w-[3px] -translate-y-1/2 rounded-r-full blur-[1px]"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, #22D3EE 30%, #A78BFA 50%, #22D3EE 70%, transparent 100%)",
          }}
          animate={{ opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </>
    );
  }

  // legend
  return (
    <>
      {/* Animated rainbow border — conveyor belt */}
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${radiusClass}`}
        style={{
          background:
            "linear-gradient(90deg, #FF0080, #FFD700, #00FF95, #00B0FF, #B266FF, #FFD700, #FF0080)",
          backgroundSize: "200% 100%",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 2,
        }}
        animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      {/* Multi-color massive aura */}
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${radiusClass}`}
        style={{
          boxShadow:
            "0 0 40px rgba(255,215,0,0.45), 0 0 20px rgba(255,107,53,0.35), 0 0 60px rgba(178,102,255,0.3)",
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Inner subtle gold tint overlay */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${radiusClass}`}
        style={{
          background:
            "linear-gradient(135deg, rgba(255,215,0,0.05) 0%, transparent 40%, transparent 60%, rgba(178,102,255,0.05) 100%)",
        }}
      />
      {/* Gold accent stripe on the left edge */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 h-full w-[4px] -translate-y-1/2 rounded-r-full blur-[1.5px]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, #FFD700 25%, #FF6B35 50%, #FFD700 75%, transparent 100%)",
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}
