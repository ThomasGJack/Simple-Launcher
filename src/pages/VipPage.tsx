import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  AnimatePresence,
} from "framer-motion";
import {
  Crown,
  Gem,
  Sparkles,
  Check,
  Lock,
  Heart,
  Award,
  Users,
  Palette,
  Flame,
  Image,
  Copy,
  ExternalLink,
  X,
  type LucideIcon,
} from "lucide-react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { useAuthStore } from "@/store/auth";
import { useUsers } from "@/store/firebaseStores";
import { copyUserCodeToClipboard, openKofiTiers, KOFI_PAGE_URL } from "@/firebase/kofi";
import { sounds } from "@/lib/sounds";
import type { SupporterTier } from "@/lib/supporterTier";

/**
 * VIP / supporter tiers page. Three subscription tiers (1€/5€/10€ per
 * month) shown as immersive parallax cards. Currently informational only —
 * no Stripe integration; each CTA shows "Pas encore disponible" so users
 * can preview the tiers before sign-ups go live.
 *
 * Visual treatment is intentionally over-the-top: aurora background,
 * floating crown, mouse-tracked 3D tilt per card, tier-specific particle
 * fields, animated price count-up on viewport entry, sweeping shimmer
 * highlight, pulsing recommended ribbon. Goal is "WOW" first-impression
 * to communicate that supporting the dev is something premium.
 */

type TierKey = SupporterTier; // "supporter" | "vip" | "legend"

type TierBenefit = {
  icon: LucideIcon;
  text: string;
};

type Tier = {
  key: TierKey;
  name: string;
  tagline: string;
  price: number; // euros / month
  icon: LucideIcon;
  /** Hex colors used for the per-tier gradient + ring + particle tint. */
  colors: { from: string; to: string; ring: string; glow: string };
  benefits: TierBenefit[];
  recommended?: boolean;
};

const TIERS: Tier[] = [
  {
    key: "supporter",
    name: "Soutien",
    tagline: "Le petit coup de pouce qui fait plaisir.",
    price: 1,
    icon: Heart,
    colors: {
      from: "#CD7F32",
      to: "#FFB75E",
      ring: "rgba(205, 127, 50, 0.55)",
      glow: "rgba(255, 183, 94, 0.45)",
    },
    benefits: [
      { icon: Heart, text: "Frame d'avatar bronze animée (shimmer rotatif)" },
      { icon: Award, text: "Badge cœur permanent sur ton avatar" },
      { icon: Palette, text: "Pseudo en couleur bronze chaude" },
      { icon: Image, text: "Bordure bronze animée sur ton row partout" },
      { icon: Users, text: "Création de Crews privés ou publics" },
      { icon: Heart, text: "Ma reconnaissance éternelle ❤️" },
    ],
  },
  {
    key: "vip",
    name: "VIP",
    tagline: "Le club privé. Avantages exclusifs partout.",
    price: 5,
    icon: Crown,
    recommended: true,
    colors: {
      from: "#A78BFA",
      to: "#22D3EE",
      ring: "rgba(167, 139, 250, 0.65)",
      glow: "rgba(34, 211, 238, 0.55)",
    },
    benefits: [
      { icon: Check, text: "Tout du tier Soutien" },
      { icon: Crown, text: "Frame d'avatar VIP rotative cyan→violet" },
      { icon: Crown, text: "Badge couronne pulsant sur ton avatar" },
      { icon: Palette, text: "Pseudo en gradient cyan/violet animé" },
      { icon: Image, text: "Bordure cyan/violet conveyor-belt sur ton row" },
      { icon: Sparkles, text: "Aura cyan/violet qui respire autour de toi" },
    ],
  },
  {
    key: "legend",
    name: "Légende",
    tagline: "Le sommet. Pour les vrais.",
    price: 10,
    icon: Gem,
    colors: {
      from: "#FFD700",
      to: "#FF6B35",
      ring: "rgba(255, 215, 0, 0.7)",
      glow: "rgba(255, 107, 53, 0.6)",
    },
    benefits: [
      { icon: Check, text: "Tout du tier VIP" },
      { icon: Flame, text: "Frame d'avatar 3 anneaux rainbow + or/orange" },
      { icon: Sparkles, text: "Badge sparkles or qui se balance sur ton avatar" },
      { icon: Palette, text: "Pseudo en shimmer arc-en-ciel animé" },
      { icon: Image, text: "Bordure rainbow shimmer sur ton row" },
      { icon: Award, text: "Aura or géante visible de loin" },
      { icon: Lock, text: "Mention dans les crédits du launcher (à venir)" },
    ],
  },
];

let engineInitPromise: Promise<void> | null = null;
function ensureEngine(): Promise<void> {
  if (!engineInitPromise) {
    engineInitPromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }
  return engineInitPromise;
}

export function VipPage() {
  return (
    <div className="relative h-full overflow-y-auto">
      <AuroraBackground />
      <div className="relative z-10 mx-auto max-w-[1280px] px-12 py-16">
        <Hero />
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {TIERS.map((tier, i) => (
            <TierCard key={tier.key} tier={tier} index={i} />
          ))}
        </div>
        <Footnote />
      </div>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────

function Hero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative text-center"
    >
      {/* Floating crown above the title — subtle vertical bob + slow rotation */}
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [-3, 3, -3] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="mx-auto mb-6 grid size-24 place-items-center"
      >
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-2xl"
            style={{
              background:
                "radial-gradient(circle, rgba(255,215,0,0.55) 0%, rgba(255,107,53,0.3) 40%, transparent 70%)",
            }}
          />
          <Crown
            className="relative size-20 text-amber-300 drop-shadow-[0_0_20px_rgba(255,215,0,0.8)]"
            strokeWidth={1.4}
          />
          {/* Tiny sparkles around the crown */}
          {[...Array(6)].map((_, i) => (
            <motion.span
              key={i}
              className="absolute size-1.5 rounded-full bg-amber-200"
              style={{
                top: `${20 + Math.sin((i / 6) * Math.PI * 2) * 40}%`,
                left: `${50 + Math.cos((i / 6) * Math.PI * 2) * 50}%`,
                boxShadow: "0 0 8px rgba(255,215,0,0.9)",
              }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.4, 0.5] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                delay: i * 0.4,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>

      <p className="inline-flex items-center gap-2 rounded-full bg-amber-300/10 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-amber-300 ring-1 ring-amber-300/30">
        <Sparkles className="size-3" /> Devenir VIP
      </p>
      <h1 className="mt-5 font-display text-6xl leading-tight tracking-tight">
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(110deg, #FFD700 0%, #FF6B35 30%, #A78BFA 60%, #22D3EE 100%)",
            backgroundSize: "200% 100%",
          }}
        >
          <ShimmerText>Soutiens le développement</ShimmerText>
        </span>
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-fg-muted">
        Simple Launcher est développé seul, sur mon temps libre. Si l'app te plaît
        et que tu veux la voir grandir, choisis un tier et débloque des avantages
        exclusifs en même temps.
      </p>
    </motion.div>
  );
}

/**
 * Animated shimmering text — runs a horizontal gradient sweep across the
 * children every few seconds. The gradient is on the parent (text-clip),
 * we just animate `background-position`.
 */
function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      style={{
        backgroundImage:
          "linear-gradient(110deg, #FFD700 0%, #FF6B35 30%, #A78BFA 60%, #22D3EE 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {children}
    </motion.span>
  );
}

// ─── Aurora background ─────────────────────────────────────────────────

/**
 * Three slow-moving radial gradient blobs that paint a luxurious shifting
 * backdrop behind the page content. Animated via framer-motion only —
 * no canvas, no shaders, just CSS blur + transform.
 */
function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-[20%] top-[-15%] h-[55vh] w-[55vh] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,215,0,0.18) 0%, transparent 70%)",
        }}
        animate={{ x: [0, 80, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-10%] top-[30%] h-[60vh] w-[60vh] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 70%)",
        }}
        animate={{ x: [0, -60, 0], y: [0, 60, 0] }}
        transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-15%] left-[20%] h-[50vh] w-[50vh] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)",
        }}
        animate={{ x: [0, 40, 0], y: [0, -40, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Faint grid for depth */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

// ─── Tier card ─────────────────────────────────────────────────────────

function TierCard({ tier, index }: { tier: Tier; index: number }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Mouse-tracked 3D tilt. Springs on the rotation values smooth the
  // motion so the card never jitters on fast cursor moves.
  const rawX = useMotionValue(0.5);
  const rawY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(rawY, [0, 1], [10, -10]), {
    stiffness: 200,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(rawX, [0, 1], [-10, 10]), {
    stiffness: 200,
    damping: 20,
  });
  // Diagonal highlight that follows the cursor — gives the impression of
  // a glossy, almost holographic surface.
  const hoverX = useSpring(useTransform(rawX, [0, 1], ["0%", "100%"]), {
    stiffness: 200,
    damping: 25,
  });
  const hoverY = useSpring(useTransform(rawY, [0, 1], ["0%", "100%"]), {
    stiffness: 200,
    damping: 25,
  });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    rawX.set((e.clientX - rect.left) / rect.width);
    rawY.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => {
    rawX.set(0.5);
    rawY.set(0.5);
    setHovered(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        ease: [0.22, 1, 0.36, 1],
        delay: 0.15 + index * 0.12,
      }}
      style={{ perspective: 1400 }}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative"
      >
        {/* Recommended ribbon */}
        {tier.recommended && (
          <div className="absolute -top-3 left-1/2 z-30 -translate-x-1/2">
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="relative overflow-hidden rounded-full px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-bg-base shadow-[0_0_24px_rgba(167,139,250,0.7)]"
              style={{
                background:
                  "linear-gradient(110deg, #A78BFA 0%, #22D3EE 50%, #A78BFA 100%)",
                backgroundSize: "200% 100%",
              }}
            >
              <motion.span
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
                }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              />
              <span className="relative">★ Recommandé</span>
            </motion.div>
          </div>
        )}

        {/* Outer pulsing glow ring */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-0.5 rounded-3xl blur-md"
          style={{
            background: `linear-gradient(135deg, ${tier.colors.from}, ${tier.colors.to})`,
          }}
          animate={{ opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* The card itself */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-bg-soft/80 p-7 backdrop-blur-xl"
          style={{ boxShadow: `0 30px 60px -20px ${tier.colors.glow}` }}
        >
          {/* Per-tier particle field (only when card is hovered, save CPU otherwise) */}
          <CardParticles tier={tier} active={hovered} />

          {/* Mouse-following highlight (glossy sheen) */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: useTransform(
                [hoverX, hoverY],
                ([x, y]) =>
                  `radial-gradient(circle at ${x} ${y}, ${tier.colors.glow} 0%, transparent 35%)`,
              ),
              opacity: hovered ? 0.45 : 0,
              transition: "opacity 250ms ease",
            }}
          />

          {/* Sweeping shimmer band — slow diagonal pass every few seconds */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-y-10 -left-1/2 w-1/2"
            style={{
              background:
                "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.08) 55%, transparent 100%)",
              transform: "skewX(-20deg)",
            }}
            animate={{ x: ["0%", "350%"] }}
            transition={{ duration: 6, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
          />

          {/* Top decoration: tier icon badge */}
          <div className="relative z-10 flex items-start justify-between">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.3,
              }}
              className="grid size-14 place-items-center rounded-2xl ring-1 ring-white/10"
              style={{
                background: `linear-gradient(135deg, ${tier.colors.from}33, ${tier.colors.to}33)`,
                boxShadow: `0 0 24px ${tier.colors.glow}`,
              }}
            >
              <tier.icon
                className="size-7"
                strokeWidth={1.6}
                style={{ color: tier.colors.from, filter: `drop-shadow(0 0 8px ${tier.colors.glow})` }}
              />
            </motion.div>
            <div
              className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
              style={{
                background: `${tier.colors.from}22`,
                color: tier.colors.from,
                border: `1px solid ${tier.colors.ring}`,
              }}
            >
              Tier {index + 1}
            </div>
          </div>

          {/* Name + tagline */}
          <h2
            className="relative z-10 mt-5 font-display text-3xl"
            style={{
              backgroundImage: `linear-gradient(110deg, ${tier.colors.from}, ${tier.colors.to})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {tier.name}
          </h2>
          <p className="relative z-10 mt-1.5 text-sm text-fg-muted">{tier.tagline}</p>

          {/* Price block — animated count-up on viewport entry */}
          <div className="relative z-10 mt-6 flex items-baseline gap-1.5">
            <CountUp
              to={tier.price}
              className="font-display text-6xl text-fg-primary"
              style={{
                textShadow: `0 0 30px ${tier.colors.glow}`,
              }}
            />
            <span className="font-display text-2xl text-fg-primary">€</span>
            <span className="ml-1 text-sm text-fg-muted">/ mois</span>
          </div>

          <div className="relative z-10 my-6 h-px w-full bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />

          {/* Benefits list */}
          <ul className="relative z-10 space-y-3">
            {tier.benefits.map((b, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.4 + index * 0.12 + i * 0.05,
                }}
                className="flex items-start gap-3 text-sm text-fg-primary/90"
              >
                <span
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `${tier.colors.from}22`,
                    color: tier.colors.from,
                    boxShadow: `0 0 8px ${tier.colors.glow}`,
                  }}
                >
                  <b.icon className="size-3" strokeWidth={2.5} />
                </span>
                <span>{b.text}</span>
              </motion.li>
            ))}
          </ul>

          {/* CTA — wired to Stripe : checkout for free users, portal for
              already-subscribed, disabled for higher-tier viewers. */}
          <div className="relative z-10 mt-8">
            <ActiveCTA tier={tier} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Active CTA ─────────────────────────────────────────────────────────

/**
 * Smart CTA that adapts to the viewer's current tier :
 *
 *  - Logged out         → "Connecte-toi" (greyed out)
 *  - Already this tier  → "Tu es {Tier} — actif" (greyed out, no
 *                          re-checkout needed) + "gérer sur Ko-fi"
 *  - Higher tier        → "Inclus dans ton tier" (disabled)
 *  - Free / lower tier  → "Souscrire — N €/mois" → opens KofiSubscribeModal
 *
 * Ko-fi flow : the modal copies the user's UID to the clipboard and
 * opens the Ko-fi tiers page in the system browser. The user pastes
 * the UID into Ko-fi's "Message" field during checkout ; the
 * `kofiWebhook` Cloud Function picks it up and grants the tier on
 * `users/{uid}`.
 */
function ActiveCTA({ tier }: { tier: Tier }) {
  const me = useAuthStore((s) => s.user);
  const myProfile = useUsers().find((u) => u.uid === me?.uid);
  const myTier = myProfile?.tier ?? null;
  const [modalOpen, setModalOpen] = useState(false);

  const tierRank: Record<SupporterTier, number> = { supporter: 1, vip: 2, legend: 3 };
  const isMine = myTier === tier.key;
  const isUpgrade = myTier && tierRank[myTier] < tierRank[tier.key];
  const isCovered = myTier && tierRank[myTier] > tierRank[tier.key];

  // ─── State: not logged in ──────────────────────────────────────
  if (!me) {
    return (
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-2xl border px-5 py-3.5 text-sm font-semibold opacity-60"
        style={{
          background: `linear-gradient(135deg, ${tier.colors.from}1a, ${tier.colors.to}1a)`,
          borderColor: tier.colors.ring,
          color: tier.colors.from,
        }}
      >
        Connecte-toi pour souscrire
      </button>
    );
  }

  // ─── State: already this tier — show "manage on Ko-fi" ───────
  if (isMine) {
    return (
      <button
        type="button"
        onClick={() => {
          sounds.click();
          openKofiTiers().catch(() => sounds.error());
        }}
        className="group relative w-full overflow-hidden rounded-2xl border px-5 py-3.5 text-sm font-semibold transition-shadow hover:shadow-[0_0_24px_rgba(255,255,255,0.15)]"
        style={{
          background: `linear-gradient(135deg, ${tier.colors.from}, ${tier.colors.to})`,
          borderColor: tier.colors.ring,
          color: "#0a0d12",
        }}
      >
        <span className="relative inline-flex items-center justify-center gap-2">
          <Crown className="size-4" />
          Tu es {tier.name} — gérer sur Ko-fi
        </span>
      </button>
    );
  }

  // ─── State: covered by a higher tier ──────────────────────────
  if (isCovered) {
    return (
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-2xl border px-5 py-3.5 text-sm font-semibold opacity-60"
        style={{
          background: `linear-gradient(135deg, ${tier.colors.from}1a, ${tier.colors.to}1a)`,
          borderColor: tier.colors.ring,
          color: tier.colors.from,
        }}
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Check className="size-4" />
          Inclus dans ton tier actuel
        </span>
      </button>
    );
  }

  // ─── State: free user or lower tier — open subscribe modal ───
  return (
    <>
      <button
        type="button"
        onClick={() => {
          sounds.click();
          setModalOpen(true);
        }}
        className="group relative w-full overflow-hidden rounded-2xl border px-5 py-3.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-[0_0_28px_rgba(255,255,255,0.2)]"
        style={{
          background: `linear-gradient(135deg, ${tier.colors.from}, ${tier.colors.to})`,
          borderColor: tier.colors.ring,
          color: "#0a0d12",
        }}
      >
        {/* Shimmer band */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
        <span className="relative inline-flex items-center justify-center gap-2">
          {isUpgrade
            ? `Passer à ${tier.name} — ${tier.price} €/mois`
            : `Souscrire — ${tier.price} €/mois`}
        </span>
      </button>

      <AnimatePresence>
        {modalOpen && (
          <KofiSubscribeModal
            tier={tier}
            userUid={me.uid}
            onClose={() => setModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Ko-fi subscribe modal ─────────────────────────────────────────────

/**
 * Modal popped when the user wants to subscribe. Walks them through
 * the 4-step Ko-fi flow with a copy-to-clipboard helper for their
 * UID — the critical bit that lets the webhook match the payment
 * back to their Firebase account.
 */
function KofiSubscribeModal({
  tier,
  userUid,
  onClose,
}: {
  tier: Tier;
  userUid: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleCopy = async () => {
    try {
      await copyUserCodeToClipboard(userUid);
      sounds.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      sounds.error();
    }
  };

  const handleOpen = async () => {
    setOpening(true);
    try {
      // Auto-copy on open so users don't forget — no harm if they
      // already clicked the dedicated copy button.
      await copyUserCodeToClipboard(userUid);
      sounds.click();
      await openKofiTiers();
      setCopied(true);
    } catch (err) {
      console.error("[kofi] open failed:", err);
      sounds.error();
    } finally {
      setOpening(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="relative max-w-md rounded-3xl border border-white/[0.08] bg-bg-soft/95 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 30px 80px -20px ${tier.colors.glow}` }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div
            className="grid size-12 place-items-center rounded-2xl ring-1 ring-white/10"
            style={{
              background: `linear-gradient(135deg, ${tier.colors.from}33, ${tier.colors.to}33)`,
              boxShadow: `0 0 24px ${tier.colors.glow}`,
            }}
          >
            <tier.icon
              className="size-6"
              strokeWidth={1.6}
              style={{ color: tier.colors.from }}
            />
          </div>
          <div>
            <h3
              className="font-display text-2xl"
              style={{
                backgroundImage: `linear-gradient(110deg, ${tier.colors.from}, ${tier.colors.to})`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Souscrire {tier.name}
            </h3>
            <p className="text-xs text-fg-muted">{tier.price} €/mois sur Ko-fi</p>
          </div>
        </div>

        {/* User code */}
        <div className="mb-5 rounded-2xl bg-bg-base/50 p-4 ring-1 ring-white/[0.06]">
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-fg-dim">
            Ton code utilisateur
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-bg-base/80 px-3 py-2 font-mono text-sm text-fg-primary">
              {userUid}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/25"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="mb-6 space-y-2.5 text-sm">
          <Step n={1}>
            Clique sur <strong>« Ouvrir Ko-fi »</strong> ci-dessous (ton code
            sera copié automatiquement).
          </Step>
          <Step n={2}>
            Sur Ko-fi, choisis le tier <strong>« {tier.name} »</strong> ({tier.price} €/mois).
          </Step>
          <Step n={3}>
            Pendant le paiement, <strong>colle ton code</strong> dans le champ
            <span className="mx-1 rounded bg-bg-base/80 px-1.5 py-0.5 font-mono text-[11px]">
              Message
            </span>
            (Ctrl+V).
          </Step>
          <Step n={4}>
            Ton tier <strong>{tier.name}</strong> sera activé automatiquement
            dans 1-2 minutes.
          </Step>
        </div>

        {/* CTA */}
        <button
          onClick={handleOpen}
          disabled={opening}
          className="group relative w-full overflow-hidden rounded-2xl px-5 py-3.5 text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-60"
          style={{
            background: `linear-gradient(135deg, ${tier.colors.from}, ${tier.colors.to})`,
            color: "#0a0d12",
            boxShadow: `0 10px 30px -10px ${tier.colors.glow}`,
          }}
        >
          <span className="relative inline-flex items-center justify-center gap-2">
            <ExternalLink className="size-4" />
            {opening ? "Ouverture de Ko-fi…" : `Ouvrir Ko-fi ${tier.name}`}
          </span>
        </button>

        <p className="mt-3 text-center text-[11px] text-fg-dim">
          Paiement sécurisé via Ko-fi · annulation à tout moment depuis ton
          compte Ko-fi
        </p>
      </motion.div>
    </motion.div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent ring-1 ring-accent/30">
        {n}
      </span>
      <span className="text-fg-primary/90">{children}</span>
    </div>
  );
}

// ─── Per-card particles (only render when hovered) ─────────────────────

function CardParticles({ tier, active }: { tier: Tier; active: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensureEngine().then(() => setReady(true));
  }, []);

  const options = useMemo<ISourceOptions>(() => {
    // More particles + brighter for higher tier — feels more luxe.
    const density = tier.key === "supporter" ? 18 : tier.key === "vip" ? 30 : 45;
    return {
      fullScreen: { enable: false },
      background: { color: { value: "transparent" } },
      fpsLimit: 60,
      particles: {
        number: { value: density },
        color: { value: [tier.colors.from, tier.colors.to] },
        shape: { type: tier.key === "legend" ? "star" : "circle" },
        opacity: {
          value: { min: 0.2, max: 0.85 },
          animation: { enable: true, speed: 0.8, sync: false },
        },
        size: {
          value: { min: 0.5, max: tier.key === "legend" ? 2.6 : 1.8 },
        },
        move: {
          enable: true,
          speed: tier.key === "legend" ? 0.6 : 0.3,
          direction: "top",
          random: true,
          straight: false,
          outModes: "out",
        },
      },
      detectRetina: true,
    };
  }, [tier]);

  if (!ready) return null;
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute inset-0 z-0"
        >
          <Particles id={`vip-particles-${tier.key}`} options={options} className="size-full" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Count-up number ───────────────────────────────────────────────────

/**
 * Single shared IntersectionObserver across all CountUp instances. Each
 * CountUp registers its element + a callback; when the element scrolls
 * into view (≥ 40% visible), we fire the callback once and unregister.
 * Replaces "one IO per CountUp" — saves ~3 IO objects on this page and a
 * comparable amount of internal observer tracking.
 */
const countUpCallbacks = new WeakMap<Element, () => void>();
let sharedObserver: IntersectionObserver | null = null;
function ensureSharedObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const cb = countUpCallbacks.get(e.target);
          if (cb) {
            cb();
            countUpCallbacks.delete(e.target);
            sharedObserver?.unobserve(e.target);
          }
        }
      }
    },
    { threshold: 0.4 },
  );
  return sharedObserver;
}

function CountUp({
  to,
  className,
  style,
}: {
  to: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [seen, setSeen] = useState(false);

  // Register with the shared IntersectionObserver — the callback fires
  // exactly once when the element first crosses the threshold.
  useEffect(() => {
    if (!ref.current || seen) return;
    const node = ref.current;
    const obs = ensureSharedObserver();
    countUpCallbacks.set(node, () => setSeen(true));
    obs.observe(node);
    return () => {
      countUpCallbacks.delete(node);
      obs.unobserve(node);
    };
  }, [seen]);

  useEffect(() => {
    if (!seen || !ref.current) return;
    const node = ref.current;
    const controls = animate(0, to, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = latest.toFixed(latest < 10 && to >= 1 ? 0 : 0);
      },
    });
    return () => controls.stop();
  }, [seen, to]);

  return (
    <span ref={ref} className={className} style={style}>
      0
    </span>
  );
}

// ─── Footnote ──────────────────────────────────────────────────────────

function Footnote() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8, duration: 0.6 }}
      className="mt-16 rounded-2xl border border-white/[0.05] bg-bg-soft/40 p-6 text-center text-sm text-fg-muted backdrop-blur-md"
    >
      <Heart className="mx-auto mb-2 size-5 text-fg-dim" strokeWidth={1.5} />
      <p>
        Paiement sécurisé via{" "}
        <a
          href={KOFI_PAGE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            openKofiTiers().catch(() => {});
          }}
        >
          Ko-fi
        </a>
        . Tu peux annuler ton abonnement à tout moment depuis ton compte
        Ko-fi — aucun engagement, chaque mois est reconduit ou annulé
        librement. Merci pour ton soutien 💜
      </p>
    </motion.div>
  );
}
