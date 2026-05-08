import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Check } from "lucide-react";
import {
  castChannelVote,
  clearChannelVote,
  watchChannelPollVotes,
  type ChannelPollVote,
} from "@/firebase/channelPollVotes";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Widget de sondage rendu inline dans un message de channel. Calque
 * du PollWidget des news (single-choice, re-tap la même option la
 * retire). Live updates via watcher de la sous-collection votes.
 */
export function PollMessage({
  crewId,
  channelId,
  messageId,
  poll,
}: {
  crewId: string;
  channelId: string;
  messageId: string;
  poll: { question: string; options: string[] };
}) {
  const me = useAuthStore((s) => s.user);
  const [votes, setVotes] = useState<ChannelPollVote[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return watchChannelPollVotes(crewId, channelId, messageId, setVotes);
  }, [crewId, channelId, messageId]);

  const myVote = useMemo(
    () => votes.find((v) => v.uid === me?.uid)?.option ?? null,
    [votes, me?.uid],
  );

  const counts = useMemo(() => {
    const arr = new Array(poll.options.length).fill(0);
    for (const v of votes) {
      if (v.option >= 0 && v.option < arr.length) arr[v.option]++;
    }
    return arr;
  }, [votes, poll.options.length]);

  const total = votes.length;

  const handleVote = async (option: number) => {
    if (!me || busy) return;
    setBusy(true);
    try {
      if (myVote === option) {
        await clearChannelVote(crewId, channelId, messageId, me.uid);
      } else {
        await castChannelVote(
          crewId,
          channelId,
          messageId,
          me.uid,
          option,
          me.displayName ?? null,
          me.photoURL ?? null,
        );
      }
      sounds.click();
    } catch (err) {
      console.warn("[PollMessage] vote failed:", err);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl bg-bg-soft/50 p-3 ring-1 ring-white/[0.06]"
    >
      <div className="mb-2.5 flex items-start gap-2">
        <BarChart3 className="size-4 shrink-0 text-accent" />
        <h4 className="text-sm font-medium text-fg-primary">{poll.question}</h4>
      </div>

      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt, idx) => {
          const count = counts[idx];
          const pct = total > 0 ? (count / total) * 100 : 0;
          const isMine = myVote === idx;
          return (
            <button
              key={idx}
              onClick={() => handleVote(idx)}
              disabled={!me || busy}
              className={cn(
                "group relative w-full overflow-hidden rounded-lg px-3 py-2 text-left text-sm transition",
                isMine
                  ? "bg-accent/15 text-fg-primary ring-1 ring-accent/40"
                  : "bg-white/[0.03] text-fg-muted ring-1 ring-white/[0.05] hover:bg-white/[0.06] hover:text-fg-primary",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {/* Barre de progression — fade-in via width animée */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={cn(
                  "absolute inset-y-0 left-0 -z-0",
                  isMine ? "bg-accent/20" : "bg-white/[0.04]",
                )}
              />
              <div className="relative z-10 flex items-center gap-2">
                {isMine && <Check className="size-3.5 text-accent" />}
                <span className="flex-1">{opt}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-dim">
                  {count} {pct > 0 && `· ${Math.round(pct)} %`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 text-[10px] text-fg-dim">
        {total === 0
          ? "Aucun vote pour l'instant."
          : `${total} vote${total > 1 ? "s" : ""} · clique pour voter / retirer`}
      </div>
    </motion.div>
  );
}
