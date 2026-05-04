import { useMemo, useState } from "react";
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
} from "@/firebase/crews";
import { useUsers } from "@/store/firebaseStores";
import { sendGameInvitation } from "@/firebase/invitations";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

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
  myUid,
  myRole,
}: {
  crew: Crew;
  members: CrewMember[];
  myUid: string;
  myRole: CrewRole | null;
}) {
  const allUsers = useUsers();
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const myActivity = useMemo(
    () => allUsers.find((u) => u.uid === me?.uid)?.currentActivity ?? null,
    [allUsers, me?.uid],
  );

  const amOwnerOrAdmin =
    myRole === "owner" || myRole === "admin" || crew.ownerUid === myUid;

  // Master crews implicitly include every authed user. Showing a
  // pure list of `members` docs there would only show people who
  // explicitly joined since the migration. Fall back to the global
  // user list to give the launcher-wide community feel back.
  const displayedMembers = useMemo<DisplayedMember[]>(() => {
    if (crew.isMaster) {
      // Master : merge everyone in the launcher with the (sparse)
      // members docs to read role overrides where they exist.
      const byUid = new Map(members.map((m) => [m.uid, m] as const));
      return allUsers.map((u) => {
        const m = byUid.get(u.uid);
        return {
          uid: u.uid,
          role: m?.role ?? "member",
          joinedAt: m?.joinedAt ?? 0,
          displayName: u.displayName ?? m?.displayName ?? "Anonyme",
          avatarUrl: u.avatarUrl ?? m?.avatarUrl ?? null,
        };
      });
    }
    // User crew : strict list, but enrich with live presence data
    // from the global users store so we get up-to-date avatars and
    // game presence even if the member doc was last written long ago.
    return members.map((m) => {
      const live = allUsers.find((u) => u.uid === m.uid);
      return {
        uid: m.uid,
        role: m.role,
        joinedAt: m.joinedAt,
        displayName: live?.displayName ?? m.displayName ?? "Anonyme",
        avatarUrl: live?.avatarUrl ?? m.avatarUrl ?? null,
      };
    });
  }, [crew.isMaster, members, allUsers]);

  // Sort owner→admin→member, then online→offline, then alphabetical.
  const sortedMembers = useMemo(() => {
    const rank: Record<CrewRole, number> = { owner: 0, admin: 1, member: 2 };
    const onlineWindow = 60_000;
    const now = Date.now();
    return [...displayedMembers].sort((a, b) => {
      const roleDiff = rank[a.role] - rank[b.role];
      if (roleDiff !== 0) return roleDiff;
      const aLive = allUsers.find((u) => u.uid === a.uid);
      const bLive = allUsers.find((u) => u.uid === b.uid);
      const aOnline =
        aLive?.lastSeen && now - aLive.lastSeen < onlineWindow ? 1 : 0;
      const bOnline =
        bLive?.lastSeen && now - bLive.lastSeen < onlineWindow ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [displayedMembers, allUsers]);

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
          sortedMembers.map((m) => (
            <MemberRow
              key={m.uid}
              member={m}
              myUid={myUid}
              amOwnerOrAdmin={amOwnerOrAdmin}
              isOwnerOfCrew={crew.ownerUid === m.uid}
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
};

function MemberRow({
  member,
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
  const allUsers = useUsers();
  const live = allUsers.find((u) => u.uid === member.uid);
  const lastSeen = live?.lastSeen ?? null;
  const status = !lastSeen
    ? "offline"
    : Date.now() - lastSeen < 60_000
      ? "online"
      : Date.now() - lastSeen < 5 * 60_000
        ? "idle"
        : "offline";
  const activity = live?.currentActivity ?? null;
  const isMine = member.uid === myUid;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpenProfile}
        className="no-drag flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <div className="relative shrink-0">
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt=""
              className="size-8 rounded-full object-cover ring-1 ring-white/10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="grid size-8 place-items-center rounded-full bg-bg-elevated text-[10px] uppercase text-fg-muted ring-1 ring-white/10">
              {member.displayName.slice(0, 1)}
            </div>
          )}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-bg-soft",
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
            <span className="truncate text-fg-primary">{member.displayName}</span>
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
}
