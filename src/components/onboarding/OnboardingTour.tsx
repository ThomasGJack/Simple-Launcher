import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Library,
  Users,
  Castle,
  User,
  Settings,
  Sparkles,
  CheckCircle2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useUIStore, type Route } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Coach-mark / spotlight onboarding tour.
 *
 * Replaces the previous fullscreen-modal tour. The user requested :
 *   1. Buttons that actually work (the previous Suivant button was
 *      getting clipped at narrow widths because of footer overflow).
 *   2. The tour to STAY OPEN after navigating, and put the relevant
 *      Sidebar button in spotlight ("voici ta bibliothèque").
 *
 * New behaviour :
 *   - On step entry, navigate to the matching route and spotlight the
 *     Sidebar nav button (data-tour-target="library" / "community" /
 *     "crews" / "profile" / "settings").
 *   - The card floats top-right, doesn't take focus away from the page.
 *   - Backdrop is dimmed except for a hole around the spotlighted
 *     element + an animated cyan ring around it.
 *   - User clicks Suivant → step++ → re-navigate + re-spotlight.
 *   - Final step is centered with no spotlight ("Tu es prêt").
 *
 * Architecture :
 *   - `useTargetRect` : ResizeObserver + scroll/window listeners that
 *     keep the spotlight bbox up to date as the page reflows.
 *   - SVG mask in the backdrop creates the cutout.
 *   - The card is a motion.div anchored to viewport top-right, animates
 *     between steps via AnimatePresence.
 */

const LS_ONBOARDING_DONE = "launcher.onboardingDone";

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(LS_ONBOARDING_DONE) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(LS_ONBOARDING_DONE, "1");
  } catch {
    /* non-fatal */
  }
}

type Step = {
  id: string;
  /** Navigate here when the step opens. `null` = no navigation
   *  (used by the final "Tu es prêt" step). */
  route: Route | null;
  /** CSS-attribute selector for the Sidebar nav button to spotlight.
   *  `null` = no spotlight (final step, centered card). */
  spotlight: string | null;
  icon: LucideIcon;
  iconColor: string;
  glowColor: string;
  title: string;
  body: string;
};

const STEPS_BASE: Step[] = [
  {
    id: "library",
    route: { name: "library" },
    spotlight: '[data-tour-target="library"]',
    icon: Library,
    iconColor: "#00d4ff",
    glowColor: "rgba(0, 212, 255, 0.4)",
    title: "Ta bibliothèque",
    body: "Tous tes jeux Simple Launcher (Minecraft, mods, jeux hosted) en un seul endroit. Lance-les en un clic, vois tes statistiques de temps de jeu, et garde tes saves locales.",
  },
  {
    id: "community",
    route: { name: "community" },
    spotlight: '[data-tour-target="community"]',
    icon: Users,
    iconColor: "#a855f7",
    glowColor: "rgba(168, 85, 247, 0.4)",
    title: "La communauté",
    body: "Vois qui est en ligne, ce que tes amis jouent en ce moment, et envoie des invitations à des sessions. Présence live mise à jour toutes les 30 secondes.",
  },
  {
    id: "crews",
    route: { name: "crews" },
    spotlight: '[data-tour-target="crews"]',
    icon: Castle,
    iconColor: "#fcd34d",
    glowColor: "rgba(252, 211, 77, 0.4)",
    title: "Les crews",
    body: "Channels Discord-style pour discuter avec ta team. Crews publics à rejoindre librement, ou crées le tien (réservé aux supporters Ko-fi). Overlay Shift+F9 pour chatter sans quitter le jeu.",
  },
  {
    id: "profile",
    route: { name: "profile" }, // overridden at runtime if user has a uid
    spotlight: '[data-tour-target="profile"]',
    icon: User,
    iconColor: "#4ade80",
    glowColor: "rgba(74, 222, 128, 0.4)",
    title: "Ton profil",
    body: "Tes stats, achievements (50 à débloquer), heatmap d'heures de jeu, et un lien public partageable. Customisable via les tiers Soutien / VIP / Légende.",
  },
  {
    id: "settings",
    route: { name: "settings" },
    spotlight: '[data-tour-target="settings"]',
    icon: Settings,
    iconColor: "#94a3b8",
    glowColor: "rgba(148, 163, 184, 0.4)",
    title: "Paramètres & sons",
    body: "Customize tout : couleur d'accent, animations, sons d'interface (avec preview), notifications natives Windows par type, raccourci global pour l'overlay in-game.",
  },
  {
    id: "done",
    route: null,
    spotlight: null,
    icon: Sparkles,
    iconColor: "#00d4ff",
    glowColor: "rgba(0, 212, 255, 0.5)",
    title: "Tu es prêt(e) à décoller !",
    body: "Tu peux refaire ce tour à tout moment depuis Paramètres → \"Refaire le tour de présentation\". Bon jeu !",
  },
];

/**
 * Hook that tracks the bounding rect of an element matching the given
 * CSS selector. Returns null when the selector resolves to nothing
 * (e.g. wrong route, element not yet mounted).
 *
 * Updates on : initial mount, window resize, document scroll, page
 * route change (consumer passes `routeKey` to force re-measurement).
 */
function useTargetRect(selector: string | null, routeKey: string): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    };

    // Defer until the page transition has likely settled — Tauri pages
    // fade-in over ~300ms. Re-measure a couple of times during the
    // transition to catch the final layout.
    measure();
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 320);

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // routeKey forces re-measurement when the user navigates between
    // tour steps — the target element might be hidden / re-mounted.
  }, [selector, routeKey]);

  return rect;
}

export function OnboardingTour({ onClose }: { onClose: () => void }) {
  const navigate = useUIStore((s) => s.navigate);
  const route = useUIStore((s) => s.route);
  const me = useAuthStore((s) => s.user);
  const [stepIdx, setStepIdx] = useState(0);

  // The "profile" step targets PublicProfilePage for the current user
  // when we have a uid (the avatar in Sidebar opens `user-profile`,
  // not `profile`). Falls back to the bare `profile` route for users
  // without a session (rare during onboarding but handled).
  const steps: Step[] = STEPS_BASE.map((s) =>
    s.id === "profile" && me?.uid
      ? { ...s, route: { name: "user-profile", uid: me.uid } }
      : s,
  );

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const isFirst = stepIdx === 0;

  const targetRect = useTargetRect(step.spotlight, route.name + stepIdx);

  // Auto-navigate to the step's route when the step changes.
  useEffect(() => {
    if (step.route) {
      navigate(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // Escape to skip / close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markOnboardingDone();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleNext = () => {
    sounds.click();
    if (isLast) {
      markOnboardingDone();
      onClose();
      return;
    }
    setStepIdx((i) => i + 1);
  };

  const handleBack = () => {
    if (isFirst) return;
    sounds.click();
    setStepIdx((i) => i - 1);
  };

  const handleSkip = () => {
    sounds.click();
    markOnboardingDone();
    onClose();
  };

  const Icon = step.icon;

  // Spotlight rect with padding around the target element. The
  // backdrop hole is rendered at this size, slightly larger than
  // the target so it has breathing room.
  const PAD = 8;
  const padded = targetRect
    ? {
        x: Math.max(0, targetRect.left - PAD),
        y: Math.max(0, targetRect.top - PAD),
        w: targetRect.width + PAD * 2,
        h: targetRect.height + PAD * 2,
        radius: 14,
      }
    : null;

  return (
    <>
      {/* Backdrop with spotlight cutout. SVG mask creates the hole
          where the targeted Sidebar button is. When `padded` is
          null (final step or unmounted target), no cutout — just a
          uniform dim. */}
      <motion.svg
        key="tour-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        // pointer-events-none on the SVG so clicks pass through to
        // the underlying UI — including the spotlighted Sidebar
        // button (the user can actually click "Bibliothèque" while
        // the tour highlights it). The card itself sits above and
        // captures its own clicks normally.
        className="pointer-events-none fixed inset-0 z-[55] h-screen w-screen"
      >
        <defs>
          <mask id="tour-cutout">
            <rect width="100%" height="100%" fill="white" />
            {padded && (
              <motion.rect
                animate={{
                  x: padded.x,
                  y: padded.y,
                  width: padded.w,
                  height: padded.h,
                }}
                transition={{ type: "spring", stiffness: 360, damping: 32 }}
                rx={padded.radius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(2, 4, 8, 0.65)"
          mask="url(#tour-cutout)"
        />
        {/* Animated glowing ring around the spotlight target */}
        {padded && (
          <motion.rect
            animate={{
              x: padded.x - 2,
              y: padded.y - 2,
              width: padded.w + 4,
              height: padded.h + 4,
            }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            rx={padded.radius + 2}
            fill="none"
            stroke={step.iconColor}
            strokeWidth="2"
            style={{
              filter: `drop-shadow(0 0 12px ${step.iconColor}) drop-shadow(0 0 28px ${step.glowColor})`,
            }}
          >
            <animate
              attributeName="stroke-opacity"
              values="0.4;1;0.4"
              dur="2s"
              repeatCount="indefinite"
            />
          </motion.rect>
        )}
      </motion.svg>

      {/* Floating coach card. Bottom-right by default ; centered on
          the final "Done" step for a polished close. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{
            opacity: 0,
            x: isLast ? 0 : 32,
            scale: isLast ? 0.95 : 0.97,
          }}
          animate={{
            opacity: 1,
            x: 0,
            scale: 1,
            transition: { type: "spring", stiffness: 280, damping: 28 },
          }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
          className={cn(
            "no-drag fixed z-[60]",
            isLast
              ? "left-1/2 top-1/2 w-[28rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2"
              : "bottom-6 right-6 w-[26rem] max-w-[92vw]",
          )}
        >
          <div className="relative overflow-hidden rounded-2xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.08]">
            {/* Accent glow halo */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl"
              style={{ background: step.glowColor }}
              animate={{ opacity: [0.25, 0.55, 0.25] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Skip button */}
            <button
              type="button"
              onClick={handleSkip}
              className="no-drag absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-fg-dim transition-colors hover:bg-white/[0.04] hover:text-fg-muted"
              aria-label="Passer le tour"
            >
              Passer <X className="size-3" />
            </button>

            {/* Step indicator */}
            <div className="relative px-5 pb-2 pt-5">
              <div className="flex items-center justify-center gap-1.5">
                {steps.map((s, i) => (
                  <motion.div
                    key={s.id}
                    animate={{
                      width: i === stepIdx ? 18 : 5,
                      opacity: i <= stepIdx ? 1 : 0.3,
                    }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "h-1.5 rounded-full",
                      i <= stepIdx ? "bg-accent" : "bg-white/[0.15]",
                    )}
                  />
                ))}
              </div>
              <div className="mt-1.5 text-center text-[9px] uppercase tracking-[0.25em] text-fg-dim">
                Étape {stepIdx + 1} / {steps.length}
              </div>
            </div>

            {/* Content */}
            <div className="relative px-5 pb-5 pt-3">
              <div className="flex items-start gap-4">
                <motion.div
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{
                    scale: 1,
                    rotate: 0,
                    transition: { type: "spring", stiffness: 280, damping: 18 },
                  }}
                  className="grid size-12 shrink-0 place-items-center rounded-2xl ring-1"
                  style={{
                    background: `color-mix(in srgb, ${step.iconColor} 18%, transparent)`,
                    color: step.iconColor,
                    boxShadow: `0 0 22px ${step.glowColor}`,
                    ["--tw-ring-color" as string]: step.iconColor + "55",
                  }}
                >
                  <Icon className="size-6" strokeWidth={2} />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl text-fg-primary">
                    {step.title}
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
                    {step.body}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer — back / skip / next */}
            <div className="relative flex items-center gap-2 border-t border-white/[0.06] bg-bg-base/30 px-4 py-3">
              <button
                type="button"
                onClick={handleBack}
                disabled={isFirst}
                className={cn(
                  "no-drag inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
                  isFirst
                    ? "cursor-not-allowed text-fg-dim opacity-40"
                    : "text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary",
                )}
              >
                <ArrowLeft className="size-3" /> Retour
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleNext}
                  className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold shadow-[0_0_14px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_22px_var(--color-accent-glow)]"
                  style={{ color: "var(--color-on-accent)" }}
                >
                  {isLast ? (
                    <>
                      <CheckCircle2 className="size-3.5" /> Démarrer
                    </>
                  ) : (
                    <>
                      Suivant <ArrowRight className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
