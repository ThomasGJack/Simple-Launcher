import { motion } from "framer-motion";
import {
  Sparkles,
  Wand2,
  Bug,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useMemo } from "react";

/**
 * Renders launcher release notes (the markdown-ish `## [Unreleased] / ###
 * Section / - **Title** description / sub-items` shape we use in
 * CHANGELOG.md) as a styled, multi-section, color-coded UI block.
 *
 * Two layouts:
 *  - Full (default): featured banner on top + table-of-contents + animated
 *    section blocks + stats footer. Used inside the centered FreshArrivalModal
 *    where we have screen real-estate.
 *  - Compact: just the section blocks (no banner / TOC / footer). Used in the
 *    bottom-right UpdateBanner so it stays dense.
 */
export function ChangelogRenderer({
  notes,
  compact = false,
}: {
  notes: string;
  compact?: boolean;
}) {
  const sections = useMemo(() => parseNotes(notes), [notes]);
  const totals = useMemo(() => computeTotals(sections), [sections]);
  const featured = useMemo(() => extractFeatured(sections), [sections]);
  const totalEntries = totals.reduce((s, t) => s + t.count, 0);

  if (sections.length === 0) {
    return (
      <p className="text-xs text-fg-muted italic">
        Aucune note de release fournie.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && featured && <FeaturedBanner entry={featured} />}

      {!compact && sections.length > 1 && totalEntries > 3 && (
        <TableOfContents sections={sections} />
      )}

      <div className={cn("space-y-3", compact && "space-y-2")}>
        {sections.map((section, idx) => (
          <SectionBlock
            key={section.category}
            section={section}
            compact={compact}
            sectionIndex={idx}
          />
        ))}
      </div>

      {!compact && <StatsFooter totals={totals} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
//                                 FEATURED
// ---------------------------------------------------------------------------

function FeaturedBanner({ entry }: { entry: Entry }) {
  const emoji = entry.emoji ?? "✨";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 via-bg-base/40 to-violet-500/10 p-4 ring-1 ring-accent/30"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--color-accent-soft),transparent_60%)] opacity-50" />
      <div className="relative">
        <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          <Sparkles className="size-3" />
          Cette release apporte
        </div>
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">{emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base text-fg-primary">
              {renderInline(entry.title)}
            </div>
            {entry.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
                {renderInline(entry.description)}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
//                            TABLE OF CONTENTS
// ---------------------------------------------------------------------------

function TableOfContents({ sections }: { sections: Section[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sections.map((s) => {
        const meta = CATEGORY_META[s.category];
        const Icon = meta.icon;
        return (
          <a
            key={s.category}
            href={`#cl-${slugify(s.category)}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(`cl-${slugify(s.category)}`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1 transition-all",
              meta.toneChip,
            )}
          >
            <Icon className="size-3" />
            {s.category}
            <span className="rounded-full bg-bg-base/40 px-1.5 text-[9px] text-fg-primary">
              {s.entries.length}
            </span>
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              SECTION BLOCK
// ---------------------------------------------------------------------------

function SectionBlock({
  section,
  compact,
  sectionIndex,
}: {
  section: Section;
  compact: boolean;
  sectionIndex: number;
}) {
  const meta = CATEGORY_META[section.category];
  const Icon = meta.icon;
  return (
    <motion.div
      id={`cl-${slugify(section.category)}`}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: sectionIndex * 0.06, duration: 0.25 }}
      className={cn(
        "overflow-hidden rounded-xl border-l-2 bg-bg-base/30 ring-1 ring-white/[0.04]",
        meta.borderL,
      )}
    >
      <div className={cn("flex items-center gap-2 border-b border-white/[0.04] px-3.5 py-2", meta.headerBg)}>
        <Icon className={cn("size-3.5", meta.iconColor)} />
        <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", meta.iconColor)}>
          {section.category}
        </span>
        <span className="ml-auto rounded-full bg-bg-base/50 px-2 py-0.5 text-[10px] text-fg-muted">
          {section.entries.length} {entryNoun(section.category, section.entries.length)}
        </span>
      </div>
      <div className={cn("space-y-1.5 p-3", compact && "p-2.5")}>
        {section.entries.map((entry, i) => (
          <EntryItem
            key={i}
            entry={entry}
            category={section.category}
            entryIndex={sectionIndex * 10 + i}
            compact={compact}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
//                                 ENTRY
// ---------------------------------------------------------------------------

function EntryItem({
  entry,
  category,
  entryIndex,
  compact,
}: {
  entry: Entry;
  category: Category;
  entryIndex: number;
  compact: boolean;
}) {
  const meta = CATEGORY_META[category];
  const symbol = meta.symbol;
  const SymbolIcon = meta.symbolIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + entryIndex * 0.05, duration: 0.22 }}
      className="flex items-start gap-2.5 rounded-lg bg-bg-base/40 p-2.5 ring-1 ring-white/[0.03] transition-colors hover:bg-bg-base/60"
    >
      <div
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold leading-none",
          meta.symbolBg,
          meta.iconColor,
        )}
        aria-hidden
      >
        {SymbolIcon ? <SymbolIcon className="size-3" strokeWidth={3} /> : symbol}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {entry.emoji && <span className="text-sm leading-none">{entry.emoji}</span>}
          <span className={cn("text-sm font-semibold leading-snug", meta.titleColor)}>
            {renderInline(entry.title)}
          </span>
          {entry.isBreaking && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/30">
              <AlertTriangle className="size-2.5" />
              Breaking
            </span>
          )}
        </div>
        {entry.description && !compact && (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {renderInline(entry.description)}
          </p>
        )}
        {entry.subItems.length > 0 && !compact && (
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {entry.subItems.map((sub, i) => (
              <li key={i} className="flex items-start gap-1.5 text-fg-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-dim" />
                <span className="leading-relaxed">{renderInline(sub)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
//                              STATS FOOTER
// ---------------------------------------------------------------------------

function StatsFooter({ totals }: { totals: { category: Category; count: number }[] }) {
  const totalCount = totals.reduce((s, t) => s + t.count, 0);
  if (totalCount === 0) return null;
  return (
    <div className="rounded-xl bg-bg-base/30 px-3 py-2 ring-1 ring-white/[0.04]">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-fg-muted">
        <span className="text-fg-dim">Cette release :</span>
        {totals.map((t, i) => {
          const meta = CATEGORY_META[t.category];
          return (
            <span key={t.category} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-fg-dim">·</span>}
              <span className={cn("font-semibold", meta.iconColor)}>{t.count}</span>
              <span>{entryNoun(t.category, t.count)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              INLINE RENDER
// ---------------------------------------------------------------------------

/**
 * Renders an inline string fragment that may contain markdown-ish `**bold**`
 * and `` `code` `` runs. Tokenizes via a single regex pass and emits styled
 * React nodes — small enough that we don't need a full markdown library.
 */
function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(text.slice(lastIdx, match.index));
    }
    const m = match[0];
    if (m.startsWith("**")) {
      tokens.push(
        <strong key={key++} className="font-semibold text-fg-primary">
          {m.slice(2, -2)}
        </strong>,
      );
    } else if (m.startsWith("`")) {
      tokens.push(
        <code
          key={key++}
          className="rounded bg-bg-base/60 px-1 py-0.5 font-mono text-[10px] text-accent ring-1 ring-white/[0.04]"
        >
          {m.slice(1, -1)}
        </code>,
      );
    }
    lastIdx = match.index + m.length;
  }
  if (lastIdx < text.length) tokens.push(text.slice(lastIdx));
  return tokens;
}

// ---------------------------------------------------------------------------
//                                 PARSER
// ---------------------------------------------------------------------------

type Category = "Ajouté" | "Changé" | "Corrigé" | "Supprimé" | "Sécurité";

type Entry = {
  /** Bold-prefix or first sentence used as the entry headline. */
  title: string;
  /** Remaining body text for the entry (may be empty). */
  description: string;
  /** Indented `  -` sub-items below the entry. */
  subItems: string[];
  /** Heuristically detected from keywords like "breaking" / "rupture". */
  isBreaking: boolean;
  /** Auto-suggested emoji based on keyword scanning of the title. */
  emoji?: string;
};

type Section = {
  category: Category;
  entries: Entry[];
};

const KNOWN_CATEGORIES: Category[] = ["Ajouté", "Changé", "Corrigé", "Supprimé", "Sécurité"];

function parseNotes(raw: string): Section[] {
  const lines = raw.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (!current || buffer.length === 0) return;
    const entry = parseEntry(buffer);
    if (entry) current.entries.push(entry);
    buffer = [];
  };

  for (const line of lines) {
    const trimStart = line.trimStart();

    // Section header
    if (trimStart.startsWith("### ")) {
      flushBuffer();
      const name = trimStart.slice(4).trim();
      if (KNOWN_CATEGORIES.includes(name as Category)) {
        current = { category: name as Category, entries: [] };
        sections.push(current);
      } else {
        current = null;
      }
      continue;
    }

    // Top-level entry start (no leading space + "- ")
    if (line.startsWith("- ")) {
      flushBuffer();
      buffer.push(line);
      continue;
    }

    // Continuation (indented sub-item or wrapped text on a top-level entry)
    if (current && buffer.length > 0) {
      buffer.push(line);
      continue;
    }
  }
  flushBuffer();

  // Drop empty sections (no entries written under them in the changelog).
  return sections.filter((s) => s.entries.length > 0);
}

/**
 * Parses one entry's raw lines into a structured Entry.
 *  - `- **Title** description...` → split bold-prefix as title, rest as description
 *  - Continuation lines are appended to description until a `  -` indented sub-bullet
 *    is encountered, at which point we switch to collecting sub-items.
 */
function parseEntry(lines: string[]): Entry | null {
  if (lines.length === 0) return null;
  const first = lines[0].slice(2); // drop "- "
  let title = first;
  let description = "";

  // Try to extract a bold-prefix as the title: `**Title with bold** rest...`
  const boldMatch = /^\*\*([^*]+)\*\*\s*\.?\s*(.*)$/.exec(first);
  if (boldMatch) {
    title = boldMatch[1].trim();
    description = boldMatch[2].trim();
  } else {
    // No bold prefix — split on the first period or 80 chars, whichever first.
    const periodIdx = first.indexOf(". ");
    if (periodIdx > 0 && periodIdx < 100) {
      title = first.slice(0, periodIdx).trim();
      description = first.slice(periodIdx + 2).trim();
    } else {
      title = first.trim();
      description = "";
    }
  }

  // Subsequent lines: either continuation of description, or sub-items.
  const subItems: string[] = [];
  let collectingSubItems = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimStart = line.trimStart();
    if (trimStart === "") continue;
    // Sub-item detection: 2+ leading spaces then "- "
    if (/^\s{2,}-\s/.test(line)) {
      collectingSubItems = true;
      const sub = trimStart.replace(/^- /, "").trim();
      if (sub) subItems.push(sub);
      continue;
    }
    if (collectingSubItems) {
      // Continuation of the previous sub-item
      if (subItems.length > 0) {
        subItems[subItems.length - 1] += " " + trimStart;
      }
    } else {
      description = description ? `${description} ${trimStart}` : trimStart;
    }
  }

  const lowerHaystack = `${title} ${description}`.toLowerCase();
  const isBreaking = /\b(breaking|rupture)\b/.test(lowerHaystack);
  const emoji = inferEmoji(title, description);

  return { title, description, subItems, isBreaking, emoji };
}

// ---------------------------------------------------------------------------
//                            EMOJI INFERENCE
// ---------------------------------------------------------------------------

/**
 * Ordered list of (regex, emoji) pairs scanned against the entry title +
 * description. First match wins. Order matters — put more specific matches
 * (e.g. "minecraft") *before* generic ones (e.g. "jeu").
 */
const EMOJI_RULES: { pattern: RegExp; emoji: string }[] = [
  { pattern: /messag(erie|es?)|chat|conversation|dm\b/i, emoji: "💬" },
  { pattern: /minecraft|modpack|prism|forge|fabric|neoforge/i, emoji: "🎮" },
  { pattern: /serveur|server|ping|latence/i, emoji: "🌐" },
  { pattern: /admin|configuration|panel/i, emoji: "🛠️" },
  { pattern: /ram|m[ée]moire|performance|vitesse/i, emoji: "⚡" },
  { pattern: /s[ée]curit[ée]|firestore rules|rules|protected/i, emoji: "🛡️" },
  { pattern: /particule|wow|design|animation|wanvas|svg|chart|graph/i, emoji: "✨" },
  { pattern: /son|audio|chime|arp[èe]ge|musique/i, emoji: "🔊" },
  { pattern: /update|mise [aà] jour|notif|notification|popup/i, emoji: "🔔" },
  { pattern: /discord|oauth|auth|connexion/i, emoji: "🔐" },
  { pattern: /bug|crash|error|fail/i, emoji: "🐛" },
  { pattern: /layout|css|interface|ui|d[ée]bordement|chevauchement/i, emoji: "🎨" },
  { pattern: /favori|star|fav/i, emoji: "⭐" },
  { pattern: /communaut[ée]|amis?|potes?|users?|joueurs?/i, emoji: "👥" },
  { pattern: /drapeau|pays|country|flag|geo/i, emoji: "🏁" },
  { pattern: /firebase|hosting|deploy/i, emoji: "🔥" },
  { pattern: /rust|cargo|tauri/i, emoji: "🦀" },
  { pattern: /typescript|tsc|type/i, emoji: "📘" },
  { pattern: /raccourci|shortcut|exe/i, emoji: "🎯" },
  { pattern: /icon|banni[èe]re|asset/i, emoji: "🖼️" },
  { pattern: /cache|storage/i, emoji: "💾" },
];

function inferEmoji(title: string, description: string): string | undefined {
  const haystack = `${title} ${description}`;
  for (const rule of EMOJI_RULES) {
    if (rule.pattern.test(haystack)) return rule.emoji;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
//                            HELPERS / META
// ---------------------------------------------------------------------------

function extractFeatured(sections: Section[]): Entry | null {
  // The "headline" feature for the release: the first entry of "Ajouté" if
  // present, falling back to the first entry overall.
  const added = sections.find((s) => s.category === "Ajouté");
  if (added && added.entries.length > 0) return added.entries[0];
  if (sections.length > 0 && sections[0].entries.length > 0) return sections[0].entries[0];
  return null;
}

function computeTotals(sections: Section[]): { category: Category; count: number }[] {
  return sections.map((s) => ({ category: s.category, count: s.entries.length }));
}

function entryNoun(category: Category, count: number): string {
  const plural = count !== 1;
  switch (category) {
    case "Ajouté":
      return plural ? "nouveautés" : "nouveauté";
    case "Changé":
      return plural ? "changements" : "changement";
    case "Corrigé":
      return plural ? "fixes" : "fix";
    case "Supprimé":
      return plural ? "suppressions" : "suppression";
    case "Sécurité":
      return plural ? "renforts" : "renfort";
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type CategoryMeta = {
  icon: LucideIcon;
  symbol: string;
  symbolIcon?: LucideIcon;
  iconColor: string;
  borderL: string;
  headerBg: string;
  symbolBg: string;
  toneChip: string;
  titleColor: string;
};

const CATEGORY_META: Record<Category, CategoryMeta> = {
  Ajouté: {
    icon: Sparkles,
    symbol: "+",
    symbolIcon: Plus,
    iconColor: "text-emerald-300",
    borderL: "border-l-emerald-400/60",
    headerBg: "bg-emerald-500/[0.06]",
    symbolBg: "bg-emerald-500/15 ring-1 ring-emerald-500/25",
    toneChip: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/25 hover:bg-emerald-500/15",
    titleColor: "text-emerald-100",
  },
  Changé: {
    icon: Wand2,
    symbol: "~",
    iconColor: "text-amber-300",
    borderL: "border-l-amber-400/60",
    headerBg: "bg-amber-500/[0.06]",
    symbolBg: "bg-amber-500/15 ring-1 ring-amber-500/25",
    toneChip: "bg-amber-500/10 text-amber-200 ring-amber-500/25 hover:bg-amber-500/15",
    titleColor: "text-amber-100",
  },
  Corrigé: {
    icon: Bug,
    symbol: "*",
    iconColor: "text-rose-300",
    borderL: "border-l-rose-400/60",
    headerBg: "bg-rose-500/[0.06]",
    symbolBg: "bg-rose-500/15 ring-1 ring-rose-500/25",
    toneChip: "bg-rose-500/10 text-rose-200 ring-rose-500/25 hover:bg-rose-500/15",
    titleColor: "text-rose-100",
  },
  Supprimé: {
    icon: Trash2,
    symbol: "−",
    symbolIcon: Minus,
    iconColor: "text-slate-300",
    borderL: "border-l-slate-400/50",
    headerBg: "bg-slate-500/[0.06]",
    symbolBg: "bg-slate-500/15 ring-1 ring-slate-500/25",
    toneChip: "bg-slate-500/10 text-slate-200 ring-slate-500/25 hover:bg-slate-500/15",
    titleColor: "text-slate-100",
  },
  Sécurité: {
    icon: ShieldCheck,
    symbol: "🔒",
    iconColor: "text-violet-300",
    borderL: "border-l-violet-400/60",
    headerBg: "bg-violet-500/[0.06]",
    symbolBg: "bg-violet-500/15 ring-1 ring-violet-500/25",
    toneChip: "bg-violet-500/10 text-violet-200 ring-violet-500/25 hover:bg-violet-500/15",
    titleColor: "text-violet-100",
  },
};
