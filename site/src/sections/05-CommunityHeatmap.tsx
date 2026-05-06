import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { PlayHeatmapView } from "@/components/profile/PlayHeatmapView";
import { ANCHORS } from "../lib/anchors";
import { MOCK_HEATMAP_COMMUNITY } from "../data/mockHeatmap";

/**
 * Section 05 — Heatmap collective de la communauté. Pleine largeur,
 * "Le crew vit la nuit" — un constat qui ressort des données.
 * À côté : top 5 heures de pic + une accroche poétique sur le rythme
 * du crew.
 */

const PEAK_HOURS = [
  { day: "Sam", hour: "21h", launches: 142 },
  { day: "Sam", hour: "20h", launches: 138 },
  { day: "Dim", hour: "21h", launches: 135 },
  { day: "Dim", hour: "20h", launches: 128 },
  { day: "Ven", hour: "22h", launches: 96 },
];

export function CommunityHeatmap() {
  return (
    <section id={ANCHORS.heatmap} className="section relative overflow-hidden">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Activité du crew
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Le crew vit{" "}
            <span className="text-glow-accent text-accent">la nuit.</span>
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Heatmap collective des lancements de jeu. Le pic est le samedi
            soir 20h-22h, mais on a aussi quelques curieux à midi en
            semaine.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="mt-14 grid gap-6 lg:grid-cols-[1.7fr_1fr]"
        >
          <PlayHeatmapView
            heatmap={MOCK_HEATMAP_COMMUNITY}
            title="Heatmap collective"
            subtitle="Distribution des lancements toutes plateformes / tous joueurs confondus"
          />

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl glass p-5">
              <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
                <Moon className="size-3" />
                Top 5 heures de pic
              </div>
              <div className="flex flex-col gap-2">
                {PEAK_HOURS.map((p, i) => {
                  const max = PEAK_HOURS[0].launches;
                  const pct = (p.launches / max) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-12 shrink-0 text-xs text-fg-muted">
                        {p.day} · {p.hour}
                      </div>
                      <div className="flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pct}%` }}
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.8,
                            delay: i * 0.08,
                            ease: "easeOut",
                          }}
                          className="h-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent-glow)]"
                        />
                      </div>
                      <div className="w-10 shrink-0 text-right font-display text-sm tabular-nums text-fg-primary">
                        {p.launches}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-[color-mix(in_srgb,var(--color-gold)_5%,transparent)] p-5 ring-1 ring-[color-mix(in_srgb,var(--color-gold)_20%,transparent)]">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[var(--color-gold)]">
                <Sun className="size-3" />
                Le saviez-vous ?
              </div>
              <p className="text-sm leading-relaxed text-fg-muted">
                <strong className="text-fg-primary">3h-7h du matin</strong>{" "}
                est le créneau le plus mort. Si tu joues à cette heure, t'es
                en passe de débloquer{" "}
                <em className="text-[var(--color-gold)]">noctambule</em>{" "}
                (achievement secret).
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
