import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  Megaphone,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  Filter,
  Search,
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import {
  markAllAsRead,
  markAsRead,
  type AppNotification,
  type NotificationKind,
} from "@/firebase/notifications";
import { useAuthStore } from "@/store/auth";
import { useNotifications } from "@/store/firebaseStores";
import { useUIStore } from "@/store/ui";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { ScrollMemoryRoot } from "@/hooks/ScrollMemoryRoot";

/**
 * Full-page notification history. Reachable from :
 *   - the bell panel footer ("Voir tout l'historique")
 *   - direct navigation `{ name: "notifications" }`
 *
 * Features beyond the slide-over panel :
 *   - Kind filter chips (achievement / invitation / friend / news /
 *     release / system) at top
 *   - Read state toggle (all / only unread)
 *   - Free-text search over title + description
 *   - Date grouping (Aujourd'hui / Hier / Cette semaine / Plus ancien)
 *   - Larger cards with full descriptions (no line-clamp)
 *   - Bulk "mark all read" + filter-aware "mark visible read"
 *
 * Auto-scrolls back to last position via ScrollMemoryRoot.
 */

type KindFilter = NotificationKind | "all";
type ReadFilter = "all" | "unread";

const KIND_LABEL: Record<NotificationKind, string> = {
  achievement: "Achievements",
  invitation: "Invitations",
  friend: "Amis",
  news: "News",
  release: "Mises à jour",
  system: "Système",
};

const ICON_BY_KIND: Record<NotificationKind, LucideIcon> = {
  achievement: Sparkles,
  invitation: UserPlus,
  friend: Users,
  news: Megaphone,
  release: Sparkles,
  system: Wrench,
};

const COLOR_BY_KIND: Record<NotificationKind, string> = {
  achievement: "#fcd34d", // amber
  invitation: "#a855f7", // violet
  friend: "#4ade80", // emerald
  news: "#00d4ff", // cyan accent
  release: "#5be3ff", // light cyan
  system: "#94a3b8", // slate
};

export function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const notifs = useNotifications(user?.uid);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [search, setSearch] = useState("");

  // ── Filtered + grouped list ──────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifs.filter((n) => {
      if (kindFilter !== "all" && n.kind !== kindFilter) return false;
      if (readFilter === "unread" && n.readAtMs !== null) return false;
      if (q) {
        const haystack = (n.title + " " + n.description).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [notifs, kindFilter, readFilter, search]);

  // Bucket the visible list by relative date — day-precision.
  const groups = useMemo(() => {
    type Group = { label: string; items: AppNotification[] };
    const result: Group[] = [
      { label: "Aujourd'hui", items: [] },
      { label: "Hier", items: [] },
      { label: "Cette semaine", items: [] },
      { label: "Plus ancien", items: [] },
    ];
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    for (const n of filtered) {
      const t = n.createdAtMs;
      if (t >= startOfToday) result[0].items.push(n);
      else if (t >= startOfYesterday) result[1].items.push(n);
      else if (t >= sevenDaysAgo) result[2].items.push(n);
      else result[3].items.push(n);
    }
    // Drop empty buckets.
    return result.filter((g) => g.items.length > 0);
  }, [filtered]);

  // Counts for the filter chips — uses unfiltered list so the chips
  // always reflect the full dataset.
  const kindCounts = useMemo(() => {
    const map: Partial<Record<NotificationKind, number>> = {};
    for (const n of notifs) map[n.kind] = (map[n.kind] ?? 0) + 1;
    return map;
  }, [notifs]);
  const totalUnread = useMemo(
    () => notifs.filter((n) => n.readAtMs === null).length,
    [notifs],
  );

  const handleClickNotif = async (n: AppNotification) => {
    if (!user) return;
    sounds.click();
    if (n.readAtMs === null) {
      await markAsRead(user.uid, n.id).catch((err) =>
        console.warn("[notifications] mark read failed:", err),
      );
    }
    if (n.link) {
      const route = parseLink(n.link);
      if (route) navigate(route);
    }
  };

  const handleMarkAllVisibleRead = async () => {
    if (!user) return;
    const ids = filtered
      .filter((n) => n.readAtMs === null)
      .map((n) => n.id);
    if (ids.length === 0) return;
    sounds.click();
    await markAllAsRead(user.uid, ids).catch((err) =>
      console.warn("[notifications] mark all visible read failed:", err),
    );
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const ids = notifs
      .filter((n) => n.readAtMs === null)
      .map((n) => n.id);
    if (ids.length === 0) return;
    sounds.click();
    await markAllAsRead(user.uid, ids).catch((err) =>
      console.warn("[notifications] mark all read failed:", err),
    );
  };

  return (
    <ScrollMemoryRoot routeKey="notifications" className="p-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <button
          type="button"
          onClick={() => {
            sounds.click();
            navigate({ name: "home" });
          }}
          className="no-drag mb-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted transition-colors hover:text-fg-primary"
        >
          <ArrowLeft className="size-3.5" /> Retour
        </button>
        <p className="text-xs uppercase tracking-[0.25em] text-accent">
          Centre de notifications
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-5xl text-fg-primary">
            Notifications
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.click();
                navigate({ name: "settings" });
              }}
              className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-medium text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-fg-primary"
              title="Configurer les notifications natives par type"
            >
              <SettingsIcon className="size-3.5" /> Paramètres
            </button>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={totalUnread === 0}
              className={cn(
                "no-drag inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-all",
                totalUnread > 0
                  ? "bg-accent/10 text-accent ring-accent/30 hover:bg-accent/20 hover:shadow-[0_0_14px_var(--color-accent-soft)]"
                  : "cursor-not-allowed bg-white/[0.02] text-fg-dim ring-white/[0.04] opacity-60",
              )}
            >
              <CheckCheck className="size-3.5" /> Tout marquer lu
              {totalUnread > 0 && (
                <span className="ml-0.5 font-mono">({totalUnread})</span>
              )}
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          {notifs.length === 0
            ? "Aucune notification reçue pour le moment."
            : `${notifs.length} notification${notifs.length > 1 ? "s" : ""} au total · ${totalUnread} non lue${totalUnread > 1 ? "s" : ""}`}
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.08 } }}
        className="mb-6 grid gap-3 rounded-2xl bg-bg-base/30 p-4 ring-1 ring-white/[0.04]"
      >
        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl bg-bg-base/40 px-3 py-2 ring-1 ring-white/[0.06] focus-within:ring-accent/40">
          <Search className="size-3.5 shrink-0 text-fg-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans le titre ou la description…"
            className="w-full bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-dim"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="rounded p-0.5 text-fg-dim hover:text-fg-primary"
              aria-label="Effacer la recherche"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-dim">
            <Filter className="size-3" /> Type
          </span>
          <FilterChip
            label="Tous"
            active={kindFilter === "all"}
            count={notifs.length}
            onClick={() => setKindFilter("all")}
          />
          {(Object.keys(KIND_LABEL) as NotificationKind[]).map((k) => (
            <FilterChip
              key={k}
              label={KIND_LABEL[k]}
              icon={ICON_BY_KIND[k]}
              color={COLOR_BY_KIND[k]}
              active={kindFilter === k}
              count={kindCounts[k] ?? 0}
              disabled={(kindCounts[k] ?? 0) === 0}
              onClick={() => setKindFilter(k)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-dim">
            <Eye className="size-3" /> État
          </span>
          <FilterChip
            label="Tout"
            active={readFilter === "all"}
            onClick={() => setReadFilter("all")}
          />
          <FilterChip
            label="Non lues"
            icon={EyeOff}
            active={readFilter === "unread"}
            count={totalUnread}
            disabled={totalUnread === 0}
            onClick={() => setReadFilter("unread")}
          />
        </div>
      </motion.div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState hasFilters={kindFilter !== "all" || readFilter !== "all" || !!search.trim()} />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.15 } }}
          className="space-y-6"
        >
          {/* Bulk action — shown only when filtering */}
          {(kindFilter !== "all" || readFilter !== "all" || !!search.trim()) &&
            filtered.some((n) => n.readAtMs === null) && (
              <div className="flex items-center justify-between rounded-xl bg-accent/[0.05] px-4 py-2.5 ring-1 ring-accent/20">
                <span className="text-xs text-fg-muted">
                  {filtered.filter((n) => n.readAtMs === null).length} non lue
                  {filtered.filter((n) => n.readAtMs === null).length > 1 ? "s" : ""}{" "}
                  parmi {filtered.length} notification{filtered.length > 1 ? "s" : ""} affichée
                  {filtered.length > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={handleMarkAllVisibleRead}
                  className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/25"
                >
                  <CheckCheck className="size-3" /> Tout marquer lu (filtre)
                </button>
              </div>
            )}

          <AnimatePresence mode="popLayout">
            {groups.map((g) => (
              <motion.div
                key={g.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-3 flex items-center gap-3 px-1 text-[10px] uppercase tracking-[0.25em] text-fg-dim">
                  {g.label}
                  <span className="h-px flex-1 bg-white/[0.06]" />
                  <span className="font-mono text-[9px] text-fg-muted">
                    {g.items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.items.map((n) => (
                    <NotifCard
                      key={n.id}
                      notif={n}
                      onClick={() => handleClickNotif(n)}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </ScrollMemoryRoot>
  );
}

function FilterChip({
  label,
  icon: Icon,
  color,
  active,
  count,
  disabled,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  color?: string;
  active: boolean;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        sounds.click();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "no-drag inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-all",
        disabled
          ? "cursor-not-allowed bg-white/[0.02] text-fg-dim ring-white/[0.04] opacity-50"
          : active
            ? "bg-accent/15 text-accent ring-accent/40 shadow-[0_0_12px_var(--color-accent-soft)]"
            : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60 hover:text-fg-primary",
      )}
      style={
        active && color
          ? { color, boxShadow: `0 0 12px ${color}33`, ["--tw-ring-color" as string]: color + "66" }
          : undefined
      }
    >
      {Icon && <Icon className="size-3" />}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="font-mono text-[10px] tabular-nums opacity-70">
          {count}
        </span>
      )}
    </button>
  );
}

function NotifCard({
  notif,
  onClick,
}: {
  notif: AppNotification;
  onClick: () => void;
}) {
  const Icon = ICON_BY_KIND[notif.kind] ?? Bell;
  const color = COLOR_BY_KIND[notif.kind];
  const unread = notif.readAtMs === null;
  const dt = notif.createdAtMs ? new Date(notif.createdAtMs) : null;
  return (
    <motion.button
      type="button"
      layout
      onClick={onClick}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      className={cn(
        "no-drag group relative flex w-full items-start gap-4 rounded-2xl p-4 text-left ring-1 transition-all",
        unread
          ? "bg-accent/[0.04] ring-accent/25 hover:bg-accent/[0.08] hover:ring-accent/40"
          : "bg-white/[0.02] ring-white/[0.04] hover:bg-white/[0.04]",
      )}
    >
      <div
        className="grid size-10 shrink-0 place-items-center rounded-xl ring-1"
        style={{
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
          boxShadow: unread ? `0 0 14px ${color}40` : undefined,
          ["--tw-ring-color" as string]: color + "44",
        }}
      >
        <Icon className="size-4" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-sm font-semibold",
              unread ? "text-fg-primary" : "text-fg-muted",
            )}
          >
            {notif.title}
          </span>
          {unread && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{
                background: color,
                boxShadow: `0 0 6px ${color}`,
              }}
            />
          )}
          <span className="ml-auto shrink-0 text-[10px] text-fg-dim">
            {dt ? formatRelative(dt) : ""}
          </span>
        </div>
        {notif.description && (
          <div className="mt-1 break-words text-xs text-fg-muted">
            {notif.description}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-fg-dim">
          <span style={{ color }}>{KIND_LABEL[notif.kind]}</span>
          {notif.link && (
            <>
              <span>·</span>
              <span className="text-accent opacity-60 group-hover:opacity-100">
                Click → ouvre la page
              </span>
            </>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="grid h-64 place-items-center rounded-3xl bg-white/[0.02] ring-1 ring-white/[0.04]">
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.04] text-fg-dim ring-1 ring-white/[0.06]">
          <Bell className="size-6" />
        </div>
        <div className="text-sm font-medium text-fg-primary">
          {hasFilters
            ? "Aucune notification ne correspond à ton filtre."
            : "Pas encore de notifications."}
        </div>
        <div className="mt-1 text-xs text-fg-muted">
          {hasFilters
            ? "Essaie d'élargir tes critères ou efface la recherche."
            : "Achievements, invitations à jouer, news — tout arrivera ici."}
        </div>
      </div>
    </div>
  );
}

/** Naive "X min ago" formatter — same as the slide-over panel.
 *  Falls back to a short date for entries older than a week. */
function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "à l'instant";
  if (diff < hour) return `il y a ${Math.floor(diff / min)} min`;
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Same parser as the slide-over panel. Resolves a serialized link
 *  into a route compatible with `useUIStore.navigate()`. */
function parseLink(link: string): Parameters<ReturnType<typeof useUIStore.getState>["navigate"]>[0] | null {
  if (link === "home") return { name: "home" };
  if (link === "library") return { name: "library" };
  if (link === "messages") return { name: "messages" };
  if (link === "community") return { name: "community" };
  if (link === "settings") return { name: "settings" };
  if (link === "profile") return { name: "profile" };
  if (link === "notifications") return { name: "notifications" };
  const [head, ...rest] = link.split(":");
  const tail = rest.join(":");
  if (head === "module" && tail) return { name: "module", moduleId: tail };
  if (head === "crews" && tail) return { name: "crews", crewId: tail };
  if (head === "messages" && tail) return { name: "messages", conversationId: tail };
  if (head === "user" && tail) return { name: "user-profile", uid: tail };
  return null;
}
