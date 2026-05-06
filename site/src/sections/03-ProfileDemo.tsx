import { motion } from "framer-motion";
import { ArrowUpRight, Pin, Trophy } from "lucide-react";
import { PlayHeatmapView } from "@/components/profile/PlayHeatmapView";
import { AchievementCard } from "@/components/achievements/AchievementCard";
import { TierBannerOverlay } from "@/components/tier/TierBanner";
import { ANCHORS } from "../lib/anchors";
import { MOCK_HEATMAP_PERSONAL } from "../data/mockHeatmap";
import { MOCK_ACHIEVEMENTS_PROFILE, MOCK_CTX } from "../data/mockAchievements";

/**
 * Section 03 — Démo profil public. Reproduit côté site web l'écran
 * profil du launcher avec données mockées. Montre concrètement à
 * quoi ressemble la "vitrine" partageable d'un membre du crew.
 */
export function ProfileDemo() {
  return (
    <section id={ANCHORS.profile} className="section">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow eyebrow-gold">
            <span className="eyebrow-dot" />
            Profil de membre
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Voici à quoi ressemble{" "}
            <span className="text-glow-accent text-accent">ton profil</span>{" "}
            dans le crew.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Avatar, bio, achievements, heatmap de jeu en direct, modules
            épinglés, thème custom. Tout en un seul lien partageable.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto mt-14 max-w-5xl"
        >
          {/* Card profil — wrappée par TierBannerOverlay (VIP) */}
          <div className="relative overflow-hidden rounded-3xl bg-bg-soft p-6 ring-1 ring-white/[0.06] md:p-8">
            <TierBannerOverlay tier="vip" rounded="3xl" />

            {/* Banner */}
            <div
              className="relative mb-6 h-32 overflow-hidden rounded-2xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(168,85,247,0.2) 60%, rgba(252,211,77,0.18))",
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(0,212,255,0.18),transparent_60%),radial-gradient(circle_at_80%_40%,rgba(252,211,77,0.16),transparent_60%)]" />
            </div>

            {/* Header — avatar + nom + bio */}
            <div className="flex flex-wrap items-end gap-5">
              <div className="-mt-16 size-24 shrink-0 rounded-2xl bg-gradient-to-br from-accent to-fuchsia-500 ring-4 ring-bg-soft md:size-28">
                <div className="grid size-full place-items-center font-display text-3xl text-bg-base">
                  G
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-display text-2xl text-fg-primary">goule</h3>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_30%,transparent)]"
                  >
                    ★ Crew maître
                  </span>
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  4 ans dans le crew · Voit la nuit · Modpack hardcore enjoyer
                </p>
              </div>
              <a
                href="/u/discord_306118713537462273"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-4 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
              >
                Voir le vrai profil
                <ArrowUpRight className="size-4" />
              </a>
            </div>

            {/* Body — heatmap + achievements en row */}
            <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <PlayHeatmapView
                heatmap={MOCK_HEATMAP_PERSONAL}
                title="Quand goule joue"
                subtitle="Heatmap personnelle 7 jours × 24 heures"
              />

              <div className="flex flex-col gap-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
                  <Trophy className="size-3" />
                  Achievements récents
                </div>
                {MOCK_ACHIEVEMENTS_PROFILE.map((entry, i) => (
                  <AchievementCard
                    key={entry.ach.id}
                    ach={entry.ach}
                    ctx={MOCK_CTX}
                    unlocked={entry.unlocked}
                    unlockedAt={entry.unlockedAt}
                    rarityPercent={entry.rarityPercent ?? null}
                    index={i}
                    compact
                  />
                ))}
                <div className="mt-1 flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 text-xs text-fg-muted ring-1 ring-white/[0.06]">
                  <span className="inline-flex items-center gap-2">
                    <Pin className="size-3" /> 3 modules épinglés
                  </span>
                  <span>+ 24 autres achievements</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
