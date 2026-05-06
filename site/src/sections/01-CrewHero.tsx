import { motion } from "framer-motion";
import { Download, Sparkles } from "lucide-react";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { MascotInline } from "../components/MascotInline";
import { ANCHORS, scrollToAnchor } from "../lib/anchors";

/**
 * Hero — première section. Présente Simple Games (la communauté) en
 * premier, le launcher comme conséquence ("l'outil qu'on s'est fait
 * pour ça"). Eyebrow doré, titre gradient or, mascot pingouin à
 * droite.
 */
export function CrewHero() {
  return (
    <section id={ANCHORS.hero} className="section section--hero relative overflow-hidden">
      {/* Background blobs animés du launcher — même DA que dans l'app */}
      <div className="absolute inset-0">
        <AnimatedBackground />
      </div>

      <div className="container relative z-10">
        <div className="grid items-center gap-16 lg:grid-cols-[1.4fr_1fr]">
          {/* Colonne gauche — texte */}
          <div>
            <motion.span
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="eyebrow eyebrow-gold"
            >
              <span className="eyebrow-dot" />
              Simple Games · La communauté du crew
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-5 font-display text-[clamp(44px,8vw,84px)] leading-[0.95] tracking-tight text-fg-primary"
            >
              Bienvenue
              <br />
              dans le{" "}
              <span
                className="text-glow-gold"
                style={{
                  background:
                    "linear-gradient(90deg, var(--color-gold), var(--color-gold-strong) 60%, #f59e0b)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                crew.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted"
            >
              <strong className="text-fg-primary">Simple Games</strong> — la
              communauté de joueurs.
              <br />
              <strong className="text-fg-primary">Simple Launcher</strong> —
              l'outil qu'on s'est fait pour jouer ensemble. Modpacks Minecraft
              moddés, channels intégrés, profils partageables, auto-update
              signé.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <button
                onClick={() => scrollToAnchor(ANCHORS.download, { offset: 80 })}
                className="group inline-flex items-center gap-3 rounded-2xl bg-accent px-8 py-4 font-display text-sm uppercase tracking-[0.18em] text-bg-base shadow-[0_0_36px_var(--color-accent-glow)] transition hover:scale-[1.03]"
              >
                <Download className="size-5" strokeWidth={2.4} />
                Rejoindre le crew
              </button>
              <button
                onClick={() => scrollToAnchor(ANCHORS.profile, { offset: 80 })}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.04] px-6 py-4 text-sm font-medium text-fg-primary ring-1 ring-white/[0.08] backdrop-blur transition hover:bg-white/[0.08]"
              >
                <Sparkles className="size-4 text-[var(--color-gold)]" />
                Découvrir un profil de membre
              </button>
            </motion.div>

            {/* Mini-meta : version + Windows + signed */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-fg-dim"
            >
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success" />
                Auto-update activé
              </span>
              <span>·</span>
              <span>Windows 10 / 11 64-bit</span>
              <span>·</span>
              <span>Installer signé · ~5 MB</span>
              <span>·</span>
              <span>Sans pub · sans tracking</span>
            </motion.div>
          </div>

          {/* Colonne droite — Mascot + petit "card flottante" */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative flex flex-col items-center gap-6 lg:items-end"
          >
            <div className="flex justify-center">
              <MascotInline size={180} />
            </div>
            <div className="rounded-2xl glass px-5 py-4 text-center text-xs leading-relaxed text-fg-muted backdrop-blur">
              <span className="block font-display text-[10px] uppercase tracking-[0.3em] text-[var(--color-gold)]">
                ★ Crew maître
              </span>
              <span className="mt-1 block font-display text-3xl text-fg-primary">
                Simple Games
              </span>
              <span className="mt-2 block">
                Tous les joueurs du launcher
                <br />
                y sont auto-membres au premier login.
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
