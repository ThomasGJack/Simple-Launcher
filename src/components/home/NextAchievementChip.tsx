import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import {
  useAchievements,
  useConversations,
  useModules,
  usePlaytime,
  useUsers,
} from "@/store/firebaseStores";
import {
  ACHIEVEMENTS,
  TIER_STYLES,
  computeProgress,
  formatProgress,
  progressPercent,
  type AchievementContext,
} from "@/lib/achievements";
import { achievementFlags } from "@/lib/achievementFlags";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Tease the user about whichever achievement they're closest to
 * unlocking, on the Home page. Rotates through the top 3 closest every
 * 6 seconds so the chip feels alive without being noisy.
 *
 * No-op when the user has nothing in progress (all available
 * achievements are unlocked, or none have a numeric progress track).
 */
export function NextAchievementChip() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const allModules = useModules();
  const allUsers = useUsers();
  const playtime = usePlaytime(me?.uid);
  const conversations = useConversations(me?.uid);
  const unlocked = useAchievements(me?.uid);
  const unlockedSet = useMemo(
    () => new Set(unlocked.map((u) => u.id)),
    [unlocked],
  );

  const ctx: AchievementContext | null = useMemo(() => {
    if (!me) return null;
    const distinctChatPartners = new Set(
      conversations.flatMap((c) => c.participants.filter((p) => p && p !== me.uid)),
    ).size;
    const onlineUsersCount = allUsers.filter(
      (u) => u.lastSeen && Date.now() - u.lastSeen < 60_000,
    ).length;
    const totalLaunches = playtime.reduce((s, p) => s + p.totalLaunches, 0);
    const distinctModulesLaunched = playtime.filter((p) => p.totalLaunches > 0).length;
    return {
      modules: allModules,
      installedCount: 0,
      playtime,
      conversations,
      distinctChatPartners,
      onlineUsersCount,
      totalMessagesSent: conversations.filter(
        (c) => c.lastMessage?.senderUid === me.uid,
      ).length,
      totalLaunches,
      distinctModulesLaunched,
      bootHour: achievementFlags.getBootHour(),
      sharedProfileOnce: achievementFlags.hasSharedProfile(),
      usedOfflineModeOnce: achievementFlags.hasUsedOffline(),
    };
  }, [me, allModules, allUsers, playtime, conversations]);

  // Rank locked + non-secret achievements with a numeric track by their
  // progress %, descending. Pick the top 3 to rotate through. Secrets
  // are excluded so we never spoil hidden badges via Home.
  const candidates = useMemo(() => {
    if (!ctx) return [];
    return ACHIEVEMENTS.filter(
      (a) => !a.secret && !unlockedSet.has(a.id),
    )
      .map((a) => ({ ach: a, progress: computeProgress(a.id, ctx) }))
      .filter((x) => x.progress && x.progress.threshold > 0)
      .sort(
        (a, b) =>
          progressPercent(b.progress!) - progressPercent(a.progress!),
      )
      .slice(0, 3);
  }, [ctx, unlockedSet]);

  // Rotate every 6 s through the candidates. Reset when the candidate
  // list changes (e.g. progress moves an achievement out of the top 3).
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (candidates.length <= 1) return;
    const t = setInterval(
      () => setIndex((i) => (i + 1) % candidates.length),
      6000,
    );
    return () => clearInterval(t);
  }, [candidates.length]);

  if (!ctx || candidates.length === 0) return null;
  const current = candidates[Math.min(index, candidates.length - 1)];
  const tier = TIER_STYLES[current.ach.tier];
  const Icon = current.ach.icon;
  const pct = progressPercent(current.progress!);

  return (
    <button
      type="button"
      onClick={() => {
        sounds.click();
        navigate({ name: "achievements" });
      }}
      className={cn(
        "no-drag group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left ring-1 transition",
        "bg-gradient-to-r from-amber-400/[0.06] via-white/[0.02] to-transparent",
        tier.ring,
        "hover:from-amber-400/[0.1] hover:shadow-[0_0_24px_rgba(252,211,77,0.25)]",
      )}
    >
      <div
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
          tier.bg,
          tier.text,
          tier.ring,
        )}
      >
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={current.ach.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="min-w-0 flex-1"
        >
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300">
            <Sparkles className="size-3" /> Bientôt débloqué
          </div>
          <div className="mt-0.5 truncate text-sm font-medium text-fg-primary">
            {current.ach.title}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
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
            <span className="font-mono text-[10px] tabular-nums text-fg-muted">
              {formatProgress(current.ach.id, current.progress!)}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
      <ArrowRight className="size-4 shrink-0 text-fg-dim opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
