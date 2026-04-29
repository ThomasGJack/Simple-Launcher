import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Play } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { watchModules } from "@/firebase/modules";
import { watchPlaytime, formatPlaytime, type PlaytimeEntry } from "@/firebase/playtime";
import { watchAllUsers, statusFromLastSeen, type UserPresence, type PresenceStatus } from "@/firebase/presence";
import { watchConversationsFor } from "@/firebase/messaging";
import { unreadCount, type Conversation } from "@/types/messaging";
import { Mascot, type MascotMood } from "@/components/ui/Mascot";
import type { LauncherModule } from "@/types/module";

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

  const totalUnread = useMemo(
    () => (me ? conversations.reduce((s, c) => s + unreadCount(c, me.uid), 0) : 0),
    [conversations, me],
  );

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

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative mx-auto w-full max-w-3xl"
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
