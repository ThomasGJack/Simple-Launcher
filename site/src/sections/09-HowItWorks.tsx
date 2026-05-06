import { motion } from "framer-motion";
import { Download, MessageSquare, Castle, Play } from "lucide-react";
import { ANCHORS } from "../lib/anchors";

/**
 * Section 09 — How it works en 4 étapes verticales alternant
 * gauche/droite. Style timeline. La 3ᵉ étape (auto-membre du crew)
 * est mise en valeur avec accent or.
 */

const STEPS = [
  {
    icon: Download,
    title: "Télécharge l'installer",
    body: "~5 MB, signé ed25519. Valide la mise en garde Windows une seule fois (Microsoft Code Signing payant — pas notre priorité), c'est posé. Install ~10 secondes.",
    accent: "cyan" as const,
  },
  {
    icon: MessageSquare,
    title: "Connecte ton Discord",
    body: "OAuth standard, jamais de mot de passe demandé. Les tokens vivent dans le Windows Credential Manager. Tu peux te déconnecter à tout moment depuis les paramètres.",
    accent: "cyan" as const,
  },
  {
    icon: Castle,
    title: "Bienvenue dans Simple Games",
    body: "Au premier login, tu rejoins automatiquement le crew maître. Pas d'invitation à demander, pas de code à coller. Channels, mentions, présence en direct — tout est là.",
    accent: "gold" as const,
  },
  {
    icon: Play,
    title: "Lance, joue, partage",
    body: "Choisis un module dans la bibliothèque. Le crew voit ce que tu lances (si t'as activé Discord RPC). Achievements et heatmap se remplissent au fur et à mesure.",
    accent: "cyan" as const,
  },
];

export function HowItWorks() {
  return (
    <section id={ANCHORS.how} className="section">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow eyebrow-gold">
            <span className="eyebrow-dot" />
            Quatre étapes
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Rejoindre Simple Games.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Pas de configuration manuelle, pas de fichier à déplacer, pas de
            JRE à installer à la main.
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-3xl">
          {/* Ligne verticale centrale */}
          <div className="absolute left-6 top-0 h-full w-px bg-gradient-to-b from-accent/40 via-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] to-accent/20 md:left-1/2 md:-translate-x-1/2" />

          {STEPS.map((step, i) => (
            <Step key={i} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({
  step,
  index,
}: {
  step: (typeof STEPS)[number];
  index: number;
}) {
  const isLeft = index % 2 === 0;
  const isGold = step.accent === "gold";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={
        "relative mb-10 grid gap-6 md:grid-cols-2 " + (isLeft ? "" : "md:[&>*:first-child]:order-2")
      }
    >
      {/* Marker rond */}
      <div
        className={
          "absolute left-6 z-10 -translate-x-1/2 rounded-full p-1 ring-4 ring-bg-base md:left-1/2 " +
          (isGold
            ? "bg-[var(--color-gold)] shadow-[0_0_20px_var(--color-gold-glow)]"
            : "bg-accent shadow-[0_0_20px_var(--color-accent-glow)]")
        }
        style={{ top: 28 }}
      >
        <step.icon className="size-4 text-bg-base" strokeWidth={2.5} />
      </div>

      {/* Card */}
      <div
        className={
          "ml-14 md:ml-0 " +
          (isLeft ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left")
        }
      >
        <div
          className={
            "rounded-2xl p-6 transition " +
            (isGold
              ? "bg-[color-mix(in_srgb,var(--color-gold)_5%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_22%,transparent)]"
              : "glass")
          }
        >
          <div
            className={
              "mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] " +
              (isGold
                ? "bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] text-[var(--color-gold)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_28%,transparent)]"
                : "bg-accent/15 text-accent ring-1 ring-accent/30")
            }
          >
            Étape {String(index + 1).padStart(2, "0")}
          </div>
          <h3 className="font-display text-2xl text-fg-primary">{step.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">{step.body}</p>
        </div>
      </div>

      <div className="hidden md:block" />
    </motion.div>
  );
}
