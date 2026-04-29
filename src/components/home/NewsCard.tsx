import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, Pin, ChevronRight } from "lucide-react";
import { watchNews, type News } from "@/firebase/news";
import {
  REACTION_EMOJIS,
  toggleReaction,
  watchReactions,
  type NewsReaction,
} from "@/firebase/newsReactions";
import { useAuthStore } from "@/store/auth";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { sounds } from "@/lib/sounds";
import { marked } from "marked";
import { cn } from "@/lib/cn";

/**
 * Live newsfeed card on the home page. Displays the top item (pinned first,
 * else most recently updated) with a soft pulse on transition. Updates in
 * real-time via Firestore onSnapshot — admin edits propagate to every
 * connected launcher without a relaunch.
 */
export function NewsCard() {
  const [news, setNews] = useState<News[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => watchNews(setNews), []);

  const visible = news.filter((n) => !n.hidden);
  if (visible.length === 0) return null;
  const top = visible[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      className="mb-4"
    >
      <AnimatePresence mode="wait">
        <NewsItem
          key={top.id + top.updatedAt}
          item={top}
          showMore={visible.length > 1}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />
      </AnimatePresence>

      {/* Optional drawer with older news */}
      <AnimatePresence>
        {expanded && visible.length > 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-2 space-y-2 overflow-hidden"
          >
            {visible.slice(1).map((n) => (
              <NewsItem key={n.id} item={n} compact />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NewsItem({
  item,
  compact,
  showMore,
  expanded,
  onToggle,
}: {
  item: News;
  compact?: boolean;
  showMore?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const accent = item.accent ?? "var(--color-accent)";
  const body = item.body ? marked.parse(item.body, { async: false }) : "";
  const html = typeof body === "string" ? sanitizeHtml(body) : "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={
        compact
          ? "rounded-2xl glass p-4 ring-1 ring-white/[0.06]"
          : "relative overflow-hidden rounded-3xl glass-strong p-5 ring-1 ring-white/[0.06]"
      }
    >
      {/* Accent stripe on the left edge */}
      {!compact && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-1"
          style={{
            background: `linear-gradient(180deg, ${accent}, transparent)`,
            boxShadow: `0 0 18px ${accent}80`,
          }}
        />
      )}
      <div className="flex items-start gap-3">
        <div
          className={
            "grid shrink-0 place-items-center rounded-xl ring-1 " +
            (compact ? "size-8" : "size-10")
          }
          style={{
            background: `color-mix(in srgb, ${accent} 18%, transparent)`,
            color: accent,
            boxShadow: `0 0 14px ${accent}40`,
          }}
        >
          <Megaphone className={compact ? "size-3.5" : "size-4"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={"text-xs uppercase tracking-[0.2em]"} style={{ color: accent }}>
              News
            </span>
            {item.pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/30">
                <Pin className="size-2.5" /> Épinglé
              </span>
            )}
            <span className="ml-auto text-[10px] text-fg-dim">{relativeTime(item.updatedAt)}</span>
          </div>
          <h3 className={compact ? "mt-0.5 text-sm font-semibold" : "mt-1 text-lg font-semibold"}>
            {item.title}
          </h3>
          {html && (
            <div
              className={
                "prose prose-invert max-w-none mt-1.5 text-sm text-fg-muted " +
                (compact ? "line-clamp-2" : "")
              }
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {item.authorName && !compact && (
            <div className="mt-2 text-[10px] text-fg-dim">— {item.authorName}</div>
          )}
          {!compact && <ReactionsRow newsId={item.id} />}
        </div>
      </div>
      {showMore && onToggle && !compact && (
        <button
          type="button"
          onClick={onToggle}
          className="no-drag mt-3 inline-flex items-center gap-1 rounded-full bg-bg-base/40 px-3 py-1 text-[11px] text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-bg-base/60 hover:text-fg-primary"
        >
          <ChevronRight className={"size-3 transition-transform " + (expanded ? "rotate-90" : "")} />
          {expanded ? "Masquer" : "Voir les news plus anciennes"}
        </button>
      )}
    </motion.div>
  );
}

function ReactionsRow({ newsId }: { newsId: string }) {
  const me = useAuthStore((s) => s.user);
  const [reactions, setReactions] = useState<NewsReaction[]>([]);

  useEffect(() => watchReactions(newsId, setReactions), [newsId]);

  const myEmojis = useMemo(
    () => reactions.find((r) => r.uid === me?.uid)?.emojis ?? [],
    [reactions, me?.uid],
  );

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reactions) {
      for (const e of r.emojis) {
        m[e] = (m[e] ?? 0) + 1;
      }
    }
    return m;
  }, [reactions]);

  const tooltipFor = (emoji: string): string => {
    const names = reactions
      .filter((r) => r.emojis.includes(emoji))
      .map((r) => r.userName ?? "Anonyme")
      .slice(0, 8);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  };

  const handleClick = async (emoji: string) => {
    if (!me) return;
    sounds.click();
    try {
      await toggleReaction(
        newsId,
        me.uid,
        emoji,
        myEmojis,
        me.displayName ?? null,
        me.photoURL ?? null,
      );
    } catch (err) {
      console.warn("[reactions] toggle failed:", err);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const count = counts[emoji] ?? 0;
        const active = myEmojis.includes(emoji);
        return (
          <motion.button
            key={emoji}
            type="button"
            onClick={() => handleClick(emoji)}
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.08 }}
            title={tooltipFor(emoji)}
            className={cn(
              "no-drag inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 transition-all",
              active
                ? "bg-accent/15 text-fg-primary ring-accent/40 shadow-[0_0_12px_var(--color-accent-soft)]"
                : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60 hover:ring-white/15",
            )}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {count > 0 && <span className="font-mono tabular-nums">{count}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

function relativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}
