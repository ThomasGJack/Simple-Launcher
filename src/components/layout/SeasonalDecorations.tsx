import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useSettingsStore } from "@/store/settings";
import type { SeasonId } from "@/lib/seasonal";

/**
 * Décorations saisonnières — calque par-dessus toute l'app, gérées
 * par `data-season=<id>` sur `<html>` (posé par applySeasonalTheme).
 *
 * Halloween : toiles d'araignée dans les coins + citrouilles
 * mascottes + chauves-souris qui volent + feuilles d'automne.
 *
 * Noël : guirlande lumineuse en haut + sapins dans les coins +
 * flocons qui tombent.
 *
 * Toute la couche est `pointer-events-none` pour ne pas voler les
 * clics. Les particles sont désactivées si l'user a coupé les
 * animations dans Settings (Apparence → Animations off) — seules
 * les décorations statiques restent.
 *
 * Performance : 12 particles max simultanées, chacune `transform-only`
 * pour rester GPU-friendly. Pas de re-render React pendant l'anim
 * (Framer gère tout côté style).
 */
export function SeasonalDecorations() {
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const [season, setSeason] = useState<SeasonId | null>(null);

  // Watch <html data-season> — change quand l'admin force / retire un
  // thème depuis le panel Saisons. MutationObserver léger, 0 polling.
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const v = root.getAttribute("data-season");
      setSeason(v === "halloween" || v === "christmas" ? v : null);
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["data-season"] });
    return () => obs.disconnect();
  }, []);

  if (!season) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      {season === "halloween" && (
        <HalloweenScene animations={animationsEnabled} />
      )}
      {season === "christmas" && (
        <ChristmasScene animations={animationsEnabled} />
      )}
    </div>
  );
}

// ─── Halloween ──────────────────────────────────────────────────────────

function HalloweenScene({ animations }: { animations: boolean }) {
  return (
    <>
      {/* Toiles d'araignée dans 4 coins */}
      <Spiderweb className="absolute left-0 top-0 size-40 text-orange-300/30" />
      <Spiderweb className="absolute right-0 top-0 size-40 -scale-x-100 text-orange-300/30" />
      <Spiderweb className="absolute left-0 bottom-0 size-32 -scale-y-100 text-orange-300/25" />
      <Spiderweb className="absolute right-0 bottom-0 size-32 -scale-100 text-orange-300/25" />

      {/* Citrouilles — coins + accents disséminés */}
      <div className="absolute right-6 bottom-4 select-none text-5xl drop-shadow-[0_0_14px_rgba(251,146,60,0.5)]">
        🎃
      </div>
      <div className="absolute left-8 top-16 select-none text-3xl drop-shadow-[0_0_8px_rgba(251,146,60,0.35)] opacity-80">
        🎃
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-2 select-none text-3xl opacity-70 drop-shadow-[0_0_8px_rgba(251,146,60,0.4)]">
        🎃
      </div>
      <div className="absolute right-1/3 bottom-16 select-none text-2xl opacity-60">
        🎃
      </div>

      {/* Chauve-souris qui pendent du haut */}
      <div className="absolute top-0 left-1/4 select-none text-2xl opacity-60">
        🦇
      </div>
      <div className="absolute top-0 right-1/3 select-none text-xl opacity-50">
        🦇
      </div>
      <div className="absolute top-0 left-1/2 select-none text-xl opacity-55">
        🦇
      </div>

      {/* Fantômes flottants */}
      <FloatingGhost
        className="absolute right-1/4 top-1/3 select-none text-3xl opacity-70 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
        animations={animations}
        delay={0}
      >
        👻
      </FloatingGhost>
      <FloatingGhost
        className="absolute left-1/4 top-1/2 select-none text-2xl opacity-60 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
        animations={animations}
        delay={1.4}
      >
        👻
      </FloatingGhost>

      {/* Tombes + accents fixes */}
      <div className="absolute left-12 bottom-2 select-none text-2xl opacity-65">
        🪦
      </div>
      <div className="absolute right-1/2 top-12 select-none text-xl opacity-50">
        🕷️
      </div>
      <div className="absolute right-12 top-1/4 select-none text-2xl opacity-60">
        🕸️
      </div>
      <div className="absolute left-12 top-1/2 select-none text-xl opacity-55">
        🍬
      </div>
      <div className="absolute right-16 top-1/2 select-none text-xl opacity-55">
        🌙
      </div>

      {/* Particles animées — bats qui volent + feuilles qui tombent */}
      {animations && <FlyingBats />}
      {animations && <FallingLeaves />}

      {/* Lueur orange/violet sur les bords + halo central */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(251,146,60,0.07) 0%, transparent 50%), radial-gradient(ellipse at bottom, rgba(147,51,234,0.06) 0%, transparent 60%), radial-gradient(circle at 50% 50%, rgba(0,0,0,0.15) 30%, transparent 70%)",
        }}
      />
    </>
  );
}

/**
 * Petit wrapper qui fait flotter doucement un emoji haut/bas en boucle —
 * utilisé pour les fantômes Halloween. Si les animations sont coupées,
 * juste un static.
 */
function FloatingGhost({
  className,
  animations,
  delay,
  children,
}: {
  className: string;
  animations: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  if (!animations) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      animate={{
        y: [0, -12, 0],
        opacity: [0.7, 1, 0.7],
      }}
      transition={{
        duration: 4,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {children}
    </motion.div>
  );
}

/** Toile d'araignée SVG — 6 lignes radiales + 4 arcs concentriques. */
function Spiderweb({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
      className={className}
    >
      {/* Radiales */}
      <line x1="0" y1="0" x2="100" y2="100" />
      <line x1="0" y1="0" x2="80" y2="100" />
      <line x1="0" y1="0" x2="60" y2="100" />
      <line x1="0" y1="0" x2="100" y2="80" />
      <line x1="0" y1="0" x2="100" y2="60" />
      <line x1="0" y1="0" x2="100" y2="40" />
      {/* Arcs concentriques (quart de cercle) */}
      <path d="M 0 25 Q 25 25 25 0" />
      <path d="M 0 50 Q 50 50 50 0" />
      <path d="M 0 75 Q 75 75 75 0" />
      <path d="M 0 100 Q 100 100 100 0" />
    </svg>
  );
}

/** 4 chauves-souris qui volent en diagonale, en boucle, à des hauteurs diff. */
function FlyingBats() {
  const bats = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        startY: 10 + Math.random() * 40, // % de l'écran (haut)
        endY: 30 + Math.random() * 50,
        duration: 18 + Math.random() * 12, // 18-30 s
        delay: i * 5 + Math.random() * 3,
      })),
    [],
  );
  return (
    <>
      {bats.map((b, i) => (
        <motion.div
          key={i}
          initial={{ x: "-10vw", y: `${b.startY}vh`, opacity: 0 }}
          animate={{
            x: "110vw",
            y: `${b.endY}vh`,
            opacity: [0, 0.7, 0.7, 0],
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.1, 0.9, 1],
          }}
          className="absolute select-none text-2xl"
        >
          🦇
        </motion.div>
      ))}
    </>
  );
}

/** 8 feuilles d'automne qui tombent en zig-zag. */
function FallingLeaves() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        x: Math.random() * 100, // % horizontal
        duration: 14 + Math.random() * 10,
        delay: i * 2.2 + Math.random() * 2,
        emoji: ["🍂", "🍁"][i % 2],
        rotateEnd: 360 + Math.random() * 360,
      })),
    [],
  );
  return (
    <>
      {leaves.map((l, i) => (
        <motion.div
          key={i}
          initial={{ y: "-8vh", x: `${l.x}vw`, rotate: 0, opacity: 0 }}
          animate={{
            y: "108vh",
            x: [`${l.x}vw`, `${l.x + 5}vw`, `${l.x - 3}vw`, `${l.x + 4}vw`],
            rotate: l.rotateEnd,
            opacity: [0, 0.85, 0.85, 0.4],
          }}
          transition={{
            duration: l.duration,
            delay: l.delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.1, 0.9, 1],
          }}
          className="absolute select-none text-xl"
        >
          {l.emoji}
        </motion.div>
      ))}
    </>
  );
}

// ─── Christmas / Noël ───────────────────────────────────────────────────

function ChristmasScene({ animations }: { animations: boolean }) {
  return (
    <>
      {/* 2 guirlandes lumineuses : top (la principale) + bottom légèrement
          plus discrète pour donner le côté "guirlandes partout" demandé. */}
      <FairyLights animations={animations} position="top" />
      <FairyLights animations={animations} position="bottom" />

      {/* Sapins dans les coins bas */}
      <div className="absolute left-4 bottom-12 select-none text-5xl drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">
        🎄
      </div>
      <div className="absolute right-6 bottom-12 select-none text-6xl drop-shadow-[0_0_12px_rgba(16,185,129,0.55)]">
        🎄
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-12 select-none text-3xl opacity-70 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
        🎄
      </div>

      {/* Étoiles + cadeaux en accents */}
      <div className="absolute right-1/4 top-16 select-none text-2xl opacity-70 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]">
        ⭐
      </div>
      <div className="absolute left-1/3 top-12 select-none text-xl opacity-60">
        🎁
      </div>
      <div className="absolute right-1/3 top-32 select-none text-xl opacity-60">
        🎁
      </div>
      <div className="absolute left-1/4 top-24 select-none text-2xl opacity-65 drop-shadow-[0_0_6px_rgba(251,191,36,0.55)]">
        ⭐
      </div>
      <div className="absolute right-12 top-1/3 select-none text-xl opacity-55">
        🔔
      </div>
      <div className="absolute left-12 top-1/2 select-none text-xl opacity-55">
        🔔
      </div>
      <div className="absolute right-1/2 bottom-1/3 select-none text-2xl opacity-60">
        🦌
      </div>

      {/* Particles de flocons */}
      {animations && <FallingSnowflakes />}

      {/* Lueurs rouge/vert + halo doré au centre pour l'ambiance "warm" */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at bottom left, rgba(16,185,129,0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(220,38,38,0.06) 0%, transparent 50%), radial-gradient(ellipse at top, rgba(251,191,36,0.04) 0%, transparent 60%)",
        }}
      />
    </>
  );
}

/** Guirlande lumineuse : SVG path courbe avec 12 cercles colorés qui pulsent.
 *  Position "top" → en haut, "bottom" → en bas (renversée verticalement). */
function FairyLights({
  animations,
  position,
}: {
  animations: boolean;
  position: "top" | "bottom";
}) {
  // 12 LEDs — couleurs alternées rouge / vert / jaune / bleu pour le
  // côté kitsch assumé des guirlandes Noël.
  const colors = ["#ef4444", "#10b981", "#fbbf24", "#3b82f6"];
  const leds = Array.from({ length: 12 }, (_, i) => ({
    color: colors[i % colors.length],
    cx: 4 + (i * 92) / 11, // de 4% à 96%
    // Phase shift pour que la guirlande du bas pulse en décalé de
    // celle du haut → effet "lumières twinkle" plus vivant.
    delay: ((i * 0.15 + (position === "bottom" ? 0.6 : 0)) % 1.6),
  }));
  const className =
    position === "top"
      ? "absolute inset-x-0 top-0 h-12 w-full"
      : // Guirlande basse : flip vertical pour que la courbe s'incurve
        // vers le haut (esthétique "souples qui pendent depuis le bas").
        "absolute inset-x-0 bottom-0 h-10 w-full -scale-y-100 opacity-90";
  return (
    <svg
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      className={className}
    >
      {/* Câble — courbe sinusoïdale légère */}
      <path
        d="M 0 1 Q 25 5 50 2 T 100 3"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="0.3"
        fill="none"
      />
      {/* LEDs — cy approximée sur la courbe (suffisant visuellement) */}
      {leds.map((led, i) => {
        // y = 1 + 3.5*sin(πx/50) approximation de la courbe Bézier ci-dessus
        const cy = 1 + 3.5 * Math.sin((Math.PI * led.cx) / 50);
        return (
          <motion.circle
            key={i}
            cx={led.cx}
            cy={cy}
            r="1.2"
            fill={led.color}
            animate={
              animations
                ? {
                    opacity: [0.4, 1, 0.4],
                    r: [1, 1.6, 1],
                  }
                : { opacity: 1 }
            }
            transition={
              animations
                ? {
                    duration: 1.6,
                    delay: led.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
                : undefined
            }
            style={{
              filter: `drop-shadow(0 0 3px ${led.color})`,
            }}
          />
        );
      })}
    </svg>
  );
}

/** 12 flocons de différentes tailles qui tombent à vitesses variées. */
function FallingSnowflakes() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: Math.random() * 100,
        duration: 10 + Math.random() * 14,
        delay: i * 1.4 + Math.random() * 1.5,
        size: 0.8 + Math.random() * 1.2,
        emoji: ["❄", "❅", "❆"][i % 3],
      })),
    [],
  );
  return (
    <>
      {flakes.map((f, i) => (
        <motion.div
          key={i}
          initial={{ y: "-6vh", x: `${f.x}vw`, opacity: 0 }}
          animate={{
            y: "106vh",
            x: [`${f.x}vw`, `${f.x + 3}vw`, `${f.x - 4}vw`, `${f.x + 2}vw`],
            opacity: [0, 0.9, 0.9, 0.4],
          }}
          transition={{
            duration: f.duration,
            delay: f.delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.1, 0.9, 1],
          }}
          className="absolute select-none text-white"
          style={{
            fontSize: `${f.size}rem`,
            textShadow: "0 0 6px rgba(255,255,255,0.5)",
          }}
        >
          {f.emoji}
        </motion.div>
      ))}
    </>
  );
}
