import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  Gamepad2,
  Send,
  Shield,
  Users,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import {
  kickCrewMember,
  setCrewMemberRole,
  type Crew,
  type CrewMember,
  type CrewRole,
  type CustomRole,
} from "@/firebase/crews";
import { useUsers } from "@/store/firebaseStores";
import { sendGameInvitation } from "@/firebase/invitations";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { useTickEvery } from "@/hooks/useTickEvery";
import { statusFromLastSeen, type PresenceStatus } from "@/firebase/presence";
import type { SupporterTier } from "@/lib/supporterTier";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import { TierBannerOverlay } from "@/components/tier/TierBanner";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { isAdminUid } from "@/lib/admin";

/**
 * Right-side panel listing every member of the selected crew. Each row
 * shows the user's avatar, name, role badge, and live status :
 *
 *  - Green dot     → online
 *  - Yellow dot    → idle (active <5 min ago)
 *  - Empty circle  → offline
 *  - Game presence → if currently playing, the game name shows below
 *    the username with a quick "Inviter à jouer" button if the
 *    current viewer is also in-game.
 *
 * Owner / admin viewers get extra hover actions : promote / demote /
 * kick (gated by `setCrewMemberRole` and `kickCrewMember` Firestore
 * rules).
 */
export function MembersList({
  crew,
  members,
  customRoles,
  myUid,
  myRole,
}: {
  crew: Crew;
  members: CrewMember[];
  /** Custom roles defined for this crew (VIP, Citoyen, etc). Used
   *  to colour each member's name and group the list Discord-style.
   *  Empty array when none defined → single "Membres" section. */
  customRoles: CustomRole[];
  myUid: string;
  myRole: CrewRole | null;
}) {
  const allUsers = useUsers();
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  // Shared tick — drives status freshness without per-row interval.
  const now = useTickEvery(15_000);

  // Index `allUsers` by uid once, reused across every member lookup.
  // Replaces the previous O(n²) `allUsers.find(u => u.uid === ...)`
  // pattern that was called both in displayedMembers and sortedMembers.
  const usersByUid = useMemo(() => {
    const map = new Map<string, (typeof allUsers)[number]>();
    for (const u of allUsers) map.set(u.uid, u);
    return map;
  }, [allUsers]);

  const myActivity = useMemo(
    () => (me?.uid ? usersByUid.get(me.uid)?.currentActivity ?? null : null),
    [usersByUid, me?.uid],
  );

  const amOwnerOrAdmin =
    myRole === "owner" || myRole === "admin" || crew.ownerUid === myUid;

  // Master crews implicitly include every authed user. Showing a
  // pure list of `members` docs there would only show people who
  // explicitly joined since the migration. Fall back to the global
  // user list to give the launcher-wide community feel back.
  // Single pass : build, enrich with live presence, then sort. Avoids
  // the previous double-useMemo that re-iterated allUsers.
  const sortedMembers = useMemo(() => {
    const rank: Record<CrewRole, number> = { owner: 0, admin: 1, member: 2 };

    let base: DisplayedMember[];
    if (crew.isMaster) {
      const byUid = new Map(members.map((m) => [m.uid, m] as const));
      base = allUsers.map((u) => {
        const m = byUid.get(u.uid);
        return {
          uid: u.uid,
          role: m?.role ?? "member",
          joinedAt: m?.joinedAt ?? 0,
          displayName: u.displayName ?? m?.displayName ?? "Anonyme",
          avatarUrl: u.avatarUrl ?? m?.avatarUrl ?? null,
          tier: u.tier ?? null,
          lastSeen: u.lastSeen ?? null,
          status: statusFromLastSeen(u.lastSeen, now),
          currentActivity: u.currentActivity ?? null,
          customRoleId: m?.customRoleId ?? null,
        };
      });
    } else {
      base = members.map((m) => {
        const live = usersByUid.get(m.uid);
        return {
          uid: m.uid,
          role: m.role,
          joinedAt: m.joinedAt,
          displayName: live?.displayName ?? m.displayName ?? "Anonyme",
          avatarUrl: live?.avatarUrl ?? m.avatarUrl ?? null,
          tier: live?.tier ?? null,
          lastSeen: live?.lastSeen ?? null,
          status: statusFromLastSeen(live?.lastSeen ?? null, now),
          currentActivity: live?.currentActivity ?? null,
          customRoleId: m.customRoleId ?? null,
        };
      });
    }

    return base.sort((a, b) => {
      const roleDiff = rank[a.role] - rank[b.role];
      if (roleDiff !== 0) return roleDiff;
      const aOnline = a.status === "online" ? 1 : 0;
      const bOnline = b.status === "online" ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [crew.isMaster, members, allUsers, usersByUid, now]);

  // ── Discord-style grouping ──────────────────────────────────────
  // For each custom role used by at least one member, build a section
  // with the role name + colour as header. Members without a custom
  // role land in a fallback "Membres" section. Sections are ordered
  // by `position` (ascending = higher in the list, Discord
  // convention) ; the "Membres" fallback is always last.
  const customRolesById = useMemo(() => {
    const map = new Map<string, CustomRole>();
    for (const r of customRoles) map.set(r.id, r);
    return map;
  }, [customRoles]);

  const groupedMembers = useMemo(() => {
    type Section = {
      key: string;
      label: string;
      color: string | null;
      members: DisplayedMember[];
    };

    // Extract the owners first — they're always pinned at the very
    // top of the list, regardless of custom role grouping. We
    // collect ALL members who qualify as "owner" so the section can
    // hold multiple if needed (rare for user crews but possible on
    // master crews with multiple launcher admins).
    //
    // A member counts as owner when ANY of the following holds :
    //   - their role is explicitly "owner"
    //   - their uid matches crew.ownerUid (covers the case where the
    //     owner has no member doc yet on a fresh crew)
    //   - the crew is a master crew AND they're a launcher admin
    //     (legacy master crews created before ownerUid was wired up
    //     have an empty ownerUid string ; the launcher admin is the
    //     de-facto owner of every master crew anyway)
    const isOwnerOf = (m: DisplayedMember) =>
      m.role === "owner" ||
      (!!crew.ownerUid && m.uid === crew.ownerUid) ||
      (crew.isMaster && isAdminUid(m.uid));
    const ownerMembers = sortedMembers.filter(isOwnerOf);
    const ownerUidSet = new Set(ownerMembers.map((m) => m.uid));
    const remaining = sortedMembers.filter((m) => !ownerUidSet.has(m.uid));

    const byRole = new Map<string | null, DisplayedMember[]>();
    for (const m of remaining) {
      // A customRoleId is only "real" if it points to an existing
      // role doc. Stale ids (deleted role) collapse into the
      // fallback group rather than rendering an orphan section.
      const roleId =
        m.customRoleId && customRolesById.has(m.customRoleId)
          ? m.customRoleId
          : null;
      const list = byRole.get(roleId) ?? [];
      list.push(m);
      byRole.set(roleId, list);
    }
    const sections: Section[] = [];

    // Owner section at the very top. The header label is always
    // "Propriétaire" in amber (matches the Crown glyph) regardless
    // of any custom role any owner might also have — keeps the
    // hierarchy unambiguous : "this is the owner section, top of
    // the list, period". Any custom role colouring still flows
    // through to each row's name via the per-member memberRole
    // resolution below.
    if (ownerMembers.length > 0) {
      sections.push({
        key: "__owner__",
        label: "Propriétaire",
        color: "#fcd34d",
        members: ownerMembers,
      });
    }

    // Custom-role sections next, ordered by position.
    const usedRoles = customRoles
      .filter((r) => byRole.has(r.id))
      .sort((a, b) => a.position - b.position);
    for (const role of usedRoles) {
      sections.push({
        key: role.id,
        label: role.name,
        color: role.color,
        members: byRole.get(role.id) ?? [],
      });
    }
    // Fallback group for roleless members. Skip when empty.
    const fallback = byRole.get(null);
    if (fallback && fallback.length > 0) {
      sections.push({
        key: "__none__",
        label: "Membres",
        color: null,
        members: fallback,
      });
    }
    return sections;
  }, [
    sortedMembers,
    customRoles,
    customRolesById,
    crew.ownerUid,
    crew.isMaster,
  ]);

  const handlePromote = async (target: DisplayedMember) => {
    if (busyUid) return;
    setBusyUid(target.uid);
    try {
      await setCrewMemberRole(crew.id, target.uid, "admin");
      sounds.click();
    } finally {
      setBusyUid(null);
    }
  };
  const handleDemote = async (target: DisplayedMember) => {
    if (busyUid) return;
    setBusyUid(target.uid);
    try {
      await setCrewMemberRole(crew.id, target.uid, "member");
      sounds.click();
    } finally {
      setBusyUid(null);
    }
  };
  const handleKick = async (target: DisplayedMember) => {
    if (busyUid) return;
    if (
      !confirm(
        `Expulser ${target.displayName} du crew ? Iel pourra rejoindre à nouveau si le crew est public ou via un nouveau code.`,
      )
    )
      return;
    setBusyUid(target.uid);
    try {
      await kickCrewMember(crew.id, target.uid);
      sounds.click();
    } finally {
      setBusyUid(null);
    }
  };
  const handleInviteToPlay = async (target: DisplayedMember) => {
    if (!me || !myActivity) return;
    try {
      await sendGameInvitation({
        fromUid: me.uid,
        fromName: me.displayName ?? "Anonyme",
        fromAvatar: me.photoURL ?? null,
        toUid: target.uid,
        moduleId: myActivity.moduleId,
        moduleName: myActivity.moduleName,
        moduleIconUrl: null,
      });
      sounds.success();
    } catch (err) {
      console.warn("[crews] invite to play failed:", err);
      sounds.error();
    }
  };

  // Live online count for the crew. Used in the footer stats.
  const onlineCount = useMemo(() => {
    const now = Date.now();
    return sortedMembers.filter((m) => {
      const live = allUsers.find((u) => u.uid === m.uid);
      return live?.lastSeen && now - live.lastSeen < 60_000;
    }).length;
  }, [sortedMembers, allUsers]);
  // Active in-game count. Lets us surface "3 membres jouent en ce
  // moment" as a kind of live community pulse.
  const inGameCount = useMemo(
    () =>
      sortedMembers.filter(
        (m) => allUsers.find((u) => u.uid === m.uid)?.currentActivity,
      ).length,
    [sortedMembers, allUsers],
  );

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-white/[0.06] bg-bg-soft/30 lg:flex">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Users className="size-3.5 text-fg-dim" />
        <span className="text-[10px] uppercase tracking-wider text-fg-muted">
          Membres
        </span>
        <span className="ml-auto text-[10px] text-fg-dim">
          {sortedMembers.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sortedMembers.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-fg-dim">
            Aucun membre pour l'instant.
          </div>
        ) : (
          groupedMembers.map((section) => (
            <div key={section.key} className="mb-2">
              {/* Discord-style section header : role name in role
                  colour + member count. Hidden for the fallback
                  "Membres" group when it's the only section, to
                  avoid noise on crews with no custom roles at all. */}
              {!(
                groupedMembers.length === 1 && section.key === "__none__"
              ) && (
                <div
                  className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: section.color ?? "var(--color-fg-muted)",
                  }}
                >
                  <span className="truncate">{section.label}</span>
                  <span
                    className="ml-auto font-mono text-[10px] tabular-nums opacity-70"
                    style={{ color: "var(--color-fg-dim)" }}
                  >
                    {section.members.length}
                  </span>
                </div>
              )}
              {section.members.map((m) => {
                // Name-coloring sources from the *member's actual*
                // customRoleId, not the enclosing section. This keeps
                // the synthetic "Propriétaire" section's owner row at
                // their tier color when they have no custom role —
                // the section header already conveys ownership in
                // amber, no need to repeat it on the name.
                const memberRole = m.customRoleId
                  ? customRolesById.get(m.customRoleId) ?? null
                  : null;
                return (
                  <MemberRow
                    key={m.uid}
                    member={m}
                    customRoleColor={memberRole?.color ?? null}
                    customRoleName={memberRole?.name ?? null}
                    myUid={myUid}
                    amOwnerOrAdmin={amOwnerOrAdmin}
                    // Drive the Crown glyph from the section the
                    // member sits in : if they're in the synthetic
                    // owner section (which already factored in
                    // launcher-admin override on master crews), they
                    // get the crown. Falls back to crew.ownerUid for
                    // safety when the owner section isn't present.
                    isOwnerOfCrew={
                      section.key === "__owner__" || crew.ownerUid === m.uid
                    }
                    busy={busyUid === m.uid}
                    myActivity={myActivity}
                    onPromote={() => handlePromote(m)}
                    onDemote={() => handleDemote(m)}
                    onKick={() => handleKick(m)}
                    onInvite={() => handleInviteToPlay(m)}
                    onOpenProfile={() =>
                      navigate({ name: "user-profile", uid: m.uid })
                    }
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
      {/* Crew stats footer — aggregated live signals for the crew. */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
          Pouls du crew
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <StatPill
            label="En ligne"
            value={onlineCount}
            tone="emerald"
          />
          <StatPill
            label="En jeu"
            value={inGameCount}
            tone="amber"
            icon={<Gamepad2 className="size-2.5" />}
          />
        </div>
        <div className="mt-2 text-[10px] text-fg-dim">
          Crew créé{" "}
          {(() => {
            if (!crew.createdAt) return "récemment";
            const days = Math.max(
              0,
              Math.floor((Date.now() - crew.createdAt) / (24 * 60 * 60_000)),
            );
            if (days < 1) return "aujourd'hui";
            if (days < 30) return `il y a ${days} j`;
            if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
            return `il y a ${Math.floor(days / 365)} an${days >= 730 ? "s" : ""}`;
          })()}
        </div>
      </div>
    </aside>
  );
}

function StatPill({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "cyan";
  icon?: React.ReactNode;
}) {
  const toneClass = {
    emerald: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/20",
    amber: "text-amber-300 bg-amber-500/10 ring-amber-500/20",
    cyan: "text-cyan-300 bg-cyan-500/10 ring-cyan-500/20",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 ring-1",
        toneClass,
      )}
    >
      {icon}
      <span className="font-mono tabular-nums">{value}</span>
      <span className="text-[10px] text-fg-dim">{label}</span>
    </div>
  );
}

type DisplayedMember = {
  uid: string;
  role: CrewRole;
  joinedAt: number;
  displayName: string;
  avatarUrl: string | null;
  tier: SupporterTier | null;
  lastSeen: number | null;
  status: PresenceStatus;
  currentActivity:
    | { moduleId: string; moduleName: string; startedAt: number }
    | null;
  /** Custom role id assigned to this member, if any. Resolved against
   *  the crew's `customRoles` list to render the colored name + the
   *  Discord-style section header. */
  customRoleId: string | null;
};

/**
 * Memoized to skip re-renders unless the member's visible state
 * actually changed. The parent rebuilds the list on every shared
 * tick (15 s) and on every Firestore snapshot — without this memo,
 * 60+ MemberRow + their TierAvatar / TierBanner / motion.div would
 * re-render every tick.
 *
 * The parent passes pre-computed status / tier / activity (no more
 * useUsers().find() per row), so the comparator can do a strict
 * field-by-field compare without referential gotchas.
 */
const MemberRow = memo(function MemberRow({
  member,
  customRoleColor,
  customRoleName,
  myUid,
  amOwnerOrAdmin,
  isOwnerOfCrew,
  busy,
  myActivity,
  onPromote,
  onDemote,
  onKick,
  onInvite,
  onOpenProfile,
}: {
  member: DisplayedMember;
  /** Hex colour from the member's custom role, or null when none.
   *  When set, overrides the tier-based name colour so the role
   *  identity wins (Discord behaviour). */
  customRoleColor: string | null;
  /** Human-readable role label — shown in the row tooltip + as a
   *  small dot next to the avatar so a non-zero glance still
   *  conveys role membership inside a long section. */
  customRoleName: string | null;
  myUid: string;
  amOwnerOrAdmin: boolean;
  isOwnerOfCrew: boolean;
  busy: boolean;
  myActivity: { moduleId: string; moduleName: string; startedAt: number } | null;
  onPromote: () => void;
  onDemote: () => void;
  onKick: () => void;
  onInvite: () => void;
  onOpenProfile: () => void;
}) {
  const status = member.status;
  const activity = member.currentActivity;
  const isMine = member.uid === myUid;

  return (
    <div
      className="group relative"
      title={customRoleName ?? undefined}
    >
      <TierBannerOverlay tier={member.tier} rounded="lg" />
      <button
        type="button"
        onClick={onOpenProfile}
        className="no-drag relative flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <div className="relative shrink-0">
          <TierAvatar
            tier={member.tier}
            src={member.avatarUrl}
            displayName={member.displayName}
            size="sm"
            fallbackTone="muted"
          />
          <span
            className={cn(
              "absolute -left-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-bg-soft",
              status === "online"
                ? "bg-emerald-400"
                : status === "idle"
                  ? "bg-amber-400"
                  : "bg-fg-dim/50",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-sm">
            {customRoleColor ? (
              // Custom role wins over tier coloring : the displayName
              // is rendered in the role's hex color (Discord-style).
              // We bypass TierName entirely so there's a single
              // authoritative color source. Keep the truncation
              // behaviour identical though.
              <span
                className="truncate"
                style={{ color: customRoleColor }}
              >
                {member.displayName}
              </span>
            ) : (
              <TierName
                tier={member.tier}
                name={member.displayName}
                className="truncate text-fg-primary"
              />
            )}
            {member.role === "owner" || isOwnerOfCrew ? (
              <Crown className="size-3 shrink-0 text-amber-300" />
            ) : member.role === "admin" ? (
              <Shield className="size-3 shrink-0 text-cyan-300" />
            ) : null}
          </div>
          {activity && (
            <div className="flex items-center gap-1 truncate text-[10px] text-emerald-300">
              <Gamepad2 className="size-2.5" />
              <span className="truncate">{activity.moduleName}</span>
            </div>
          )}
        </div>
      </button>

      {/* Hover actions — only show for non-self members and only when
          we have a meaningful action available. */}
      <AnimatePresence>
        {!isMine && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md bg-bg-elevated/95 p-0.5 shadow-lg ring-1 ring-white/[0.06] group-hover:flex"
          >
            {myActivity && (
              <button
                type="button"
                onClick={onInvite}
                title={`Inviter à ${myActivity.moduleName}`}
                className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-50"
                disabled={busy}
              >
                <Send className="size-3.5" />
              </button>
            )}
            {amOwnerOrAdmin && member.role !== "owner" && (
              <>
                {member.role === "member" ? (
                  <button
                    type="button"
                    onClick={onPromote}
                    title="Promouvoir admin"
                    disabled={busy}
                    className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-cyan-500/15 hover:text-cyan-300 disabled:opacity-50"
                  >
                    <UserPlus className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onDemote}
                    title="Rétrograder en membre"
                    disabled={busy}
                    className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50"
                  >
                    <UserMinus className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onKick}
                  title="Expulser du crew"
                  disabled={busy}
                  className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}, (prev, next) => {
  // Strict compare on every visible field. Callbacks (onPromote etc.)
  // are inline arrow funcs from the parent — comparing them would
  // defeat the memo, so we skip them. The closures stay valid because
  // they capture stable references (`me`, `navigate`, busy state).
  return (
    prev.member.uid === next.member.uid &&
    prev.member.role === next.member.role &&
    prev.member.tier === next.member.tier &&
    prev.member.status === next.member.status &&
    prev.member.displayName === next.member.displayName &&
    prev.member.avatarUrl === next.member.avatarUrl &&
    prev.member.lastSeen === next.member.lastSeen &&
    prev.member.customRoleId === next.member.customRoleId &&
    prev.member.currentActivity?.moduleId === next.member.currentActivity?.moduleId &&
    prev.member.currentActivity?.moduleName === next.member.currentActivity?.moduleName &&
    prev.customRoleColor === next.customRoleColor &&
    prev.customRoleName === next.customRoleName &&
    prev.amOwnerOrAdmin === next.amOwnerOrAdmin &&
    prev.isOwnerOfCrew === next.isOwnerOfCrew &&
    prev.busy === next.busy &&
    prev.myUid === next.myUid &&
    prev.myActivity?.moduleId === next.myActivity?.moduleId
  );
});
