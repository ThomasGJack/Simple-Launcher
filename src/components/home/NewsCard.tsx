import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, Pin, Newspaper, Maximize2, X, ChevronRight } from "lucide-react";
import { watchNews, type News } from "@/firebase/news";
import {
  REACTION_EMOJIS,
  toggleReaction,
  watchReactions,
  type NewsReaction,
} from "@/firebase/newsReactions";
import {
  castVote,
  clearVote,
  watchPollVotes,
  type NewsPollVote,
} from "@/firebase/newsPollVotes";
import { useAuthStore } from "@/store/auth";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { sounds } from "@/lib/sounds";
import { marked } from "marked";
import { cn } from "@/lib/cn";
import { preprocessAutolinks, handleExternalLinkClick } from "@/lib/linkUtils";

/**
 * Live newsfeed widget on the home page.
 *
 * Layout :
 *   - Top item rendered FULL size (pinned first, otherwise most recent).
 *     Includes title, body, reactions, poll, and an accent stripe.
 *   - Below, a scrollable list of the remaining news in COMPACT form
 *     (~64 px per row), at least 2 visible without scrolling. Older
 *     news disappear into the scroll. The container has a styled
 *     vertical scrollbar (thin, accent-on-hover) so the user can
 *     dig into the archive without leaving the home page.
 *
 * Updates propagate live via Firestore `onSnapshot` — admin edits
 * appear on every connected launcher without relaunch.
 */
export function NewsCard() {
  const [news, setNews] = useState<News[]>([]);
  /** Currently-selected news shown in the detail modal. null = closed.
   *  Any item — featured OR compact — can be promoted to the modal,
   *  the modal just shows a full-size NewsItem inside a backdrop. */
  const [selected, setSelected] = useState<News | null>(null);

  useEffect(() => watchNews(setNews), []);

  // Close on Escape — a11y + matches the rest of the launcher's modals.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const visible = news.filter((n) => !n.hidden);
  if (visible.length === 0) return null;
  const top = visible[0];
  const rest = visible.slice(1);

  // Approx height for ~2 compact items + a little breathing room :
  //   each compact item is ~76px tall (p-3 + 2 lines + gap)
  //   2 visible × 76 + 8px gap + 4px scroll margin ≈ 168px
  // We give 192px so the third item peeks just below the fold,
  // hinting at scrollability without being too generous.
  const SCROLL_MAX_H = 192;

  return (
    <>
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
            onOpen={() => setSelected(top)}
          />
        </AnimatePresence>

        {rest.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              <Newspaper className="size-3" />
              Plus de news
              <span className="ml-auto rounded-full bg-bg-base/40 px-1.5 py-0.5 font-mono text-[9px] text-fg-muted">
                {rest.length}
              </span>
            </div>
            {/* Scrollable archive — at least 2 compact items always
                visible, more accessible by scroll. The vertical scroll
                uses the `info-scroll` flavour (thin, accent-on-hover).
                Each compact item is clickable → opens the modal. */}
            <div
              className="info-scroll space-y-2 overflow-y-auto pr-1"
              style={{ maxHeight: `${SCROLL_MAX_H}px` }}
            >
              {rest.map((n) => (
                <NewsItem
                  key={n.id}
                  item={n}
                  compact
                  onOpen={() => setSelected(n)}
                />
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selected && (
          <NewsDetailModal item={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Modal showing one news in full size on top of a dimmed backdrop.
 * Re-uses the NewsItem component (without `compact`) so the visual
 * is consistent with the featured news on HomePage. The full body
 * is rendered (no line-clamp), reactions / poll work normally.
 *
 * Closes on : backdrop click, X button, or Escape key (handled by
 * the parent NewsCard via a window keydown listener).
 */
function NewsDetailModal({
  item,
  onClose,
}: {
  item: News;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/75 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: "spring", stiffness: 280, damping: 24 },
        }}
        exit={{ opacity: 0, scale: 0.95, y: 16, transition: { duration: 0.18 } }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-12 right-0 inline-flex items-center gap-1.5 rounded-full bg-bg-elevated/80 px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.08] transition-colors hover:bg-bg-elevated hover:text-fg-primary"
          aria-label="Fermer"
        >
          <X className="size-3.5" /> Fermer
        </button>
        {/* The full-size NewsItem inside the modal — same component
            used on HomePage but with no clamping. We pass an explicit
            isInModal flag so it can drop the "Voir +" button (we're
            already in the modal — it'd be useless). */}
        <div className="info-scroll max-h-[80vh] overflow-y-auto rounded-3xl">
          <NewsItem item={item} isInModal />
        </div>
      </motion.div>
    </motion.div>
  );
}

function NewsItem({
  item,
  compact,
  isInModal,
  onOpen,
}: {
  item: News;
  compact?: boolean;
  /** True when this NewsItem is rendered inside the detail modal —
   *  drops the "Voir +" button and avoids the clickable-card wrap
   *  since the user is already viewing the full content. */
  isInModal?: boolean;
  /** Promote this news to the detail modal. Wired by the parent
   *  NewsCard. Featured items get an explicit "Voir +" CTA when
   *  their body is long ; compact items become clickable cards. */
  onOpen?: () => void;
}) {
  const accent = item.accent ?? "var(--color-accent)";
  // Pre-process body to auto-linkify bare URLs, then run through
  // marked. The output is sanitized via DOMPurify (allows <a> with
  // safe href) before being injected into the DOM.
  const body = item.body
    ? marked.parse(preprocessAutolinks(item.body), { async: false, gfm: true })
    : "";
  const html = typeof body === "string" ? sanitizeHtml(body) : "";

  // Heuristic for "long news that deserves a Voir + button" on the
  // featured item : raw body > 280 chars OR contains a structural
  // markdown element (headings, lists, code blocks). We don't need
  // perfect detection — the worst case is a short news that has a
  // useless "Voir +" button (which still works fine).
  const isLongFeatured =
    !compact &&
    !isInModal &&
    !!item.body &&
    (item.body.length > 280 ||
      /\n#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|```/m.test(item.body));

  // Compact items are clickable cards. Featured items (top of HomePage
  // feed) get the explicit "Voir +" button below the body instead, to
  // avoid swallowing clicks on links / reactions / poll buttons. The
  // modal version (`isInModal`) is never clickable / has no button.
  const compactClickable = compact && !isInModal && !!onOpen;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        compact
          ? "group relative rounded-2xl glass p-4 ring-1 ring-white/[0.06]"
          : "relative overflow-hidden rounded-3xl glass-strong p-5 ring-1 ring-white/[0.06]",
        compactClickable &&
          "no-drag cursor-pointer transition-all hover:bg-white/[0.02] hover:ring-accent/30 hover:shadow-[0_4px_18px_rgba(0,0,0,0.25)]",
      )}
      onClick={compactClickable ? onOpen : undefined}
      role={compactClickable ? "button" : undefined}
      tabIndex={compactClickable ? 0 : undefined}
      onKeyDown={
        compactClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
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
      {/* "Open in modal" hint chevron — only on clickable compact items.
          Subtle by default, brightens on hover. */}
      {compactClickable && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-dim opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
          style={{ color: accent }}
        >
          <ChevronRight className="size-4" />
        </div>
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
              className={cn(
                "prose prose-invert max-w-none mt-1.5 text-sm text-fg-muted",
                "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-accent/40 [&_a]:transition-colors hover:[&_a]:decoration-accent",
                "[&_a]:no-drag [&_a]:cursor-pointer",
                compact && "line-clamp-2",
              )}
              onClick={handleExternalLinkClick}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {item.authorName && !compact && (
            <div className="mt-2 text-[10px] text-fg-dim">— {item.authorName}</div>
          )}
          {/* Voir + button on the featured item when its body is long,
              and we're not already inside the modal. Click stops
              propagation so it doesn't accidentally trigger any
              parent handler. */}
          {isLongFeatured && onOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="no-drag mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent ring-1 ring-accent/30 transition-all hover:bg-accent/20 hover:shadow-[0_0_14px_var(--color-accent-soft)]"
              style={{ color: accent }}
            >
              <Maximize2 className="size-3" />
              Voir la news complète
            </button>
          )}
          {!compact && item.poll && <PollWidget newsId={item.id} poll={item.poll} accent={accent} />}
          {!compact && <ReactionsRow newsId={item.id} />}
        </div>
      </div>
    </motion.div>
  );
}

function PollWidget({
  newsId,
  poll,
  accent,
}: {
  newsId: string;
  poll: { question: string; options: string[] };
  accent: string;
}) {
  const me = useAuthStore((s) => s.user);
  const [votes, setVotes] = useState<NewsPollVote[]>([]);
  useEffect(() => watchPollVotes(newsId, setVotes), [newsId]);

  const myVote = useMemo(
    () => votes.find((v) => v.uid === me?.uid)?.option ?? null,
    [votes, me?.uid],
  );
  const counts = useMemo(() => {
    const arr = poll.options.map(() => 0);
    for (const v of votes) {
      if (v.option >= 0 && v.option < arr.length) arr[v.option]++;
    }
    return arr;
  }, [votes, poll.options]);
  const total = counts.reduce((a, b) => a + b, 0);

  const handle = async (idx: number) => {
    if (!me) return;
    sounds.click();
    try {
      if (myVote === idx) {
        await clearVote(newsId, me.uid);
      } else {
        await castVote(newsId, me.uid, idx, me.displayName ?? null, me.photoURL ?? null);
      }
    } catch (err) {
      console.warn("[poll] vote failed:", err);
    }
  };

  return (
    <div className="mt-4 rounded-2xl bg-bg-base/30 p-4 ring-1 ring-white/[0.06]">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider" style={{ color: accent }}>
        <span>Sondage</span>
        <span className="text-fg-dim">· {total} {total > 1 ? "votes" : "vote"}</span>
      </div>
      <div className="mb-3 text-sm font-semibold text-fg-primary">{poll.question}</div>
      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const count = counts[i];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = myVote === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handle(i)}
              className={cn(
                "no-drag relative w-full overflow-hidden rounded-xl px-3 py-2 text-left text-sm ring-1 transition-all",
                active
                  ? "bg-accent/10 text-fg-primary ring-accent/40"
                  : "bg-bg-elevated/40 text-fg-muted ring-white/[0.06] hover:bg-bg-elevated/70 hover:text-fg-primary",
              )}
            >
              {/* fill bar */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${accent}30, transparent)`,
                }}
              />
              <div className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-mono",
                    active ? "ring-2" : "bg-bg-elevated text-fg-dim",
                  )}
                  style={active ? { background: accent, color: "#07090d" } : undefined}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
                {total > 0 && (
                  <span className="font-mono text-xs tabular-nums text-fg-muted">{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {myVote !== null && (
        <div className="mt-2 text-[10px] text-fg-dim">
          Tu as voté · clique à nouveau pour retirer ton vote
        </div>
      )}
    </div>
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
