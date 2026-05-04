import { motion } from "framer-motion";
import { Crown, Heart, Sparkles } from "lucide-react";
import type { SupporterTier } from "@/lib/supporterTier";
import { TIER_LABEL } from "@/lib/supporterTier";
import { cn } from "@/lib/cn";

/**
 * Avatar wrapper that adds a tier-specific decorative frame around any
 * avatar image. Three flavours, each progressively more elaborate :
 *
 *  - **Soutien** : a rotating bronze shimmer ring with a wide warm
 *    pulsing aura + heart corner badge. Reads as "thank you for your
 *    support".
 *  - **VIP** : an animated cyan→violet rotating gradient ring with a
 *    wide pulsing halo, two orbiting cyan/violet particles, and an
 *    animated crown badge. Reads as "premium tier".
 *  - **Légende** : the works. Multi-layer rainbow conic gradient ring,
 *    six floating sparkles orbiting the avatar, gold+orange shimmering
 *    border, scaled-up sparkle badge with rainbow glow. Tells everyone
 *    this user is a top-tier supporter.
 *
 * No tier (`tier === null`) renders just the avatar with a plain ring,
 * matching the existing avatar style across the launcher — no
 * decorative animation. Saves perf in dense lists and reserves the
 * "wow" effect for paid tiers.
 *
 * Usage :
 *
 *     <TierAvatar tier={user.tier} src={user.avatarUrl}
 *       displayName={user.displayName} size="md" />
 *
 * Pass `size="sm"` for chat / member-list contexts (32px), `"md"` for
 * the default in headers (40px), or `"xl"` for the public profile
 * hero (96px). The frame scales accordingly.
 */
export function TierAvatar({
  tier,
  src,
  displayName,
  size = "md",
  className,
  fallbackTone,
}: {
  tier: SupporterTier | null | undefined;
  src: string | null;
  displayName: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Extra tw classes applied to the outermost wrapper (e.g. for
   *  positioning the avatar inside a flex row). */
  className?: string;
  /** When `src` is missing, draw an initial-letter placeholder with
   *  this tone instead of the default accent gradient. Optional. */
  fallbackTone?: "accent" | "fuchsia" | "emerald" | "amber" | "muted";
}) {
  const dims = SIZE_PX[size];
  const initials = (displayName ?? "?").slice(0, 1).toUpperCase();
  const hasTier = tier === "supporter" || tier === "vip" || tier === "legend";

  // The avatar pixel — same shape regardless of tier so the inner
  // contents stay consistent.
  const avatar = (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-full",
        // The plain (no-tier) ring lives here. The tier frames below
        // visually replace it with their own animated rings.
        !hasTier && "ring-1 ring-white/10",
        fallbackTone === "fuchsia" && "bg-fuchsia-500/15 text-fuchsia-300",
        fallbackTone === "emerald" && "bg-emerald-500/15 text-emerald-300",
        fallbackTone === "amber" && "bg-amber-500/15 text-amber-300",
        fallbackTone === "muted" && "bg-bg-elevated text-fg-muted",
        (!fallbackTone || fallbackTone === "accent") && "bg-accent/15 text-accent",
      )}
      style={{ width: dims.avatar, height: dims.avatar }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="font-display"
          style={{ fontSize: Math.max(10, Math.round(dims.avatar * 0.4)) }}
        >
          {initials}
        </span>
      )}
    </div>
  );

  if (!hasTier) {
    return <div className={className}>{avatar}</div>;
  }

  return (
    <div
      className={cn("relative", className)}
      style={{ width: dims.frame, height: dims.frame }}
      title={`Supporter — ${TIER_LABEL[tier]}`}
    >
      {tier === "supporter" && <SupporterFrame size={dims} />}
      {tier === "vip" && <VipFrame size={dims} />}
      {tier === "legend" && <LegendFrame size={dims} />}

      {/* Avatar centred inside the frame with the right inset so the
          ring/glow surrounds it without bleeding through. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: dims.avatar, height: dims.avatar }}
      >
        {avatar}
      </div>

      {/* Tier badge in the bottom-right corner */}
      <TierBadge tier={tier} sizePx={dims.badge} />
    </div>
  );
}

const SIZE_PX = {
  xs: { frame: 28, avatar: 20, badge: 9, crown: 8 },
  sm: { frame: 44, avatar: 32, badge: 12, crown: 10 },
  md: { frame: 56, avatar: 40, badge: 14, crown: 11 },
  lg: { frame: 80, avatar: 60, badge: 18, crown: 14 },
  xl: { frame: 124, avatar: 96, badge: 26, crown: 18 },
} as const;

type Dims = (typeof SIZE_PX)[keyof typeof SIZE_PX];

// ─── Frames ───────────────────────────────────────────────────────────

/** Tier 1 — Soutien : rotating bronze shimmer + wide warm pulsing aura.
 *  Two animated layers (rotation 8s + aura pulse 2.6s) so the bronze
 *  band reads instantly even at small sizes. */
function SupporterFrame({ size }: { size: Dims }) {
  void size;
  return (
    <>
      {/* Wide pulsing bronze aura — extends well beyond the avatar */}
      <motion.div
        aria-hidden
        className="absolute -inset-1.5 rounded-full blur-lg"
        style={{
          background:
            "radial-gradient(circle, rgba(255,165,79,0.7) 0%, rgba(205,127,50,0.5) 40%, transparent 75%)",
        }}
        animate={{ opacity: [0.5, 1, 0.5], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Rotating bronze conic shimmer ring */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, #cd7f32 0%, #ffb75e 20%, #ffe0b3 30%, #ffb75e 40%, #cd7f32 60%, #a0571c 80%, #cd7f32 100%)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 3,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      {/* Inset bronze glow */}
      <div
        aria-hidden
        className="absolute inset-[3px] rounded-full"
        style={{
          boxShadow:
            "inset 0 0 12px rgba(205,127,50,0.6), 0 0 18px rgba(255,165,79,0.7)",
        }}
      />
    </>
  );
}

/** Tier 2 — VIP : rotating cyan→violet conic ring with wide pulsing
 *  halo + two orbiting particles. Three animation layers (rotation
 *  5s + halo pulse 2.4s + particle orbit 4s) — bold and unmistakable
 *  at any size. */
function VipFrame({ size }: { size: Dims }) {
  return (
    <>
      {/* Outer wide glow aura — saturated and pulsing */}
      <motion.div
        aria-hidden
        className="absolute -inset-2 rounded-full blur-xl"
        style={{
          background:
            "radial-gradient(circle, rgba(167,139,250,0.85) 0%, rgba(34,211,238,0.6) 40%, transparent 75%)",
        }}
        animate={{ opacity: [0.55, 1, 0.55], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Rotating thick conic gradient ring */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, #A78BFA, #22D3EE 25%, #67E8F9 40%, #A78BFA 55%, #818CF8 75%, #C4B5FD 90%, #A78BFA)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 3.5,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner saturated halo */}
      <div
        aria-hidden
        className="absolute inset-[3.5px] rounded-full"
        style={{
          boxShadow:
            "inset 0 0 14px rgba(167,139,250,0.7), 0 0 22px rgba(34,211,238,0.7)",
        }}
      />
      {/* 2 orbiting cyan/violet particles — only on md+ sizes (would
          be invisible at xs/sm). */}
      {size.frame >= 50 &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute left-1/2 top-1/2 size-1.5 rounded-full"
            style={{
              marginLeft: -3,
              marginTop: -3,
              background: i === 0 ? "#22D3EE" : "#A78BFA",
              boxShadow:
                i === 0
                  ? "0 0 8px rgba(34,211,238,1), 0 0 14px rgba(34,211,238,0.7)"
                  : "0 0 8px rgba(167,139,250,1), 0 0 14px rgba(167,139,250,0.7)",
            }}
            animate={{ rotate: 360 }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "linear",
              delay: i * 2,
            }}
          >
            <span
              className="block size-1.5 rounded-full"
              style={{
                background: i === 0 ? "#22D3EE" : "#A78BFA",
                transform: `translate(${size.frame / 2 + 3}px, 0)`,
              }}
            />
          </motion.span>
        ))}
    </>
  );
}

/** Tier 3 — Légende : the maximum effort frame. Three rotating layers
 *  + six orbiting sparkles + huge gold/orange aura. Used sparingly
 *  across the app — at most a dozen rendered at once even on the
 *  densest community page, so the perf cost stays manageable. */
function LegendFrame({ size }: { size: Dims }) {
  return (
    <>
      {/* Massive pulsing gold aura — unmistakable from any distance */}
      <motion.div
        aria-hidden
        className="absolute -inset-3 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,215,0,0.85) 0%, rgba(255,107,53,0.55) 40%, transparent 75%)",
        }}
        animate={{ opacity: [0.5, 1, 0.5], scale: [0.88, 1.15, 0.88] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Outer rotating rainbow ring — thick */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, #FF0080, #FFD700, #00FF95, #00B0FF, #B266FF, #FF0080)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 4,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner counter-rotating gold/orange ring */}
      <motion.div
        aria-hidden
        className="absolute inset-1 rounded-full"
        style={{
          background:
            "conic-gradient(from 180deg, rgba(255,215,0,1), rgba(255,107,53,0.9), rgba(255,239,140,1), rgba(255,107,53,0.9), rgba(255,215,0,1))",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 2.5,
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      {/* Powerful inset glow */}
      <div
        aria-hidden
        className="absolute inset-1 rounded-full"
        style={{
          boxShadow:
            "inset 0 0 18px rgba(255,215,0,0.7), 0 0 26px rgba(255,107,53,0.8)",
        }}
      />
      {/* 6 orbiting sparkles — rendered on sm+ sizes (xs is too tight) */}
      {size.frame >= 40 &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute left-1/2 top-1/2 size-2 rounded-full bg-amber-100"
            style={{
              marginLeft: -4,
              marginTop: -4,
              boxShadow:
                "0 0 8px rgba(255,215,0,1), 0 0 16px rgba(255,107,53,0.95)",
            }}
            animate={{
              rotate: 360,
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              rotate: {
                duration: 4.5,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.75,
              },
              opacity: {
                duration: 4.5,
                repeat: Infinity,
                times: [0, 0.15, 0.85, 1],
                delay: i * 0.75,
              },
            }}
          >
            <span
              className="block size-2 rounded-full bg-amber-100"
              style={{ transform: `translate(${size.frame / 2 + 4}px, 0)` }}
            />
          </motion.span>
        ))}
    </>
  );
}

// ─── Tier badge corner pill ──────────────────────────────────────────

function TierBadge({
  tier,
  sizePx,
}: {
  tier: SupporterTier;
  sizePx: number;
}) {
  if (tier === "supporter") {
    return (
      <motion.div
        className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full ring-2 ring-bg-base"
        style={{
          width: sizePx + 4,
          height: sizePx + 4,
          background: "linear-gradient(135deg, #cd7f32 0%, #ffb75e 100%)",
          boxShadow:
            "0 0 10px rgba(205,127,50,0.85), 0 0 4px rgba(255,165,79,0.6)",
        }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Heart
          className="text-amber-50"
          style={{ width: sizePx * 0.7, height: sizePx * 0.7 }}
          strokeWidth={2.5}
          fill="currentColor"
        />
      </motion.div>
    );
  }
  if (tier === "vip") {
    return (
      <motion.div
        className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full ring-2 ring-bg-base"
        style={{
          width: sizePx + 4,
          height: sizePx + 4,
          background:
            "linear-gradient(135deg, #A78BFA 0%, #22D3EE 100%)",
          boxShadow:
            "0 0 14px rgba(167,139,250,0.9), 0 0 6px rgba(34,211,238,0.7)",
        }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Crown
          className="text-bg-base"
          style={{ width: sizePx * 0.7, height: sizePx * 0.7 }}
          strokeWidth={2.5}
          fill="currentColor"
        />
      </motion.div>
    );
  }
  // legend
  return (
    <motion.div
      className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full ring-2 ring-bg-base"
      style={{
        width: sizePx + 6,
        height: sizePx + 6,
        background: "linear-gradient(135deg, #FFD700 0%, #FF6B35 100%)",
        boxShadow:
          "0 0 18px rgba(255,215,0,1), 0 0 8px rgba(255,107,53,0.8)",
      }}
      animate={{ rotate: [-8, 8, -8], scale: [1, 1.14, 1] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <Sparkles
        className="text-bg-base"
        style={{ width: sizePx * 0.75, height: sizePx * 0.75 }}
        strokeWidth={2.4}
      />
    </motion.div>
  );
}
