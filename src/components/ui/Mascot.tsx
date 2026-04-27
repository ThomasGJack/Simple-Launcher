import { useMemo } from "react";
import { motion } from "framer-motion";

/**
 * Reactive Glitch mascot. Renders an inline SVG of the penguin with a hood,
 * positioned fixed bottom-right, with a mood that depends on real-time app
 * context:
 *
 *  - `idle`     : default — gentle bob, neutral eyes
 *  - `happy`    : friend just came online — eyes glow brighter, faster bob
 *  - `gaming`   : a friend (or you) is currently playing — controller prop
 *  - `chat`     : you have unread DMs — chat bubble overhead with dots
 *  - `sleeping` : nothing's happening + you haven't played in a while — Zzz
 *
 * Driven by props so the parent (HomePage) can pick the mood from its
 * derived state without mascot needing its own subscriptions.
 */
export type MascotMood = "idle" | "happy" | "gaming" | "chat" | "sleeping";

export function Mascot({
  mood = "idle",
  /** Optional message shown as a tooltip-style speech bubble on hover. */
  tooltip,
}: {
  mood?: MascotMood;
  tooltip?: string;
}) {
  // Bob speed varies with mood — happy/chat are perkier, sleeping is slower.
  const bobDuration = useMemo(() => {
    switch (mood) {
      case "happy":
      case "chat":
        return 2.2;
      case "sleeping":
        return 6;
      default:
        return 3.6;
    }
  }, [mood]);

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: [0, -6, 0] }}
      transition={{
        opacity: { duration: 0.5, delay: 0.6 },
        y: { duration: bobDuration, repeat: Infinity, ease: "easeInOut" },
      }}
      className="pointer-events-none fixed bottom-6 right-6 z-10 select-none"
      style={{ filter: "drop-shadow(0 0 12px var(--color-accent-soft))" }}
      title={tooltip}
    >
      <GlitchPenguin mood={mood} />
    </motion.div>
  );
}

function GlitchPenguin({ mood }: { mood: MascotMood }) {
  // Eye expression varies with mood
  const eyeFill = mood === "sleeping" ? "transparent" : "#00d4ff";
  const eyeY = mood === "happy" ? 47 : 48;
  const eyeR = mood === "happy" ? 3 : 2.5;

  return (
    <svg viewBox="0 0 80 80" className="size-14" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <ellipse cx="40" cy="50" rx="20" ry="24" fill="#0d2236" stroke="#00d4ff" strokeOpacity="0.5" strokeWidth="1.4" />
      <ellipse cx="40" cy="56" rx="13" ry="17" fill="#1a3554" />

      {/* Yellow hood */}
      <path
        d="M 20 32 Q 22 22 30 20 L 50 20 Q 58 22 60 32 Q 60 36 56 38 L 24 38 Q 20 36 20 32 Z"
        fill="#fbbf24"
        stroke="#f59e0b"
        strokeWidth="1.2"
      />
      <line x1="28" y1="36" x2="27" y2="44" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="52" y1="36" x2="53" y2="44" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />

      {/* Eyes */}
      {mood === "sleeping" ? (
        <>
          <path d="M 30 47 Q 33 50 36 47" stroke="#00d4ff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M 44 47 Q 47 50 50 47" stroke="#00d4ff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="33" cy={eyeY} r={eyeR} fill={eyeFill}>
            <animate attributeName="r" values={`${eyeR};${eyeR + 0.3};${eyeR}`} dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="47" cy={eyeY} r={eyeR} fill={eyeFill}>
            <animate attributeName="r" values={`${eyeR};${eyeR + 0.3};${eyeR}`} dur="3s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* Beak — curves into a smile when happy */}
      {mood === "happy" ? (
        <path d="M 35 54 Q 40 60 45 54" stroke="#f59e0b" strokeWidth="2" fill="#fbbf24" strokeLinecap="round" />
      ) : (
        <path d="M 36 53 L 44 53 L 40 57 Z" fill="#f59e0b" />
      )}

      {/* Mood-specific accessory */}
      {mood === "gaming" && (
        <g transform="translate(20 65)">
          <rect x="0" y="0" width="40" height="12" rx="5" fill="#1f2937" stroke="#00d4ff" strokeWidth="1.2" />
          <circle cx="8" cy="6" r="1.6" fill="#00d4ff" />
          <circle cx="32" cy="6" r="1.6" fill="#fbbf24" />
        </g>
      )}

      {mood === "chat" && (
        <g transform="translate(50 12)">
          <path
            d="M 0 5 Q 0 0 5 0 L 18 0 Q 23 0 23 5 L 23 11 Q 23 16 18 16 L 12 16 L 8 20 L 8 16 L 5 16 Q 0 16 0 11 Z"
            fill="#0d2236"
            stroke="#00d4ff"
            strokeWidth="1.2"
          />
          <circle cx="7" cy="8" r="1.2" fill="#00d4ff">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="11.5" cy="8" r="1.2" fill="#00d4ff">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="16" cy="8" r="1.2" fill="#00d4ff">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" begin="0.4s" />
          </circle>
        </g>
      )}

      {mood === "sleeping" && (
        <g>
          <text x="58" y="20" fontSize="12" fill="#00d4ff" fontFamily="monospace" opacity="0.7">Z</text>
          <text x="64" y="14" fontSize="9" fill="#00d4ff" fontFamily="monospace" opacity="0.5">z</text>
        </g>
      )}

      {mood === "happy" && (
        <g>
          {/* Sparkles around the head */}
          <text x="14" y="20" fontSize="10" fill="#fbbf24">✨</text>
          <text x="58" y="22" fontSize="10" fill="#fbbf24">✨</text>
        </g>
      )}
    </svg>
  );
}
