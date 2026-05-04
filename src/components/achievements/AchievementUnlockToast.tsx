import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Trophy, X } from "lucide-react";
import { ACHIEVEMENTS, TIER_STYLES, type Achievement } from "@/lib/achievements";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Internal global queue of achievements to celebrate via toast. Other parts
 * of the app push to it via the exported `pushAchievementToast` helper —
 * the toast component subscribes to consume them in order.
 *
 * Two flavours of payload:
 *  - `unlock`  : the user just satisfied an achievement → big toast with
 *                tier-specific jingle and the unlocked badge front and
 *                centre.
 *  - `milestone`: the user crossed a 75 % / 90 % progress threshold but
 *                hasn't unlocked yet → smaller "encouragement" toast that
 *                tells them how close they are.
 */
export type ToastPayload =
  | { kind: "unlock"; id: string }
  | { kind: "milestone"; id: string; percent: number };

type Listener = (queue: ToastPayload[]) => void;
let queue: ToastPayload[] = [];
const listeners = new Set<Listener>();

export function pushAchievementToast(achievementId: string): void {
  if (queue.some((p) => p.kind === "unlock" && p.id === achievementId)) return;
  queue = [...queue, { kind: "unlock", id: achievementId }];
  for (const l of listeners) l(queue);
}

export function pushMilestoneToast(achievementId: string, percent: number): void {
  // Dedup: if a milestone for the same achievement is already queued,
  // overwrite with the higher percent rather than queueing a second one.
  const existing = queue.findIndex(
    (p) => p.kind === "milestone" && p.id === achievementId,
  );
  if (existing >= 0) {
    const prev = queue[existing] as { kind: "milestone"; id: string; percent: number };
    if (prev.percent >= percent) return;
    queue = [...queue];
    queue[existing] = { kind: "milestone", id: achievementId, percent };
  } else {
    queue = [...queue, { kind: "milestone", id: achievementId, percent }];
  }
  for (const l of listeners) l(queue);
}

export function AchievementUnlockToastHost() {
  const [active, setActive] = useState<
    | { kind: "unlock"; ach: Achievement }
    | { kind: "milestone"; ach: Achievement; percent: number }
    | null
  >(null);

  useEffect(() => {
    const onChange: Listener = (next) => {
      if (active) return; // already showing one — wait until dismissed
      const head = next[0];
      if (!head) return;
      const ach = ACHIEVEMENTS.find((a) => a.id === head.id);
      if (!ach) {
        // Drop stale ID so we don't deadlock the queue.
        queue = queue.slice(1);
        for (const l of listeners) l(queue);
        return;
      }
      if (head.kind === "unlock") {
        setActive({ kind: "unlock", ach });
      } else {
        setActive({ kind: "milestone", ach, percent: head.percent });
      }
    };
    listeners.add(onChange);
    onChange(queue);
    return () => {
      listeners.delete(onChange);
    };
  }, [active]);

  // When a toast is shown, schedule auto-dismiss + sound. Unlock toasts
  // get a tier-specific jingle so platinum feels meaningfully bigger
  // than bronze; milestones get a quieter "almost there" chime.
  useEffect(() => {
    if (!active) return;
    if (active.kind === "milestone") {
      sounds.achievementMilestone();
    } else {
      switch (active.ach.tier) {
        case "platinum":
          sounds.achievementPlatinum();
          break;
        case "gold":
          sounds.achievementGold();
          break;
        case "silver":
          sounds.achievementSilver();
          break;
        default:
          sounds.achievementBronze();
      }
    }
    // Milestones dismiss faster (4 s) than unlocks (6 s) — they're
    // informational, the user doesn't need to admire them.
    const dismissAfter = active.kind === "milestone" ? 4000 : 6000;
    const t = setTimeout(() => {
      setActive(null);
      queue = queue.slice(1);
      for (const l of listeners) l(queue);
    }, dismissAfter);
    return () => clearTimeout(t);
  }, [active]);

  const close = () => {
    setActive(null);
    queue = queue.slice(1);
    for (const l of listeners) l(queue);
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={`${active.kind}-${active.ach.id}`}
          initial={{ opacity: 0, y: -40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="no-drag fixed left-1/2 top-6 z-[60] -translate-x-1/2"
        >
          {active.kind === "unlock" ? (
            <Toast ach={active.ach} onClose={close} />
          ) : (
            <MilestoneToast ach={active.ach} percent={active.percent} onClose={close} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MilestoneToast({
  ach,
  percent,
  onClose,
}: {
  ach: Achievement;
  percent: number;
  onClose: () => void;
}) {
  const tier = TIER_STYLES[ach.tier];
  const Icon = ach.icon;
  const rounded = Math.round(percent / 5) * 5; // snap to nearest 5
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-2xl glass px-4 py-3 ring-1",
        tier.ring,
      )}
    >
      <div
        className={cn(
          "relative grid size-9 shrink-0 place-items-center rounded-lg ring-1",
          tier.bg,
          tier.text,
          tier.ring,
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </div>
      <div className="relative">
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-amber-300">
          <Flame className="size-3" /> Plus que {100 - rounded}%
        </div>
        <div className="mt-0.5 text-sm font-medium text-fg-primary">
          {ach.title}
        </div>
      </div>
      <button
        onClick={onClose}
        className="relative grid size-6 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg-primary"
        aria-label="Fermer"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function Toast({ ach, onClose }: { ach: Achievement; onClose: () => void }) {
  const tier = TIER_STYLES[ach.tier];
  const Icon = ach.icon;
  return (
    <div
      className={cn(
        "relative flex items-center gap-4 overflow-hidden rounded-2xl glass-strong px-5 py-4 ring-1",
        tier.ring,
        tier.glow,
      )}
    >
      {/* Subtle confetti-ish sparkle in the background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div
        className={cn(
          "relative grid size-12 shrink-0 place-items-center rounded-xl ring-1",
          tier.bg,
          tier.text,
          tier.ring,
        )}
      >
        <Icon className="size-6" strokeWidth={2} />
      </div>
      <div className="relative">
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-accent">
          <Trophy className="size-3" /> Achievement débloqué
        </div>
        <div className="mt-0.5 font-display text-lg text-fg-primary">{ach.title}</div>
        <div className="text-xs text-fg-muted">{ach.description}</div>
      </div>
      <button
        onClick={onClose}
        className="relative grid size-7 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg-primary"
        aria-label="Fermer"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
