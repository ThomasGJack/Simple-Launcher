import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Filter, Lock, Sparkles, Trophy } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import {
  useAchievements,
  useConversations,
  useLaunchDays,
  useModules,
  usePlaytime,
  useUsers,
} from "@/store/firebaseStores";
import {
  ACHIEVEMENTS,
  TIER_STYLES,
  TIER_WEIGHT,
  computeProgress,
  progressPercent,
  type AchievementContext,
} from "@/lib/achievements";
import { buildAchievementContext } from "@/lib/achievementContext";
import { watchUserShortcuts } from "@/firebase/shortcuts";
import {
  computeRarity,
  watchAchievementStats,
  type AchievementStats,
} from "@/firebase/achievementStats";
import { AchievementCard } from "@/components/achievements/AchievementCard";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

type TierFilter = "all" | "bronze" | "silver" | "gold" | "platinum";
type StatusFilter = "all" | "unlocked" | "locked";

/**
 * Dedicated achievements gallery — one card per catalog entry, with
 * tier + status filters, live rarity %, and an in-line progress bar on
 * locked entries that have a numeric track. Reachable from the Profile
 * page only (intentionally not in the sidebar — it's a "destination",
 * not a daily-use tab).
 */
export function AchievementsPage() {
  const navigate = useUIStore((s) => s.navigate);
  const me = useAuthStore((s) => s.user);
  const allModules = useModules();
  const allUsers = useUsers();
  const playtime = usePlaytime(me?.uid);
  const conversations = useConversations(me?.uid);
  const launchDays = useLaunchDays(me?.uid);
  const unlocked = useAchievements(me?.uid);
  const unlockedById = useMemo(
    () => new Map(unlocked.map((u) => [u.id, u.unlockedAt] as const)),
    [unlocked],
  );

  const [shortcutCount, setShortcutCount] = useState(0);
  useEffect(() => {
    if (!me) return;
    return watchUserShortcuts(me.uid, (s) => setShortcutCount(s.length));
  }, [me]);

  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Live rarity numbers. The doc may not exist yet on a fresh project
  // (no unlocks ever recorded), in which case `totalUsers === 0` and
  // we just don't display the % column.
  const [stats, setStats] = useState<AchievementStats>({
    counts: {},
    totalUsers: 0,
  });
  useEffect(() => watchAchievementStats(setStats), []);
  const rarity = useMemo(() => computeRarity(stats), [stats]);

  // Build the same context the achievement evaluator uses, so the
  // progress bars on locked entries reflect the user's real state.
  const ctx: AchievementContext = useMemo(() => {
    if (!me) {
      // Not logged in (shouldn't happen here — auth gate elsewhere) —
      // return an empty context so the catalog can still render.
      return buildAchievementContext({
        me: { uid: "", displayName: null, photoURL: null, email: null } as never,
        modules: allModules,
        allUsers,
        playtime: [],
        conversations: [],
        launchDays: [],
        myProfile: null,
        shortcutCount: 0,
      });
    }
    const myProfile = allUsers.find((u) => u.uid === me.uid) ?? null;
    return buildAchievementContext({
      me,
      modules: allModules,
      allUsers,
      playtime,
      conversations,
      launchDays,
      myProfile,
      shortcutCount,
    });
  }, [me, allModules, allUsers, playtime, conversations, launchDays, shortcutCount]);

  // Apply filters + sort: unlocked first, then by tier weight desc,
  // then by progress desc among locked.
  const visible = useMemo(() => {
    return ACHIEVEMENTS.filter((a) => {
      if (tierFilter !== "all" && a.tier !== tierFilter) return false;
      const isUnlockedBadge = unlockedById.has(a.id);
      if (statusFilter === "unlocked" && !isUnlockedBadge) return false;
      if (statusFilter === "locked" && isUnlockedBadge) return false;
      return true;
    }).sort((a, b) => {
      const aUnlocked = unlockedById.has(a.id);
      const bUnlocked = unlockedById.has(b.id);
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
      const tierDiff = TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier];
      if (tierDiff !== 0) return tierDiff;
      // Tied tier + unlock state — sort locked by progress desc, unlocked by date desc
      if (!aUnlocked) {
        const ap = computeProgress(a.id, ctx);
        const bp = computeProgress(b.id, ctx);
        const apct = ap ? progressPercent(ap) : 0;
        const bpct = bp ? progressPercent(bp) : 0;
        return bpct - apct;
      }
      return (unlockedById.get(b.id) ?? 0) - (unlockedById.get(a.id) ?? 0);
    });
  }, [tierFilter, statusFilter, unlockedById, ctx]);

  const totalNonSecret = ACHIEVEMENTS.filter((a) => !a.secret).length;
  const unlockedNonSecret = ACHIEVEMENTS.filter(
    (a) => !a.secret && unlockedById.has(a.id),
  ).length;
  const overallPct = totalNonSecret > 0 ? (unlockedNonSecret / totalNonSecret) * 100 : 0;

  const closestLocked = useMemo(() => {
    return ACHIEVEMENTS.filter((a) => !unlockedById.has(a.id) && !a.secret)
      .map((a) => ({ ach: a, progress: computeProgress(a.id, ctx) }))
      .filter((x) => x.progress)
      .sort(
        (a, b) =>
          progressPercent(b.progress!) - progressPercent(a.progress!),
      )
      .slice(0, 1)[0];
  }, [unlockedById, ctx]);

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <button
        onClick={() => {
          sounds.click();
          navigate({ name: "profile" });
        }}
        className="mb-6 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-fg-muted transition-colors hover:text-fg-primary"
      >
        <ArrowLeft className="size-3.5" /> Retour au profil
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Achievements</p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Tes succès</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {unlockedNonSecret} sur {totalNonSecret} débloqués · {Math.round(overallPct)}{" "}%
          de complétion
        </p>
      </motion.div>

      {/* Overall progress bar */}
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/[0.05] ring-1 ring-white/[0.06]">
        <div
          className="h-full bg-gradient-to-r from-accent via-amber-300 to-cyan-300 shadow-[0_0_18px_var(--color-accent-glow)] transition-all"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* Closest-to-unlock spotlight */}
      {closestLocked && closestLocked.progress && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-5 py-4"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-amber-300">
              Plus proche du déblocage
            </div>
            <div className="mt-0.5 text-sm font-medium text-fg-primary">
              {closestLocked.ach.title}
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.55)] transition-all"
                style={{ width: `${progressPercent(closestLocked.progress)}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 font-mono text-sm tabular-nums text-amber-200">
            {Math.round(progressPercent(closestLocked.progress))} %
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterRow
          label="Tier"
          icon={Trophy}
          values={["all", "bronze", "silver", "gold", "platinum"] as const}
          renderValue={(v) =>
            v === "all" ? "Tous" : TIER_STYLES[v as Exclude<TierFilter, "all">].label
          }
          selected={tierFilter}
          onChange={(v) => setTierFilter(v as TierFilter)}
        />
        <FilterRow
          label="Statut"
          icon={Filter}
          values={["all", "unlocked", "locked"] as const}
          renderValue={(v) =>
            v === "all" ? "Tous" : v === "unlocked" ? "Débloqués" : "Verrouillés"
          }
          selected={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
      </div>

      {visible.length === 0 ? (
        <div className="grid h-64 place-items-center rounded-2xl bg-white/[0.02] text-sm text-fg-muted ring-1 ring-white/[0.04]">
          <div className="text-center">
            <Lock className="mx-auto mb-3 size-8 text-fg-dim" strokeWidth={1.5} />
            Aucun achievement avec ces filtres.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((ach, i) => (
            <AchievementCard
              key={ach.id}
              ach={ach}
              ctx={ctx}
              unlocked={unlockedById.has(ach.id)}
              unlockedAt={unlockedById.get(ach.id) ?? null}
              rarityPercent={
                stats.totalUsers > 0
                  ? rarity[ach.id] ?? 0
                  : null
              }
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  icon: Icon,
  values,
  renderValue,
  selected,
  onChange,
}: {
  label: string;
  icon: typeof Trophy;
  values: readonly T[];
  renderValue: (v: T) => string;
  selected: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
      <div className="ml-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-dim">
        <Icon className="size-3" /> {label}
      </div>
      <div className="flex items-center gap-1">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              sounds.click();
              onChange(v);
            }}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs transition",
              selected === v
                ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                : "text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary",
            )}
          >
            {renderValue(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AchievementsPage;
