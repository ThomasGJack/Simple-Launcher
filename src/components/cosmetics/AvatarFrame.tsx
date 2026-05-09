import { motion } from "framer-motion";
import { getCosmetic, type FrameSpec } from "@/lib/cosmetics";
import { cn } from "@/lib/cn";

/**
 * Wrapper visuel autour d'un avatar (image ou initiale). Rend un
 * cercle SVG par-dessus le children avec les couleurs / pattern /
 * anim définis dans le `FrameSpec` du cosmetic.
 *
 * Si frameId est null ou "frame.none", rend juste les children sans
 * décoration. Toutes les anims sont via framer-motion ou keyframes
 * CSS.
 *
 * Usage :
 *   <AvatarFrame frameId={user.equippedCosmetics?.frame} size={64}>
 *     <img src={user.avatar} className="size-full rounded-full" />
 *   </AvatarFrame>
 */
export function AvatarFrame({
  frameId,
  size = 56,
  children,
  className,
}: {
  frameId: string | null | undefined;
  size?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const cosmetic = getCosmetic(frameId ?? null);
  const frame = cosmetic?.frame;

  return (
    <div
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full">{children}</div>
      {frame && <FrameOverlay frame={frame} size={size} />}
    </div>
  );
}

/**
 * Variant non-clipping : juste l'anneau SVG cosmétique en overlay
 * absolu, sans wrap des children + sans overflow-hidden. Utilisé
 * quand on veut empiler le frame cosmétique par-dessus un autre
 * avatar component (genre TierAvatar avec ses propres glows qui
 * doivent dépasser).
 *
 * Le parent doit être positioned (relative) et avoir `size` px.
 */
export function CosmeticRingOverlay({
  frameId,
  size,
  className,
}: {
  frameId: string | null | undefined;
  size: number;
  className?: string;
}) {
  const cosmetic = getCosmetic(frameId ?? null);
  const frame = cosmetic?.frame;
  if (!frame) return null;
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      <FrameOverlay frame={frame} size={size} />
    </div>
  );
}

function FrameOverlay({ frame, size }: { frame: FrameSpec; size: number }) {
  const { strokeColor, strokeWidth, gradient, pattern, animate } = frame;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // ─── Rainbow pattern (legend) ───────────────────────────────────
  if (pattern === "rainbow") {
    return (
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="pointer-events-none absolute inset-0"
        animate={
          animate === "rainbow-shift"
            ? { rotate: [0, 360] }
            : undefined
        }
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      >
        <defs>
          <linearGradient id={`rainbow-${cx}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF0080" />
            <stop offset="20%" stopColor="#FFD700" />
            <stop offset="40%" stopColor="#00FF95" />
            <stop offset="60%" stopColor="#00B0FF" />
            <stop offset="80%" stopColor="#B266FF" />
            <stop offset="100%" stopColor="#FF0080" />
          </linearGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#rainbow-${cx})`}
          strokeWidth={strokeWidth}
        />
      </motion.svg>
    );
  }

  // ─── Double pattern (deux cercles concentriques) ────────────────
  if (pattern === "double") {
    const r2 = r - strokeWidth - 1;
    return (
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="pointer-events-none absolute inset-0"
        animate={
          animate === "rotate"
            ? { rotate: [0, 360] }
            : animate === "pulse"
              ? { opacity: [0.6, 1, 0.6] }
              : undefined
        }
        transition={{
          duration: animate === "rotate" ? 8 : 2.6,
          repeat: Infinity,
          ease: animate === "rotate" ? "linear" : "easeInOut",
        }}
      >
        {gradient && (
          <defs>
            <linearGradient id={`grad-${cx}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradient[0]} />
              <stop offset="100%" stopColor={gradient[1]} />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={gradient ? `url(#grad-${cx})` : strokeColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r2}
          fill="none"
          stroke={gradient ? `url(#grad-${cx})` : strokeColor}
          strokeWidth={1}
          opacity={0.4}
        />
      </motion.svg>
    );
  }

  // ─── Solid / dashed (single circle) ─────────────────────────────
  return (
    <motion.svg
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute inset-0"
      animate={
        animate === "pulse"
          ? { opacity: [0.65, 1, 0.65] }
          : animate === "rotate"
            ? { rotate: [0, 360] }
            : undefined
      }
      transition={{
        duration: animate === "rotate" ? 8 : 2.4,
        repeat: Infinity,
        ease: animate === "rotate" ? "linear" : "easeInOut",
      }}
    >
      {gradient && (
        <defs>
          <linearGradient id={`grad-${cx}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="100%" stopColor={gradient[1]} />
          </linearGradient>
        </defs>
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={gradient ? `url(#grad-${cx})` : strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={pattern === "dashed" ? "4 3" : undefined}
      />
    </motion.svg>
  );
}
