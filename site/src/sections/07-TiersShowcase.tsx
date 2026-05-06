import { motion } from "framer-motion";
import { Heart, Crown, Sparkles, ExternalLink } from "lucide-react";
import { TierBannerOverlay } from "@/components/tier/TierBanner";
import { ANCHORS } from "../lib/anchors";

/**
 * Section 07 — Showcase des 3 tiers de soutien (Soutien / VIP /
 * Légende), chacun wrappé par TierBannerOverlay. La beauté du
 * composant launcher (border conveyor-belt, halo multi-color)
 * porte la section.
 */

type Tier = {
  key: "supporter" | "vip" | "legend";
  label: string;
  price: string;
  icon: typeof Heart;
  perks: string[];
};

const TIERS: Tier[] = [
  {
    key: "supporter",
    label: "Soutien",
    price: "1 €",
    icon: Heart,
    perks: [
      "Bordure bronze animée",
      "Halo bronze pulsant sur ton avatar",
      "Bandeau \"Soutien\" sur ton profil public",
      "Notre reconnaissance éternelle",
    ],
  },
  {
    key: "vip",
    label: "VIP",
    price: "5 €",
    icon: Sparkles,
    perks: [
      "Tout du tier Soutien",
      "Bordure cyan→violet animée (conveyor belt)",
      "Glow saturé multi-couleur",
      "Création de tes propres crews privés",
      "3D tilt sur les cartes profil",
    ],
  },
  {
    key: "legend",
    label: "Légende",
    price: "10 €",
    icon: Crown,
    perks: [
      "Tout du tier VIP",
      "Bordure rainbow conveyor + halo multicouleur",
      "Effets visuels premium réservés (count-up, ribbon shimmer)",
      "Particules dorées sur tes interactions",
      "Tier display dans le crew master",
    ],
  },
];

export function TiersShowcase() {
  return (
    <section id={ANCHORS.tiers} className="section">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow eyebrow-gold">
            <span className="eyebrow-dot" />
            Soutiens si tu kiffes
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Trois manières de{" "}
            <span
              className="text-glow-gold"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-gold), var(--color-gold-strong))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              décorer
            </span>{" "}
            ton profil.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            <strong className="text-fg-primary">Tout le contenu reste gratuit</strong>{" "}
            — les tiers Ko-fi débloquent uniquement de la décoration. Pas de
            fonctionnalité bloquée derrière un paywall, jamais. C'est juste un
            moyen de soutenir le projet si tu le veux.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative overflow-hidden rounded-3xl bg-bg-soft p-7 ring-1 ring-white/[0.06]"
            >
              <TierBannerOverlay tier={tier.key} rounded="3xl" />

              <div className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-white/[0.06]">
                    <tier.icon className="size-5 text-fg-primary" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="font-display text-xl text-fg-primary">{tier.label}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-fg-muted">
                      Tier
                    </div>
                  </div>
                </div>

                <div className="my-6 flex items-baseline gap-2">
                  <span className="font-display text-4xl text-fg-primary">{tier.price}</span>
                  <span className="text-sm text-fg-muted">/ mois</span>
                </div>

                <ul className="flex flex-col gap-2 text-sm text-fg-muted">
                  {tier.perks.map((perk, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="https://ko-fi.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-5 py-3 text-sm font-medium text-fg-primary ring-1 ring-white/[0.08] transition hover:bg-white/[0.12]"
                >
                  Souscrire via Ko-fi
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-fg-dim">
          Paiement géré par Ko-fi. Annulable à tout moment depuis ton compte
          Ko-fi. Aucun engagement, aucune relance — si tu arrêtes le tier
          disparaît au bout de 35 jours sans paiement.
        </p>
      </div>
    </section>
  );
}
