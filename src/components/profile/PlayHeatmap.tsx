import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock } from "lucide-react";
import { cellKey, watchHeatmap, type Heatmap } from "@/firebase/playHeatmap";
import { cn } from "@/lib/cn";

/**
 * Renders a 7 × 24 heatmap of game launches. Used on Profile (own)
 * and PublicProfilePage (friend) — the same component, just
 * different `uid`.
 *
 * Visual style is GitHub contributions calendar : darker = more
 * launches at that time slot. Hovering a cell shows a tooltip
 * with day/hour/count. Empty heatmap → friendly empty state.
 */
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function PlayHeatmap({
  uid,
  title = "Heures de jeu",
  subtitle,
  /** Override the displayed total. Useful when caller wants to
   *  use a different counter (e.g. session count vs launch count). */
  totalOverride,
}: {
  uid: string;
  title?: string;
  subtitle?: string;
  totalOverride?: number;
}) {
  const [heatmap, setHeatmap] = useState<Heatmap>({
    cells: {},
    totalLaunches: 0,
    updatedAtMs: null,
  });

  useEffect(() => {
    if (!uid) return;
    return watchHeatmap(uid, setHeatmap);
  }, [uid]);

  const max = useMemo(() => {
    let m = 0;
    for (const v of Object.values(heatmap.cells)) {
      if (v > m) m = v;
    }
    return m;
  }, [heatmap.cells]);

  const total = totalOverride ?? heatmap.totalLaunches;

  /**
   * Bucket an integer count into 0-4 levels. Mirrors the GitHub
   * calendar's "no activity / very low / low / mid / high" tiers.
   * The thresholds scale with the user's max so a casual player
   * with peak=3 gets the same darkness gradient as a hardcore
   * player with peak=300.
   */
  const cellLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
    if (count === 0 || max === 0) return 0;
    const ratio = count / max;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // `w-full` forces the card to fill its parent container — without
      // it, motion.div shrinks to the natural width of its smallest
      // child (e.g. the empty-state block has no min-width), which made
      // the card collapse into a tall narrow column on resized
      // launcher windows. With w-full the parent's max-w-* governs.
      className="w-full rounded-2xl glass p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
            <Calendar className="size-3 shrink-0" />
            <span className="truncate">{title}</span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {subtitle ?? "Distribution des lancements de jeu par heure et jour de la semaine."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl text-fg-primary tabular-nums">
            {total}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-fg-dim">
            lancements
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="grid min-h-32 w-full place-items-center px-2 text-center text-xs text-fg-muted">
          <div className="max-w-sm">
            <Clock className="mx-auto mb-2 size-5 text-fg-dim" />
            Pas encore de données — la heatmap se construit au fur et à
            mesure des lancements de jeu.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            {/* Hour labels (every 3 hours to keep it readable) */}
            <div
              className="ml-10 grid gap-[2px] pb-1"
              style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="text-center text-[8px] text-fg-dim tabular-nums"
                  style={{ visibility: h % 3 === 0 ? "visible" : "hidden" }}
                >
                  {h}h
                </div>
              ))}
            </div>
            {/* Grid : 7 rows × 24 cols */}
            <div className="space-y-[2px]">
              {DAYS.map((day, dayIdx) => (
                <div key={day} className="flex items-center gap-2">
                  <div className="w-8 shrink-0 text-right text-[10px] text-fg-dim">
                    {day}
                  </div>
                  <div
                    className="grid flex-1 gap-[2px]"
                    style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
                  >
                    {HOURS.map((hour) => {
                      const count = heatmap.cells[cellKey(dayIdx, hour)] ?? 0;
                      const level = cellLevel(count);
                      return (
                        <div
                          key={hour}
                          className={cn(
                            "aspect-square rounded-[2px] transition-colors",
                            CELL_BG[level],
                          )}
                          title={`${day} ${hour}h — ${count} lancement${count > 1 ? "s" : ""}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {total > 0 && (
        <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-fg-dim">
          <span>Moins</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className={cn("size-2.5 rounded-[2px]", CELL_BG[l as 0 | 1 | 2 | 3 | 4])}
            />
          ))}
          <span>Plus</span>
        </div>
      )}
    </motion.div>
  );
}

// Tailwind grid-cols-24 isn't a default ; we add it inline via
// arbitrary classes below by referring to the existing accent color
// palette. Each level is a color-mix between transparent and accent.
const CELL_BG: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-white/[0.04]",
  1: "bg-accent/15",
  2: "bg-accent/35",
  3: "bg-accent/60",
  4: "bg-accent/90",
};
