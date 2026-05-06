import { motion, useInView, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef } from "react";
import { Users, Rocket, Clock, Library } from "lucide-react";
import { ANCHORS } from "../lib/anchors";
import { MOCK_STATS, type CommunityStat } from "../data/mockStats";

/**
 * Section 02 — Manifesto crew. Trois colonnes textuelles + grille
 * de 4 chiffres count-up. Le ton : "communauté de joueurs, pas un
 * store" — on est petits, on se connaît, on s'amuse.
 */
export function Manifesto() {
  return (
    <section id={ANCHORS.manifesto} className="section">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="eyebrow eyebrow-gold"
          >
            <span className="eyebrow-dot" />
            Manifesto
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary"
          >
            Une communauté de joueurs,
            <br />
            <span className="text-fg-muted">pas un store.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-5 text-lg text-fg-muted"
          >
            On est un petit crew d'amis qui voulait jouer aux mêmes modpacks
            sans se prendre la tête à coordonner. Simple Games est né du chat
            Discord. Simple Launcher est né du fait qu'on en avait marre de
            jongler entre 4 outils.
          </motion.p>
        </div>

        {/* 3 colonnes pillars */}
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          <Pillar
            delay={0.1}
            label="Auto-membre"
            title="Connecté Discord = membre du crew"
            body="Pas d'invitation à demander, pas de code à copier. Tu te logues, tu fais partie de Simple Games. Le master crew est partagé entre tous les utilisateurs du launcher."
          />
          <Pillar
            delay={0.2}
            label="Profils publics"
            title="Une vitrine partageable"
            body="Chaque membre a un profil public sur /u/ton-id. Avatar, bio, achievements, heatmap de jeu, thème custom. Coller le lien dans un Discord externe ou une bio Twitch, validé."
            highlight
          />
          <Pillar
            delay={0.3}
            label="Présence en direct"
            title="Tu vois qui joue à quoi"
            body="Friends online strip, Discord Rich Presence, sessions de jeu live. Le crew sait quand t'es dispo. Pas de notification spam — juste de l'ambiance partagée."
          />
        </div>

        {/* Stats agrégées — count up */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mt-20 grid gap-6 rounded-3xl glass p-8 md:grid-cols-4"
        >
          {MOCK_STATS.map((stat, i) => (
            <CountUp key={stat.label} stat={stat} delay={i * 0.08} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Pillar({
  delay,
  label,
  title,
  body,
  highlight = false,
}: {
  delay: number;
  label: string;
  title: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      className={
        "group relative rounded-2xl p-6 transition " +
        (highlight
          ? "bg-[color-mix(in_srgb,var(--color-gold)_5%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-gold)_8%,transparent)]"
          : "glass hover:bg-white/[0.05]")
      }
    >
      <div
        className={
          "mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] " +
          (highlight
            ? "bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] text-[var(--color-gold)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_28%,transparent)]"
            : "bg-accent/15 text-accent ring-1 ring-accent/30")
        }
      >
        {label}
      </div>
      <h3 className="font-display text-[20px] leading-tight text-fg-primary">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
    </motion.div>
  );
}

function CountUp({ stat, delay = 0 }: { stat: CommunityStat; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const value = useMotionValue(0);
  const displayRef = useRef<HTMLSpanElement>(null);

  // Pick icon based on label keywords
  const Icon =
    stat.label.toLowerCase().includes("membre")
      ? Users
      : stat.label.toLowerCase().includes("partie")
        ? Rocket
        : stat.label.toLowerCase().includes("heure")
          ? Clock
          : Library;

  useEffect(() => {
    if (!inView) return;
    const controls = animate(value, stat.value, {
      duration: stat.duration ?? 1.6,
      ease: "easeOut",
      delay,
      onUpdate: (latest) => {
        if (displayRef.current) {
          const formatted = Math.round(latest).toLocaleString("fr-FR");
          displayRef.current.textContent = formatted;
        }
      },
    });
    return () => controls.stop();
  }, [inView, stat, delay, value]);

  return (
    <div ref={ref} className="text-center">
      <Icon className="mx-auto mb-3 size-6 text-[var(--color-gold)]" strokeWidth={1.8} />
      <div className="font-display text-4xl text-fg-primary tabular-nums">
        <span ref={displayRef}>0</span>
        {stat.unit && (
          <span className="ml-1 text-2xl text-fg-muted">{stat.unit}</span>
        )}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-[0.2em] text-fg-dim">
        {stat.label}
      </div>
    </div>
  );
}
