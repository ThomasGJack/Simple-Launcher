import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Clock,
  Flame,
  Gamepad2,
  Library,
  MessageCircle,
  Play,
  Users,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { watchModules } from "@/firebase/modules";
import { watchPlaytime, formatPlaytime, type PlaytimeEntry } from "@/firebase/playtime";
import { watchAllUsers, statusFromLastSeen, type UserPresence, type PresenceStatus } from "@/firebase/presence";
import { watchConversationsFor } from "@/firebase/messaging";
import { otherParticipant, unreadCount, type Conversation } from "@/types/messaging";
import { useMinecraftStatus } from "@/lib/minecraftStatus";
import { Mascot, type MascotMood } from "@/components/ui/Mascot";
import type { LauncherModule } from "@/types/module";
import { cn } from "@/lib/cn";

/**
 * Home page — bento-grid social hub. Surfaces in priority:
 *  1. Personal greeting (with time-of-day-aware tone)
 *  2. "Continue playing" card with the user's most recently launched game
 *  3. Live status of friends + featured Minecraft server
 *  4. Recent DMs and a few headline stats
 *  5. Compact activity feed of what the community is up to
 *
 * Designed to make the launcher feel alive at a glance — even before
 * scrolling. Time-of-day greeting picks one of four moods (matin / aprem /
 * soir / nuit), and the gradient mesh in the hero shifts hue accordingly.
 */
export function HomePage() {
  const navigate = useUIStore((s) => s.navigate);
  const me = useAuthStore((s) => s.user);
  const [modules, setModules] = useState<LauncherModule[]>([]);
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [playtime, setPlaytime] = useState<PlaytimeEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [, setNow] = useState(Date.now());

  useEffect(() => watchModules(setModules), []);
  useEffect(() => watchAllUsers(setUsers), []);
  useEffect(() => {
    if (!me) return;
    return watchPlaytime(me.uid, setPlaytime);
  }, [me?.uid]);
  useEffect(() => {
    if (!me) return;
    return watchConversationsFor(me.uid, setConversations);
  }, [me?.uid]);
  // Re-tick every 30s so relative time strings stay fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const greeting = useMemo(() => greetingFor(new Date()), []);
  const firstName = (me?.displayName ?? "").split(" ")[0] || "joueur";

  // The most recent module the user actually played, used as the "continue"
  // hero card. Falls back to the first available module if no playtime yet.
  const lastPlayed = useMemo(() => {
    if (playtime.length === 0) return modules[0] ?? null;
    const sorted = [...playtime].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
    for (const entry of sorted) {
      const mod = modules.find((m) => m.id === entry.moduleId);
      if (mod) return mod;
    }
    return modules[0] ?? null;
  }, [playtime, modules]);

  const lastPlayedEntry = useMemo(
    () => playtime.find((p) => p.moduleId === lastPlayed?.id) ?? null,
    [playtime, lastPlayed],
  );

  // Total playtime across the last 7 days, used as a "streak / hours" stat.
  const totalPlaytimeMs = useMemo(
    () => playtime.reduce((s, p) => s + p.totalMs, 0),
    [playtime],
  );

  // Friends online: every user other than me, sorted by status (online > idle > offline)
  // and presented as a compact list of avatars + activity.
  const friendsOnline = useMemo(() => {
    const order: Record<PresenceStatus, number> = { online: 0, idle: 1, offline: 2 };
    return users
      .filter((u) => u.uid !== me?.uid)
      .map((u) => ({ user: u, status: statusFromLastSeen(u.lastSeen) }))
      .sort((a, b) => {
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return (b.user.lastSeen ?? 0) - (a.user.lastSeen ?? 0);
      });
  }, [users, me]);

  const onlineCount = friendsOnline.filter((f) => f.status === "online").length;

  // The most-recent unread conversations float to the top of the side panel.
  const recentConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => {
        const aTs = a.lastMessage?.sentAt ?? 0;
        const bTs = b.lastMessage?.sentAt ?? 0;
        return bTs - aTs;
      })
      .slice(0, 4);
  }, [conversations]);

  const totalUnread = useMemo(
    () => (me ? conversations.reduce((s, c) => s + unreadCount(c, me.uid), 0) : 0),
    [conversations, me],
  );

  // Find the first module with a Minecraft server configured — that becomes
  // the "live server" tile on the right side.
  const featuredServerModule = useMemo(() => {
    return modules.find((m) => m.server?.type === "minecraft") ?? null;
  }, [modules]);

  // Decide which mood the mascot should be in. Priority order matters —
  // the most "in your face" mood wins so the penguin matches the most
  // significant thing happening in the user's launcher right now.
  const { mascotMood, mascotTooltip } = useMemo<{ mascotMood: MascotMood; mascotTooltip: string }>(() => {
    if (totalUnread > 0) {
      return { mascotMood: "chat", mascotTooltip: `${totalUnread} message(s) non lu(s)` };
    }
    const someoneIsPlaying = friendsOnline.some(
      (f) => f.status === "online" && f.user.currentActivity,
    );
    if (someoneIsPlaying) {
      return { mascotMood: "gaming", mascotTooltip: "Tes potes sont en train de jouer" };
    }
    if (onlineCount > 0) {
      return { mascotMood: "happy", mascotTooltip: `${onlineCount} pote(s) en ligne` };
    }
    // No friends + no recent play → mascot dozes off after 24h of inactivity.
    const lastPlayedTs = lastPlayedEntry?.lastPlayedAt ?? 0;
    const aDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (lastPlayedTs && lastPlayedTs < aDayAgo) {
      return { mascotMood: "sleeping", mascotTooltip: "Glitch dort… reviens bientôt !" };
    }
    return { mascotMood: "idle", mascotTooltip: "Glitch attend à tes côtés" };
  }, [totalUnread, friendsOnline, onlineCount, lastPlayedEntry]);

  return (
    <div className="relative h-full overflow-y-auto px-10 py-10">
      {/* Time-of-day-tinted halo behind the greeting hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60 blur-3xl"
        style={{
          background: greeting.heroGradient,
        }}
      />

      <div className="relative grid grid-cols-12 gap-5">
        {/* ─── Greeting + Continue playing — left big block ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="col-span-12 lg:col-span-8"
        >
          <GreetingHero
            firstName={firstName}
            greetingLabel={greeting.label}
            greetingEmoji={greeting.emoji}
            avatar={me?.photoURL ?? null}
          />
          {lastPlayed && (
            <ContinueCard
              module={lastPlayed}
              entry={lastPlayedEntry}
              onPlay={() => navigate({ name: "module", moduleId: lastPlayed.id })}
            />
          )}
        </motion.div>

        {/* ─── Right column: stats + friends + server ──────────────── */}
        <div className="col-span-12 space-y-5 lg:col-span-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-2 gap-3"
          >
            <StatTile
              icon={Library}
              label="Jeux dispos"
              value={String(modules.length)}
              tone="cyan"
            />
            <StatTile
              icon={Clock}
              label="Total joué"
              value={totalPlaytimeMs > 0 ? formatPlaytime(totalPlaytimeMs) : "0"}
              tone="amber"
            />
            <StatTile
              icon={Users}
              label="En ligne"
              value={String(onlineCount)}
              tone="emerald"
              accent={onlineCount > 0}
            />
            <StatTile
              icon={Flame}
              label="Sessions"
              value={String(playtime.reduce((s, p) => s + p.totalLaunches, 0))}
              tone="rose"
            />
          </motion.div>

          <FriendsOnlineTile
            friends={friendsOnline.slice(0, 6)}
            totalCount={friendsOnline.length}
            onClickFriend={(uid) =>
              me &&
              navigate({
                name: "messages",
                conversationId: [me.uid, uid].sort().join("__"),
              })
            }
            onSeeAll={() => navigate({ name: "community" })}
          />

          {featuredServerModule && featuredServerModule.server?.type === "minecraft" && (
            <ServerHeartbeatTile
              moduleId={featuredServerModule.id}
              moduleName={featuredServerModule.name}
              address={featuredServerModule.server.address}
              onClick={() =>
                navigate({ name: "module", moduleId: featuredServerModule.id })
              }
            />
          )}
        </div>

        {/* ─── Bottom row: conversations + activity feed ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="col-span-12 lg:col-span-5"
        >
          <ConversationsTile
            conversations={recentConversations}
            myUid={me?.uid ?? ""}
            unreadTotal={totalUnread}
            onOpen={(cid) => navigate({ name: "messages", conversationId: cid })}
            onSeeAll={() => navigate({ name: "messages" })}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="col-span-12 lg:col-span-7"
        >
          <ActivityFeedTile users={friendsOnline} modules={modules} />
        </motion.div>
      </div>

      {/* Mascot — context-aware Glitch penguin in the bottom-right that
          changes mood based on what's happening. See `mascotMood` below. */}
      <Mascot mood={mascotMood} tooltip={mascotTooltip} />
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              GREETING HERO
// ---------------------------------------------------------------------------

function GreetingHero({
  firstName,
  greetingLabel,
  greetingEmoji,
  avatar,
}: {
  firstName: string;
  greetingLabel: string;
  greetingEmoji: string;
  avatar: string | null;
}) {
  const [time, setTime] = useState(formatHourMinute(new Date()));
  useEffect(() => {
    const t = setInterval(() => setTime(formatHourMinute(new Date())), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mb-5 flex items-center gap-4 rounded-3xl glass-strong p-6">
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className="size-14 rounded-2xl object-cover ring-1 ring-accent/30 shadow-[0_0_24px_var(--color-accent-soft)]"
        />
      ) : (
        <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 font-display text-2xl text-accent ring-1 ring-accent/30">
          {firstName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-accent">
          <span className="text-base leading-none">{greetingEmoji}</span>
          {greetingLabel}
        </div>
        <h1 className="mt-1 truncate font-display text-4xl text-fg-primary">
          Salut, <span className="text-glow-accent">{firstName}</span>
        </h1>
      </div>
      <div className="hidden text-right md:block">
        <div className="font-display text-2xl tabular-nums text-fg-primary">{time}</div>
        <div className="text-[10px] uppercase tracking-wider text-fg-dim">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                          CONTINUE PLAYING CARD
// ---------------------------------------------------------------------------

function ContinueCard({
  module,
  entry,
  onPlay,
}: {
  module: LauncherModule;
  entry: PlaytimeEntry | null;
  onPlay: () => void;
}) {
  const lastWhen = entry?.lastPlayedAt ? formatRelative(entry.lastPlayedAt) : "Jamais joué";
  const totalSelf = entry ? formatPlaytime(entry.totalMs) : "—";
  return (
    <motion.button
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
      onClick={onPlay}
      className="no-drag group relative block aspect-[16/8] w-full overflow-hidden rounded-3xl glass-strong text-left"
    >
      {module.bannerUrl ? (
        <img
          src={module.bannerUrl}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-bg-soft to-fuchsia-500/20" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg-base/70 via-transparent to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-between p-6">
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-bg-base/60 px-2.5 py-1 text-[10px] uppercase tracking-wider text-accent ring-1 ring-accent/20 backdrop-blur-md">
          <Clock className="size-3" /> Continue ici
        </div>

        <div>
          <div className="flex items-end gap-3">
            {module.iconUrl && (
              <img
                src={module.iconUrl}
                alt=""
                className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display text-3xl text-fg-primary drop-shadow-lg">
                {module.name}
              </div>
              <div className="mt-0.5 text-xs text-fg-muted">
                Joué {lastWhen} · {totalSelf} cumulés
              </div>
            </div>
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-bg-base shadow-[0_0_24px_var(--color-accent-glow)] transition-shadow group-hover:shadow-[0_0_36px_var(--color-accent-glow)]">
              <Play className="size-6 fill-current" strokeWidth={0} />
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/[0.04] transition-all group-hover:ring-accent/30 group-hover:shadow-[inset_0_0_30px_var(--color-accent-soft)]" />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
//                                 STAT TILE
// ---------------------------------------------------------------------------

const STAT_TONES = {
  cyan: {
    bg: "bg-accent/10",
    text: "text-accent",
    ring: "ring-accent/20",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    ring: "ring-emerald-500/20",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    ring: "ring-amber-500/20",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    ring: "ring-rose-500/20",
  },
} as const;

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  accent = false,
}: {
  icon: typeof Library;
  label: string;
  value: string;
  tone: keyof typeof STAT_TONES;
  accent?: boolean;
}) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={cn(
        "rounded-2xl glass p-3.5 ring-1 transition-shadow",
        t.ring,
        accent && "shadow-[0_0_20px_var(--color-accent-soft)]",
      )}
    >
      <div className={cn("mb-2 grid size-8 place-items-center rounded-lg", t.bg, t.text)}>
        <Icon className="size-4" strokeWidth={2} />
      </div>
      <div className="font-display text-xl tabular-nums text-fg-primary">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-fg-dim">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                          FRIENDS ONLINE TILE
// ---------------------------------------------------------------------------

function FriendsOnlineTile({
  friends,
  totalCount,
  onClickFriend,
  onSeeAll,
}: {
  friends: { user: UserPresence; status: PresenceStatus }[];
  totalCount: number;
  onClickFriend: (uid: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <div className="rounded-2xl glass p-4">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wider">
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <Users className="size-3" /> Amis en ligne
        </span>
        <button
          onClick={onSeeAll}
          className="text-fg-dim transition-colors hover:text-fg-primary"
        >
          Tout voir →
        </button>
      </div>
      {friends.length === 0 ? (
        <div className="rounded-xl bg-bg-base/40 p-3 text-center text-xs text-fg-muted">
          Aucun pote pour l'instant. Invite-en depuis la page Communauté.
        </div>
      ) : (
        <div className="space-y-1.5">
          {friends.map(({ user, status }) => (
            <button
              key={user.uid}
              onClick={() => onClickFriend(user.uid)}
              className="no-drag group flex w-full items-center gap-3 rounded-xl bg-bg-base/30 p-2 text-left transition-colors hover:bg-bg-base/60"
            >
              <div className="relative shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="size-9 rounded-lg object-cover ring-1 ring-white/10" />
                ) : (
                  <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-xs font-display text-accent">
                    {(user.displayName ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-bg-soft",
                    status === "online" && "bg-success shadow-[0_0_6px_currentColor]",
                    status === "idle" && "bg-amber-400",
                    status === "offline" && "bg-fg-dim",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-fg-primary">
                  {user.displayName ?? user.username ?? "Anonyme"}
                </div>
                <div className="truncate text-[10px] text-fg-dim">
                  {user.currentActivity && status === "online" ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Gamepad2 className="size-2.5" /> {user.currentActivity.moduleName}
                    </span>
                  ) : status === "online" ? (
                    "Dans le menu"
                  ) : status === "idle" ? (
                    "Inactif"
                  ) : (
                    "Hors ligne"
                  )}
                </div>
              </div>
              <MessageCircle className="size-3.5 shrink-0 text-fg-dim opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      {totalCount > friends.length && (
        <div className="mt-2 text-center text-[10px] text-fg-dim">
          +{totalCount - friends.length} autres amis hors ligne
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//                       SERVER HEARTBEAT TILE (live MC)
// ---------------------------------------------------------------------------

function ServerHeartbeatTile({
  moduleName,
  address,
  onClick,
}: {
  moduleId: string;
  moduleName: string;
  address: string;
  onClick: () => void;
}) {
  const status = useMinecraftStatus(address);
  return (
    <motion.button
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
      onClick={onClick}
      className="no-drag relative block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-success/[0.08] via-bg-soft/40 to-emerald-500/[0.08] p-4 text-left ring-1 ring-success/20"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-success">
          <span
            className={cn(
              "size-1.5 rounded-full",
              status?.online ? "bg-success shadow-[0_0_6px_currentColor]" : "bg-fg-dim",
            )}
          />
          Serveur Minecraft
        </span>
        {status?.players && status.online && (
          <span className="font-display text-xl tabular-nums text-fg-primary">
            {status.players.online}
            <span className="text-xs text-fg-muted">/{status.players.max}</span>
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-fg-primary">{moduleName}</div>
      <div className="truncate font-mono text-[10px] text-fg-dim">{address}</div>
      {status?.online && status.players && status.players.online > 0 && status.playersList && (
        <div className="mt-2 flex items-center gap-1">
          {status.playersList.slice(0, 5).map((p) => (
            <img
              key={p.uuid || p.name}
              src={
                p.uuid
                  ? `https://crafatar.com/avatars/${p.uuid}?size=24&overlay`
                  : `https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/24`
              }
              alt={p.name}
              title={p.name}
              className="size-6 rounded-md ring-1 ring-white/10"
              loading="lazy"
            />
          ))}
          {status.players.online > 5 && (
            <span className="ml-1 text-[10px] text-fg-dim">+{status.players.online - 5}</span>
          )}
        </div>
      )}
      {status && !status.online && (
        <div className="mt-2 text-[10px] text-fg-dim">Serveur hors ligne</div>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
//                          CONVERSATIONS TILE
// ---------------------------------------------------------------------------

function ConversationsTile({
  conversations,
  myUid,
  unreadTotal,
  onOpen,
  onSeeAll,
}: {
  conversations: Conversation[];
  myUid: string;
  unreadTotal: number;
  onOpen: (cid: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wider">
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <MessageCircle className="size-3" /> Dernières conversations
          {unreadTotal > 0 && (
            <span className="ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-bg-base">
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          )}
        </span>
        <button onClick={onSeeAll} className="text-fg-dim transition-colors hover:text-fg-primary">
          Tout voir →
        </button>
      </div>
      {conversations.length === 0 ? (
        <div className="rounded-xl bg-bg-base/40 p-5 text-center text-xs text-fg-muted">
          Aucune conversation. Démarre-en une depuis la page Communauté.
        </div>
      ) : (
        <div className="space-y-1.5">
          {conversations.map((c) => {
            const peerUid = otherParticipant(c, myUid);
            const peerName = c.participantNames[peerUid] ?? "Inconnu";
            const peerAvatar = c.participantAvatars[peerUid] ?? null;
            const last = c.lastMessage;
            const unread = unreadCount(c, myUid);
            const isMine = last?.senderUid === myUid;
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="no-drag flex w-full items-center gap-3 rounded-xl bg-bg-base/30 p-2.5 text-left transition-colors hover:bg-bg-base/60"
              >
                {peerAvatar ? (
                  <img src={peerAvatar} alt="" className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                ) : (
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 font-display text-accent">
                    {peerName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", unread > 0 ? "font-semibold text-fg-primary" : "text-fg-primary")}>
                      {peerName}
                    </span>
                    {last && (
                      <span className="shrink-0 text-[10px] text-fg-dim">{formatRelative(last.sentAt)}</span>
                    )}
                  </div>
                  <div className={cn("truncate text-xs", unread > 0 ? "text-fg-primary" : "text-fg-muted")}>
                    {last
                      ? (isMine ? "Toi : " : "") + last.text
                      : <span className="italic text-fg-dim">Aucun message</span>}
                  </div>
                </div>
                {unread > 0 && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-bg-base">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//                          ACTIVITY FEED TILE
// ---------------------------------------------------------------------------

/**
 * Compact rolling activity feed synthesized from the presence + module
 * snapshots. Shows what users in the launcher are currently up to ("X joue à
 * Y", "Z est en ligne") with a relative timestamp. Pure derived data — no
 * extra Firestore subscription, just re-renders when presence updates.
 */
function ActivityFeedTile({
  users,
  modules,
}: {
  users: { user: UserPresence; status: PresenceStatus }[];
  modules: LauncherModule[];
}) {
  const events = useMemo(() => {
    type Event = {
      id: string;
      avatar: string | null;
      name: string;
      verb: string;
      target: string;
      ts: number;
      iconColor: string;
    };
    const out: Event[] = [];
    for (const { user, status } of users) {
      if (status === "online" && user.currentActivity) {
        const mod = modules.find((m) => m.id === user.currentActivity?.moduleId);
        out.push({
          id: `${user.uid}-playing`,
          avatar: user.avatarUrl,
          name: user.displayName ?? user.username ?? "Anonyme",
          verb: "joue à",
          target: mod?.name ?? user.currentActivity.moduleName,
          ts: user.currentActivity.startedAt,
          iconColor: "text-accent",
        });
      } else if (status === "online") {
        out.push({
          id: `${user.uid}-online`,
          avatar: user.avatarUrl,
          name: user.displayName ?? user.username ?? "Anonyme",
          verb: "est",
          target: "dans le menu",
          ts: user.lastSeen ?? 0,
          iconColor: "text-success",
        });
      }
    }
    return out
      .filter((e) => e.ts > 0)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 6);
  }, [users, modules]);

  return (
    <div className="h-full rounded-2xl glass p-5">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wider">
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <Activity className="size-3" /> Activité communauté
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-success">
          <span className="size-1 rounded-full bg-success shadow-[0_0_6px_currentColor]" /> Live
        </span>
      </div>
      {events.length === 0 ? (
        <div className="rounded-xl bg-bg-base/40 p-5 text-center text-xs text-fg-muted">
          Personne n'est en ligne en ce moment. Reviens plus tard 👋
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-3">
              {ev.avatar ? (
                <img src={ev.avatar} alt="" className="size-7 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
              ) : (
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-[10px] font-display text-accent">
                  {ev.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-medium text-fg-primary">{ev.name}</span>{" "}
                <span className="text-fg-muted">{ev.verb}</span>{" "}
                <span className={ev.iconColor}>{ev.target}</span>
              </div>
              <span className="shrink-0 text-[10px] text-fg-dim">{formatRelative(ev.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
//                              TIME OF DAY
// ---------------------------------------------------------------------------

/**
 * Returns a contextual greeting + matching emoji + a subtle hue gradient
 * tinted to the current time of day. Splits the day into four moods:
 *  - Matin (5h → 12h)    : crisp cyan-orange dawn
 *  - Après-midi (12 → 18) : warm amber daylight
 *  - Soir (18 → 22)       : magenta sunset
 *  - Nuit (22 → 5)        : deep violet moonlight
 */
function greetingFor(now: Date): {
  label: string;
  emoji: string;
  /** CSS gradient string applied to the hero halo behind the greeting card. */
  heroGradient: string;
} {
  const h = now.getHours();
  if (h >= 5 && h < 12) {
    return {
      label: "Bon matin",
      emoji: "☀️",
      heroGradient:
        "radial-gradient(ellipse at top left, rgba(56,189,248,0.25), transparent 60%), radial-gradient(ellipse at top right, rgba(251,146,60,0.18), transparent 60%)",
    };
  }
  if (h >= 12 && h < 18) {
    return {
      label: "Bon aprem",
      emoji: "🌤️",
      heroGradient:
        "radial-gradient(ellipse at top left, rgba(251,191,36,0.22), transparent 60%), radial-gradient(ellipse at top right, rgba(0,212,255,0.18), transparent 60%)",
    };
  }
  if (h >= 18 && h < 22) {
    return {
      label: "Bonsoir",
      emoji: "🌆",
      heroGradient:
        "radial-gradient(ellipse at top left, rgba(244,114,182,0.22), transparent 60%), radial-gradient(ellipse at top right, rgba(251,146,60,0.18), transparent 60%)",
    };
  }
  return {
    label: "Bonne nuit",
    emoji: "🌙",
    heroGradient:
      "radial-gradient(ellipse at top left, rgba(139,92,246,0.25), transparent 60%), radial-gradient(ellipse at top right, rgba(0,212,255,0.18), transparent 60%)",
  };
}

// ---------------------------------------------------------------------------
//                                HELPERS
// ---------------------------------------------------------------------------

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} h`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatHourMinute(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
