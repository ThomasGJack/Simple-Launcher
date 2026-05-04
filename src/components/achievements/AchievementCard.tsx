import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Sparkles } from "lucide-react";
import {
  TIER_STYLES,
  computeProgress,
  formatProgress,
  progressPercent,
  type Achievement,
  type AchievementContext,
} from "@/lib/achievements";
import { cn } from "@/lib/cn";

/**
 * Render a single achievement entry in the gallery / showcase grid. The
 * card contracts and expands its level of detail based on:
 *
 *  - `unlocked`     → full color, glow, unlock date pill.
 *  - `locked`       → grayscale icon, dimmed text, optional progress bar
 *                     when the achievement has a numeric track.
 *  - `secret + locked` → silhouette + cryptic hint (or "???" if no hint
 *                       is configured), no title spoiler.
 *
 * Optionally accepts a `rarityPercent` to display under the title — the
 * % of the launcher's user base that has unlocked the same badge.
 */
export function AchievementCard({
  ach,
  ctx,
  unlocked,
  unlockedAt,
  rarityPercent,
  index = 0,
  compact = false,
}: {
  ach: Achievement;
  ctx: AchievementContext;
  unlocked: boolean;
  unlockedAt?: number | null;
  rarityPercent?: number | null;
  index?: number;
  /** Tighter padding + smaller fonts — used by the showcase strip on
   *  PublicProfilePage where space is at a premium. */
  compact?: boolean;
}) {
  const tier = TIER_STYLES[ach.tier];
  const Icon = ach.icon;
  const isHidden = ach.secret && !unlocked;
  const progress = unlocked ? null : computeProgress(ach.id, ctx);
  const pct = progress ? progressPercent(progress) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.03 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl ring-1 transition",
        unlocked
          ? `bg-white/[0.04] ${tier.ring} ${tier.glow}`
          : "bg-white/[0.02] ring-white/[0.06]",
        compact ? "p-3" : "p-4",
      )}
    >
      {/* Tier ribbon in the corner (gold / platinum get more emphasis) */}
      {unlocked && (ach.tier === "gold" || ach.tier === "platinum") && (
        <div
          className={cn(
            "absolute right-0 top-0 -mr-6 -mt-6 h-12 w-12 rotate-45 opacity-60",
            tier.bg,
          )}
        />
      )}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid shrink-0 place-items-center rounded-xl ring-1",
            unlocked ? `${tier.bg} ${tier.text} ${tier.ring}` : "bg-white/[0.03] text-fg-dim ring-white/[0.06]",
            compact ? "size-9" : "size-12",
          )}
        >
          {isHidden ? (
            <Lock className={compact ? "size-4" : "size-5"} strokeWidth={2} />
          ) : (
            <Icon
              className={compact ? "size-4" : "size-6"}
              strokeWidth={2}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate font-medium",
                unlocked ? "text-fg-primary" : "text-fg-muted",
                compact ? "text-sm" : "text-base",
              )}
            >
              {isHidden ? "Achievement secret" : ach.title}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ring-1",
                unlocked
                  ? `${tier.bg} ${tier.text} ${tier.ring}`
                  : "bg-white/[0.03] text-fg-dim ring-white/[0.06]",
              )}
            >
              {tier.label}
            </span>
          </div>

          <p
            className={cn(
              "mt-0.5 text-xs",
              unlocked ? "text-fg-muted" : "text-fg-dim italic",
              compact && "line-clamp-1",
            )}
          >
            {isHidden
              ? ach.hint
                ? `« ${ach.hint} »`
                : "???"
              : ach.description}
          </p>

          {/* Progress bar (locked + has numeric track) */}
          {!unlocked && progress && (
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-dim">
                <span>{formatProgress(ach.id, progress)}</span>
                <span>{Math.round(pct)} %</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    "h-full transition-all",
                    pct >= 90
                      ? "bg-amber-300"
                      : pct >= 50
                        ? "bg-accent"
                        : "bg-white/30",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Unlock date + rarity row */}
          {!compact && (unlocked || rarityPercent != null) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-fg-dim">
              {unlocked && unlockedAt && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3 text-amber-300" />
                  Débloqué le{" "}
                  {new Date(unlockedAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
              {rarityPercent != null && (
                <span className="inline-flex items-center gap-1">
                  {rarityPercent < 5 ? (
                    <EyeOff className="size-3 text-cyan-300" />
                  ) : (
                    <Eye className="size-3" />
                  )}
                  {rarityPercent < 1
                    ? "< 1 % des joueurs"
                    : `${rarityPercent.toFixed(rarityPercent < 10 ? 1 : 0)} % des joueurs`}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
