import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy, X } from "lucide-react";
import { ACHIEVEMENTS, TIER_STYLES, type Achievement } from "@/lib/achievements";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Internal global queue of achievements to celebrate via toast. Other parts
 * of the app push to it via the exported `pushAchievementToast` helper —
 * the toast component subscribes to consume them in order.
 */
type Listener = (queue: string[]) => void;
let queue: string[] = [];
const listeners = new Set<Listener>();

export function pushAchievementToast(achievementId: string): void {
  if (queue.includes(achievementId)) return; // already queued
  queue = [...queue, achievementId];
  for (const l of listeners) l(queue);
}

export function AchievementUnlockToastHost() {
  const [active, setActive] = useState<Achievement | null>(null);

  useEffect(() => {
    const onChange: Listener = (next) => {
      if (active) return; // already showing one — wait until dismissed
      const head = next[0];
      if (head) {
        const ach = ACHIEVEMENTS.find((a) => a.id === head);
        if (ach) setActive(ach);
      }
    };
    listeners.add(onChange);
    onChange(queue);
    return () => {
      listeners.delete(onChange);
    };
  }, [active]);

  // When a toast is shown, schedule auto-dismiss + sound
  useEffect(() => {
    if (!active) return;
    sounds.success();
    const t = setTimeout(() => {
      setActive(null);
      queue = queue.slice(1);
      for (const l of listeners) l(queue);
    }, 6000);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: -40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="no-drag fixed left-1/2 top-6 z-[60] -translate-x-1/2"
        >
          <Toast
            ach={active}
            onClose={() => {
              setActive(null);
              queue = queue.slice(1);
              for (const l of listeners) l(queue);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
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
