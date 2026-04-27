import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Reusable "empty state" presenting a friendly Glitch illustration plus a
 * title + body + optional CTA. Replaces the dozens of plain
 * "Aucun(e) X. Crée le premier." card-with-icon snippets scattered through
 * the app — gives them a coherent, branded look.
 *
 * Variants pick a different mascot pose to match context:
 *  - `library`  : Glitch holding a controller, "no games yet"
 *  - `friends`  : Glitch with a chat bubble, "no friends online"
 *  - `messages` : Glitch with envelope, "no conversations"
 *  - `error`    : Glitch confused, generic empty fallback
 *  - `search`   : Glitch with magnifying glass, "no results"
 */
export type EmptyVariant = "library" | "friends" | "messages" | "error" | "search";

export function EmptyState({
  variant = "error",
  title,
  description,
  cta,
}: {
  variant?: EmptyVariant;
  title: string;
  description?: string;
  cta?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid place-items-center rounded-3xl glass p-8 text-center"
    >
      <GlitchIllustration variant={variant} />
      <h3 className="mt-4 font-display text-xl text-fg-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </motion.div>
  );
}

/**
 * Custom SVG of Glitch the penguin holding a context-dependent prop. Pure
 * vector — no asset to bundle. Cyan/violet body, yellow cape (from the
 * project mascot brand).
 */
function GlitchIllustration({ variant }: { variant: EmptyVariant }) {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      className="relative grid size-24 place-items-center"
    >
      {/* Glow halo behind the mascot */}
      <div className="absolute inset-0 rounded-full bg-accent/15 blur-2xl" />
      <svg
        viewBox="0 0 96 96"
        className="relative size-24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Body — rounded penguin silhouette in dark cyan */}
        <ellipse cx="48" cy="58" rx="22" ry="26" fill="#0d2236" stroke="#00d4ff" strokeOpacity="0.4" strokeWidth="1.5" />
        {/* Belly */}
        <ellipse cx="48" cy="64" rx="14" ry="18" fill="#1a3554" />
        {/* Hood top — yellow */}
        <path
          d="M 26 38 Q 28 28 36 26 L 60 26 Q 68 28 70 38 Q 70 42 65 44 L 31 44 Q 26 42 26 38 Z"
          fill="#fbbf24"
          stroke="#f59e0b"
          strokeWidth="1.2"
        />
        {/* Hood string accents */}
        <line x1="34" y1="42" x2="33" y2="50" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="62" y1="42" x2="63" y2="50" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
        {/* Eyes — cyan glowing */}
        <circle cx="40" cy="48" r="2.5" fill="#00d4ff">
          <animate attributeName="r" values="2.5;2.7;2.5" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="56" cy="48" r="2.5" fill="#00d4ff">
          <animate attributeName="r" values="2.5;2.7;2.5" dur="3s" repeatCount="indefinite" />
        </circle>
        {/* Beak */}
        <path d="M 44 54 L 52 54 L 48 58 Z" fill="#f59e0b" />
        {/* Variant-specific prop */}
        <VariantProp variant={variant} />
      </svg>
    </motion.div>
  );
}

function VariantProp({ variant }: { variant: EmptyVariant }) {
  switch (variant) {
    case "library":
      // Tiny game controller in front
      return (
        <g transform="translate(28 70)">
          <rect x="0" y="0" width="40" height="14" rx="6" fill="#1f2937" stroke="#00d4ff" strokeWidth="1.2" />
          <circle cx="9" cy="7" r="2" fill="#00d4ff" />
          <circle cx="31" cy="7" r="2" fill="#fbbf24" />
        </g>
      );
    case "messages":
      // Floating envelope
      return (
        <g transform="translate(60 18)">
          <rect x="0" y="0" width="22" height="14" rx="2" fill="#1a3554" stroke="#00d4ff" strokeWidth="1.2" />
          <path d="M 1 1 L 11 9 L 21 1" stroke="#00d4ff" strokeWidth="1.2" fill="none" />
        </g>
      );
    case "friends":
      // Speech bubble with dots
      return (
        <g transform="translate(64 14)">
          <path
            d="M 0 6 Q 0 0 6 0 L 18 0 Q 24 0 24 6 L 24 12 Q 24 18 18 18 L 12 18 L 8 22 L 8 18 L 6 18 Q 0 18 0 12 Z"
            fill="#1a3554"
            stroke="#00d4ff"
            strokeWidth="1.2"
          />
          <circle cx="7" cy="9" r="1.2" fill="#00d4ff" />
          <circle cx="12" cy="9" r="1.2" fill="#00d4ff" />
          <circle cx="17" cy="9" r="1.2" fill="#00d4ff" />
        </g>
      );
    case "search":
      // Magnifying glass
      return (
        <g transform="translate(60 16)">
          <circle cx="10" cy="10" r="8" stroke="#00d4ff" strokeWidth="2" fill="none" />
          <line x1="16" y1="16" x2="22" y2="22" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case "error":
    default:
      // Confused question mark
      return (
        <g transform="translate(63 18)">
          <text x="0" y="14" fontFamily="monospace" fontSize="20" fill="#00d4ff" fontWeight="bold">
            ?
          </text>
        </g>
      );
  }
}
