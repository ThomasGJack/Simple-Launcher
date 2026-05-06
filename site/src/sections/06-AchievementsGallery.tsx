import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementCard } from "@/components/achievements/AchievementCard";
import { ANCHORS } from "../lib/anchors";
import {
  MOCK_ACHIEVEMENTS_GALLERY,
  MOCK_CTX,
} from "../data/mockAchievements";

/**
 * Section 06 — Galerie d'achievements. Grid 12 cards (un mix de
 * tiers et catégories). Filtre client-side par catégorie pour
 * montrer la diversité du système.
 */

const FILTERS = [
  { key: "all" as const, label: "Tous" },
  { key: "onboarding" as const, label: "Premiers pas" },
  { key: "library" as const, label: "Bibliothèque" },
  { key: "playtime" as const, label: "Temps de jeu" },
  { key: "social" as const, label: "Social" },
  { key: "easter-eggs" as const, label: "Easter eggs" },
];

export function AchievementsGallery() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return MOCK_ACHIEVEMENTS_GALLERY;
    return MOCK_ACHIEVEMENTS_GALLERY.filter(
      (entry) => entry.ach.category === filter,
    );
  }, [filter]);

  const stats = useMemo(() => {
    const total = MOCK_ACHIEVEMENTS_GALLERY.length;
    const unlocked = MOCK_ACHIEVEMENTS_GALLERY.filter((e) => e.unlocked).length;
    return { total, unlocked, pct: Math.round((unlocked / total) * 100) };
  }, []);

  return (
    <section id={ANCHORS.achievements} className="section">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Achievements
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            39 badges à{" "}
            <span className="text-glow-accent text-accent">débloquer</span>.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Bronze, argent, or, platine. Certains se débloquent en jouant,
            d'autres en explorant le launcher, d'autres sont des easter eggs
            cryptiques. Chaque achievement a sa rareté affichée — combien de
            membres l'ont vraiment ?
          </p>
        </div>

        {/* Filtres + progress global */}
        <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  "rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.18em] transition " +
                  (filter === f.key
                    ? "bg-accent text-bg-base shadow-[0_0_16px_var(--color-accent-glow)]"
                    : "bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.08] hover:bg-white/[0.08]")
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-full bg-white/[0.03] px-5 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06]">
            <span>
              <strong className="text-fg-primary">{stats.unlocked}</strong> / {stats.total} débloqués
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="font-display text-[var(--color-gold)]">{stats.pct} %</span>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((entry, i) => (
              <motion.div
                key={entry.ach.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <AchievementCard
                  ach={entry.ach}
                  ctx={MOCK_CTX}
                  unlocked={entry.unlocked}
                  unlockedAt={entry.unlockedAt}
                  rarityPercent={entry.rarityPercent ?? null}
                  index={i}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
