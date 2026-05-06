import { motion } from "framer-motion";

/**
 * Adaptation site du Mascot launcher : même SVG (Glitch le pingouin
 * à capuche jaune) mais en position relative (pas fixed bottom-right
 * global comme dans le launcher) — sinon il flotte au-dessus de
 * toutes les sections au scroll.
 *
 * Mood "happy" par défaut sur la landing : sourire + sparkles autour
 * de la tête. Le pingouin bobbe doucement.
 */
export function MascotInline({
  size = 96,
  bobbing = true,
}: {
  size?: number;
  bobbing?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={
        bobbing
          ? { opacity: 1, y: [0, -6, 0] }
          : { opacity: 1, y: 0 }
      }
      transition={
        bobbing
          ? {
              opacity: { duration: 0.5, delay: 0.6 },
              y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
            }
          : { duration: 0.5, delay: 0.6 }
      }
      className="select-none"
      style={{ filter: "drop-shadow(0 0 14px var(--color-accent-soft))" }}
    >
      <svg
        viewBox="0 0 80 80"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Body */}
        <ellipse
          cx="40"
          cy="50"
          rx="20"
          ry="24"
          fill="#0d2236"
          stroke="#00d4ff"
          strokeOpacity="0.5"
          strokeWidth="1.4"
        />
        <ellipse cx="40" cy="56" rx="13" ry="17" fill="#1a3554" />

        {/* Yellow hood — la couleur or qui rappelle Simple Games */}
        <path
          d="M 20 32 Q 22 22 30 20 L 50 20 Q 58 22 60 32 Q 60 36 56 38 L 24 38 Q 20 36 20 32 Z"
          fill="#fbbf24"
          stroke="#f59e0b"
          strokeWidth="1.2"
        />
        <line x1="28" y1="36" x2="27" y2="44" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="52" y1="36" x2="53" y2="44" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />

        {/* Eyes — happy : un peu plus gros */}
        <circle cx="33" cy="47" r="3" fill="#00d4ff">
          <animate attributeName="r" values="3;3.3;3" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="47" cy="47" r="3" fill="#00d4ff">
          <animate attributeName="r" values="3;3.3;3" dur="3s" repeatCount="indefinite" />
        </circle>

        {/* Beak — sourire */}
        <path d="M 35 54 Q 40 60 45 54" stroke="#f59e0b" strokeWidth="2" fill="#fbbf24" strokeLinecap="round" />

        {/* Sparkles around head */}
        <text x="14" y="20" fontSize="10" fill="#fbbf24">✨</text>
        <text x="58" y="22" fontSize="10" fill="#fcd34d">✨</text>
      </svg>
    </motion.div>
  );
}
