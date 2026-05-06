import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Library,
  Users,
  Castle,
  User,
  Settings,
  Sparkles,
  CheckCircle2,
  X,
  ArrowLeft,
} from "lucide-react";
import { useUIStore, type Route } from "@/store/ui";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Multi-step guided tour shown after the WelcomeModal on the very
 * first boot of a fresh install. Re-launchable from Settings (via
 * the "Refaire le tour" entry) at any time.
 *
 * Each step is a card with an icon + title + body + a CTA that
 * navigates the user to the relevant page (so they see the actual
 * UI, not just an explanation). The tour is dismissible at any
 * step ; completion + dismissal both flip the LS flag so it
 * doesn't replay on the next boot.
 */
const LS_ONBOARDING_DONE = "launcher.onboardingDone";

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(LS_ONBOARDING_DONE) === "1";
  } catch {
    return true; // graceful : if LS broken, treat as done so we don't loop
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(LS_ONBOARDING_DONE, "1");
  } catch {
    /* non-fatal */
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(LS_ONBOARDING_DONE);
  } catch {
    /* non-fatal */
  }
}

type Step = {
  id: string;
  icon: typeof Library;
  iconColor: string;
  glowColor: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaRoute: Route | null; // null = no nav, just close
};

const STEPS: Step[] = [
  {
    id: "library",
    icon: Library,
    iconColor: "#00d4ff",
    glowColor: "rgba(0, 212, 255, 0.4)",
    title: "Ta bibliothèque de jeux",
    body: "Tous tes jeux Simple Launcher (Minecraft, mods, jeux hosted) en un seul endroit. Lance-les en un clic, vois tes statistiques de temps de jeu, et garde tes saves locales.",
    ctaLabel: "Voir la bibliothèque",
    ctaRoute: { name: "library" },
  },
  {
    id: "community",
    icon: Users,
    iconColor: "#a855f7",
    glowColor: "rgba(168, 85, 247, 0.4)",
    title: "La communauté",
    body: "Vois qui est en ligne, ce que tes amis jouent en ce moment, et envoie des invitations à des sessions. Système de présence live mis à jour toutes les 30 secondes.",
    ctaLabel: "Découvrir la communauté",
    ctaRoute: { name: "community" },
  },
  {
    id: "crews",
    icon: Castle,
    iconColor: "#fcd34d",
    glowColor: "rgba(252, 211, 77, 0.4)",
    title: "Les crews",
    body: "Channels Discord-style pour discuter avec ta team. Crews publics à rejoindre librement, ou crées le tien (réservé aux supporters Ko-fi). Overlay Shift+F9 pour chatter sans quitter le jeu.",
    ctaLabel: "Voir les crews",
    ctaRoute: { name: "crews" },
  },
  {
    id: "profile",
    icon: User,
    iconColor: "#4ade80",
    glowColor: "rgba(74, 222, 128, 0.4)",
    title: "Ton profil",
    body: "Tes stats, tes achievements (50 à débloquer), ta heatmap d'heures de jeu, et un lien public partageable pour montrer ton profil aux potes. Personnalisable via les tiers Soutien / VIP / Légende.",
    ctaLabel: "Voir mon profil",
    ctaRoute: { name: "profile" },
  },
  {
    id: "settings",
    icon: Settings,
    iconColor: "#94a3b8",
    glowColor: "rgba(148, 163, 184, 0.4)",
    title: "Paramètres & sons",
    body: "Customize tout : couleur d'accent, animations, sons d'interface (avec preview), notifications natives Windows par type, raccourci global pour l'overlay in-game. Diagnostic système intégré pour debug rapide.",
    ctaLabel: "Ouvrir les paramètres",
    ctaRoute: { name: "settings" },
  },
  {
    id: "done",
    icon: Sparkles,
    iconColor: "#00d4ff",
    glowColor: "rgba(0, 212, 255, 0.5)",
    title: "Tu es prêt(e) à décoller !",
    body: "Tu peux refaire ce tour à tout moment depuis Paramètres → \"Refaire le tour de présentation\". Bon jeu !",
    ctaLabel: "Démarrer",
    ctaRoute: null,
  },
];

export function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const navigate = useUIStore((s) => s.navigate);
  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;

  // Escape to skip / close. Same convention as the rest of the
  // launcher's modals.
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

  const handleVisit = () => {
    if (!step.ctaRoute) {
      // "Démarrer" button on the last step → finish + close.
      markOnboardingDone();
      onClose();
      return;
    }
    sounds.click();
    navigate(step.ctaRoute);
    // Close the tour so the user sees the page they navigated to.
    // We mark as done here too — visiting any step counts as "got it".
    markOnboardingDone();
    onClose();
  };

  const handleSkip = () => {
    sounds.click();
    markOnboardingDone();
    onClose();
  };

  const Icon = step.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/80 p-6 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring", stiffness: 240, damping: 22 },
        }}
        exit={{ opacity: 0, scale: 0.95, y: 16, transition: { duration: 0.18 } }}
        className="relative w-full max-w-xl overflow-hidden rounded-3xl glass-strong shadow-[0_40px_100px_rgba(0,0,0,0.7)] ring-1 ring-accent/30"
      >
        {/* Animated halo behind the icon */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: step.glowColor }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Skip button — top right */}
        <button
          type="button"
          onClick={handleSkip}
          className="no-drag absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-fg-dim transition-colors hover:bg-white/[0.04] hover:text-fg-muted"
          aria-label="Passer le tour"
        >
          Passer <X className="size-3" />
        </button>

        {/* Step indicator dots — top center */}
        <div className="relative pt-7">
          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.id}
                animate={{
                  width: i === stepIdx ? 20 : 6,
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
          <div className="mt-2 text-center text-[10px] uppercase tracking-[0.25em] text-fg-dim">
            Étape {stepIdx + 1} / {STEPS.length}
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
            className="relative px-9 pb-8 pt-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{
                scale: 1,
                rotate: 0,
                transition: { type: "spring", stiffness: 280, damping: 18 },
              }}
              className="relative mx-auto mb-5 grid size-16 place-items-center rounded-2xl ring-1"
              style={{
                background: `color-mix(in srgb, ${step.iconColor} 18%, transparent)`,
                color: step.iconColor,
                boxShadow: `0 0 28px ${step.glowColor}`,
                ["--tw-ring-color" as string]: step.iconColor + "66",
              }}
            >
              {isLast ? (
                <Sparkles className="size-8" strokeWidth={2} />
              ) : (
                <Icon className="size-8" strokeWidth={2} />
              )}
            </motion.div>

            <h2 className="font-display text-2xl text-fg-primary">
              {step.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              {step.body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Footer — back + next/visit + done */}
        <div className="relative flex items-center justify-between border-t border-white/[0.06] bg-bg-base/30 px-6 py-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={isFirst}
            className={cn(
              "no-drag inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
              isFirst
                ? "cursor-not-allowed text-fg-dim opacity-40"
                : "text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary",
            )}
          >
            <ArrowLeft className="size-3.5" /> Retour
          </button>

          <div className="flex items-center gap-2">
            {/* Visit button — only when there's a target route. The
                "Démarrer" final step uses the same button slot for
                its end-the-tour action. */}
            {step.ctaRoute && (
              <button
                type="button"
                onClick={handleVisit}
                className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-medium text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-fg-primary"
              >
                {step.ctaLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold shadow-[0_0_16px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_24px_var(--color-accent-glow)]"
              style={{ color: "var(--color-on-accent)" }}
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="size-3.5" /> {step.ctaLabel}
                </>
              ) : (
                <>
                  Suivant <ArrowRight className="size-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
