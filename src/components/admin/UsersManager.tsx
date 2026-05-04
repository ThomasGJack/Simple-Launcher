import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Heart,
  Loader2,
  Search,
  Sparkles,
  UserCircle2,
  X,
} from "lucide-react";
import { useUsers } from "@/store/firebaseStores";
import { setUserTier } from "@/firebase/userProfile";
import { TIER_LABEL, type SupporterTier } from "@/lib/supporterTier";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import { TierBannerOverlay } from "@/components/tier/TierBanner";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import type { UserPresence } from "@/firebase/presence";

type TierFilter = "all" | "none" | SupporterTier;

/**
 * Admin panel : grant / revoke supporter tiers manually for any
 * launcher user. The list reads from `useUsers()` so updates are live
 * (clicking Soutien on a user reflects immediately in their TierAvatar
 * everywhere — sidebar, crews, public profile).
 *
 * Used as the temporary admin tool until Stripe + Cloud Functions
 * automate tier assignment from subscription webhooks. The Firestore
 * rule allows admins to write any user doc, so the dropdown updates
 * the `tier` field directly.
 */
export function UsersManager() {
  const allUsers = useUsers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TierFilter>("all");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (filter === "none" && u.tier !== null) return false;
      if (filter !== "all" && filter !== "none" && u.tier !== filter) return false;
      if (!q) return true;
      return (
        (u.displayName ?? "").toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [allUsers, search, filter]);

  // Stat counters per tier — surfaced as filter pills with live counts.
  const counts = useMemo(() => {
    const c = { all: allUsers.length, none: 0, supporter: 0, vip: 0, legend: 0 };
    for (const u of allUsers) {
      if (u.tier === "supporter") c.supporter++;
      else if (u.tier === "vip") c.vip++;
      else if (u.tier === "legend") c.legend++;
      else c.none++;
    }
    return c;
  }, [allUsers]);

  const handleSetTier = async (uid: string, next: SupporterTier | null) => {
    setBusyUid(uid);
    try {
      await setUserTier(uid, next);
      sounds.success();
    } catch (err) {
      console.warn("[users] tier update failed:", err);
      sounds.error();
      alert(
        `Impossible de mettre à jour le tier : ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-bg-soft/40 p-3 ring-1 ring-white/[0.06]">
        <FilterPill
          active={filter === "all"}
          label="Tous"
          count={counts.all}
          tone="neutral"
          onClick={() => setFilter("all")}
        />
        <FilterPill
          active={filter === "none"}
          label="Sans tier"
          count={counts.none}
          tone="neutral"
          onClick={() => setFilter("none")}
        />
        <FilterPill
          active={filter === "supporter"}
          label="Soutien"
          count={counts.supporter}
          tone="bronze"
          icon={<Heart className="size-3" />}
          onClick={() => setFilter("supporter")}
        />
        <FilterPill
          active={filter === "vip"}
          label="VIP"
          count={counts.vip}
          tone="vip"
          icon={<Crown className="size-3" />}
          onClick={() => setFilter("vip")}
        />
        <FilterPill
          active={filter === "legend"}
          label="Légende"
          count={counts.legend}
          tone="legend"
          icon={<Sparkles className="size-3" />}
          onClick={() => setFilter("legend")}
        />

        <div className="ml-auto flex flex-1 items-center gap-2 rounded-xl bg-bg-base/40 px-3 py-1.5 ring-1 ring-white/[0.06] focus-within:ring-accent/40 sm:max-w-xs">
          <Search className="size-3.5 text-fg-dim" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom / username / uid…"
            className="no-drag flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-dim focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="grid size-5 place-items-center rounded text-fg-muted hover:bg-white/[0.06]"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* User list */}
      {visible.length === 0 ? (
        <div className="grid h-48 place-items-center rounded-2xl bg-bg-soft/30 text-sm text-fg-muted ring-1 ring-white/[0.06]">
          <div className="text-center">
            <UserCircle2 className="mx-auto mb-2 size-8 text-fg-dim" strokeWidth={1.5} />
            Aucun utilisateur ne correspond.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((u, i) => (
            <UserRow
              key={u.uid}
              user={u}
              busy={busyUid === u.uid}
              onSetTier={(t) => handleSetTier(u.uid, t)}
              index={i}
            />
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-fg-dim">
        Les changements sont appliqués immédiatement via Firestore. La
        TierAvatar de l'utilisateur (sidebar, crews, profil public) se
        met à jour en temps réel chez lui sans qu'il ait besoin de
        rafraîchir le launcher.
      </p>
    </div>
  );
}

function UserRow({
  user,
  busy,
  onSetTier,
  index,
}: {
  user: UserPresence;
  busy: boolean;
  onSetTier: (tier: SupporterTier | null) => void;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.02 }}
      className="relative flex flex-wrap items-center gap-3 rounded-2xl bg-bg-soft/30 p-3 ring-1 ring-white/[0.06]"
    >
      <TierBannerOverlay tier={user.tier} rounded="2xl" />
      <TierAvatar
        tier={user.tier}
        src={user.avatarUrl}
        displayName={user.displayName ?? user.username ?? "?"}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TierName
            tier={user.tier}
            name={user.displayName ?? user.username ?? "Anonyme"}
            className="truncate text-sm font-medium text-fg-primary"
          />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-fg-dim">
          {user.username && (
            <span className="rounded bg-bg-base/40 px-1.5 py-0.5">@{user.username}</span>
          )}
          <code className="rounded bg-bg-base/40 px-1.5 py-0.5 font-mono">
            {user.uid.slice(0, 12)}…
          </code>
          {user.lastSeen && (
            <span>vu il y a {formatRelative(user.lastSeen)}</span>
          )}
        </div>
      </div>

      {/* Tier picker — segmented control */}
      <div className="flex shrink-0 items-center gap-1 rounded-xl bg-bg-base/40 p-1 ring-1 ring-white/[0.06]">
        <TierButton
          active={user.tier === null}
          tier={null}
          disabled={busy}
          onClick={() => onSetTier(null)}
        />
        <TierButton
          active={user.tier === "supporter"}
          tier="supporter"
          disabled={busy}
          onClick={() => onSetTier("supporter")}
        />
        <TierButton
          active={user.tier === "vip"}
          tier="vip"
          disabled={busy}
          onClick={() => onSetTier("vip")}
        />
        <TierButton
          active={user.tier === "legend"}
          tier="legend"
          disabled={busy}
          onClick={() => onSetTier("legend")}
        />
        {busy && <Loader2 className="ml-1 size-3.5 animate-spin text-fg-dim" />}
      </div>
    </motion.div>
  );
}

function TierButton({
  active,
  tier,
  disabled,
  onClick,
}: {
  active: boolean;
  tier: SupporterTier | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const meta =
    tier === null
      ? {
          label: "—",
          tooltip: "Aucun tier (gratuit)",
          activeClass: "bg-white/[0.06] text-fg-primary ring-white/20",
          inactiveClass: "text-fg-muted hover:bg-white/[0.04]",
        }
      : tier === "supporter"
        ? {
            label: "Soutien",
            tooltip: "Soutien — Heart bronze",
            activeClass:
              "bg-amber-700/20 text-amber-300 ring-amber-700/40 shadow-[0_0_12px_rgba(180,83,9,0.4)]",
            inactiveClass: "text-fg-muted hover:bg-amber-700/10 hover:text-amber-300",
          }
        : tier === "vip"
          ? {
              label: "VIP",
              tooltip: "VIP — gradient violet/cyan animé",
              activeClass:
                "bg-gradient-to-r from-violet-500/30 to-cyan-500/30 text-fg-primary ring-violet-400/40 shadow-[0_0_14px_rgba(167,139,250,0.5)]",
              inactiveClass:
                "text-fg-muted hover:bg-violet-500/10 hover:text-violet-300",
            }
          : {
              label: "Légende",
              tooltip: "Légende — rainbow shimmer + sparkles",
              activeClass:
                "bg-gradient-to-r from-amber-400/30 via-orange-500/30 to-amber-400/30 text-amber-200 ring-amber-400/50 shadow-[0_0_18px_rgba(255,215,0,0.6)]",
              inactiveClass:
                "text-fg-muted hover:bg-amber-400/10 hover:text-amber-300",
            };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={meta.tooltip}
      className={cn(
        "rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 transition disabled:opacity-50",
        active ? meta.activeClass : `${meta.inactiveClass} ring-transparent`,
      )}
    >
      {meta.label}
    </button>
  );
}

function FilterPill({
  active,
  label,
  count,
  tone,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone: "neutral" | "bronze" | "vip" | "legend";
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  const colorClass = {
    neutral: active
      ? "bg-accent/20 text-accent ring-accent/30"
      : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-white/[0.04]",
    bronze: active
      ? "bg-amber-700/20 text-amber-300 ring-amber-700/40"
      : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-amber-700/10",
    vip: active
      ? "bg-gradient-to-r from-violet-500/25 to-cyan-500/25 text-fg-primary ring-violet-400/40"
      : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-violet-500/10",
    legend: active
      ? "bg-gradient-to-r from-amber-400/25 via-orange-500/25 to-amber-400/25 text-amber-200 ring-amber-400/40"
      : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-amber-400/10",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium ring-1 transition",
        colorClass,
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] tabular-nums",
          active ? "bg-bg-base/40" : "bg-bg-base/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "à l'instant";
  if (diff < hour) return `${Math.floor(diff / min)} min`;
  if (diff < day) return `${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Keep the unused-checking happy if TIER_LABEL goes unused at some point.
void TIER_LABEL;
