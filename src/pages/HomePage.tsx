import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Play, Gamepad2 } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useModules, usePlaytime } from "@/store/firebaseStores";
import { formatPlaytime, type PlaytimeEntry } from "@/firebase/playtime";
import type { LauncherModule } from "@/types/module";
import { ModuleParticles } from "@/components/ui/Particles";
import { FriendsOnlineStrip } from "@/components/home/FriendsOnlineStrip";
import { NewsCard } from "@/components/home/NewsCard";
import { ActionsChip } from "@/components/home/ActionsChip";
import { NextAchievementChip } from "@/components/home/NextAchievementChip";

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
  const modules = useModules();
  const playtime = usePlaytime(me?.uid);
  const [, setNow] = useState(Date.now());

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

  // Quick-launch rail : top 4 modules par playtime, en excluant le "Continue ici"
  // pour ne pas dupliquer. Si playtime vide, on prend les 4 premiers modules.
  const quickLaunch = useMemo(() => {
    const byTime = [...playtime]
      .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
      .map((p) => modules.find((m) => m.id === p.moduleId))
      .filter((m): m is LauncherModule => !!m && m.id !== lastPlayed?.id);
    const filler = modules.filter((m) => m.id !== lastPlayed?.id && !byTime.includes(m));
    return [...byTime, ...filler].slice(0, 4);
  }, [playtime, modules, lastPlayed]);

  return (
    <div className="relative h-full overflow-y-auto px-10 py-10">
      {/* Animated gradient mesh — three colored radial blobs layered with
          time-of-day-tinted hues, each pulsing at its own slow tempo so
          the background "breathes" without becoming distracting. */}
      <GradientMesh accent={greeting.particleColor} heroGradient={greeting.heroGradient} />

      {/* Subtle ambient particles tinted to time-of-day */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <ModuleParticles
          config={{
            preset: greeting.particles,
            color: greeting.particleColor,
            density: 50,
          }}
        />
      </div>

      {/* Floating colored orbs (slow, blurry, soft) — adds life without
          distracting from the content. Two orbs in opposite quadrants. */}
      <FloatingOrbs accent={greeting.particleColor} />

      <div className="relative mx-auto w-full max-w-7xl">
        {/* ─── Top band: greeting full-width ──────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <GreetingHero
            firstName={firstName}
            greetingLabel={greeting.label}
            greetingEmoji={greeting.emoji}
            avatar={me?.photoURL ?? null}
          />
          <ActionsChip />
        </motion.div>

        {/* ─── 2-column split: Continue + Quick launch | Amis + News ─ */}
        <div className="grid grid-cols-12 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="col-span-12 lg:col-span-7"
          >
            {lastPlayed && (
              <ContinueCard
                module={lastPlayed}
                entry={lastPlayedEntry}
                onPlay={() => navigate({ name: "module", moduleId: lastPlayed.id })}
              />
            )}

            {quickLaunch.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
                className="mt-6"
              >
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-fg-muted">
                  <Gamepad2 className="size-3" />
                  Lancement rapide
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {quickLaunch.map((mod, i) => (
                    <QuickLaunchCard
                      key={mod.id}
                      module={mod}
                      delay={0.25 + i * 0.05}
                      onClick={() => navigate({ name: "module", moduleId: mod.id })}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="col-span-12 lg:col-span-5"
          >
            <FriendsOnlineStrip />
            {/* Rotating "almost there" chip — auto-hides if the user has
                no in-progress achievements. Click → AchievementsPage. */}
            <div className="mt-4">
              <NextAchievementChip />
            </div>
            <NewsCard />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              GRADIENT MESH
// ---------------------------------------------------------------------------

/**
 * Layered animated gradient mesh shown behind the greeting hero. Three
 * radial blobs at different positions and sizes, each pulsing on its own
 * tempo so the wall feels alive without ever drawing attention. The base
 * `heroGradient` (time-of-day) sits underneath as a static tint.
 */
function GradientMesh({ accent, heroGradient }: { accent: string; heroGradient: string }) {
  return (
    <>
      {/* Static time-of-day tint (cheap, no animation) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-50 blur-3xl"
        style={{ background: heroGradient }}
      />
      {/* Three pulsing blobs that breathe at different rates. `willChange`
          + `transform: translateZ(0)` promote each blob to its own GPU
          layer so the browser caches the rendered blur and only re-paints
          the cheap opacity/scale tween — measurable CPU win on lower-end
          machines (no functional/visual change). */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-12 left-[-6%] size-[460px] rounded-full blur-3xl"
        style={{ background: accent, willChange: "transform, opacity", transform: "translateZ(0)" }}
        animate={{ opacity: [0.18, 0.32, 0.18], scale: [1, 1.08, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[8%] size-[360px] rounded-full blur-3xl"
        style={{ background: "#a855f7", willChange: "transform, opacity", transform: "translateZ(0)" }}
        animate={{ opacity: [0.14, 0.26, 0.14], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-32 left-[40%] size-[300px] rounded-full blur-3xl"
        style={{ background: "#ec4899", willChange: "transform, opacity", transform: "translateZ(0)" }}
        animate={{ opacity: [0.08, 0.18, 0.08], scale: [1, 1.06, 1] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
//                              FLOATING ORBS
// ---------------------------------------------------------------------------

function FloatingOrbs({ accent }: { accent: string }) {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute size-[420px] rounded-full opacity-25 blur-3xl"
        style={{
          background: accent,
          top: "8%",
          left: "-10%",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
        animate={{ x: [0, 60, 20, 0], y: [0, 30, 80, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute size-[360px] rounded-full opacity-20 blur-3xl"
        style={{
          background: "#a855f7",
          bottom: "5%",
          right: "-8%",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
        animate={{ x: [0, -50, -20, 0], y: [0, -40, -10, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
//                          QUICK LAUNCH CARD
// ---------------------------------------------------------------------------

function QuickLaunchCard({
  module,
  delay,
  onClick,
}: {
  module: LauncherModule;
  delay: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, scale: 1.02 }}
      onClick={onClick}
      className="no-drag group relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-white/[0.06] text-left transition-shadow hover:ring-accent/40 hover:shadow-[0_0_24px_var(--color-accent-soft)]"
    >
      {module.bannerUrl || module.iconUrl ? (
        <img
          src={module.bannerUrl ?? module.iconUrl ?? ""}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-bg-soft to-fuchsia-500/20" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-base/95 via-bg-base/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <span className="line-clamp-1 text-sm font-semibold text-fg-primary drop-shadow-md">
          {module.name}
        </span>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/90 text-bg-base shadow-[0_0_12px_var(--color-accent-soft)] transition-shadow group-hover:shadow-[0_0_20px_var(--color-accent-glow)]">
          <Play className="size-3.5 fill-current" strokeWidth={0} />
        </span>
      </div>
    </motion.button>
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
  /** tsparticles preset matching the time-of-day vibe. */
  particles: "stars" | "fireflies" | "sparkles" | "snow";
  /** Tint applied to the particles (also used by the floating orbs). */
  particleColor: string;
} {
  const h = now.getHours();
  if (h >= 5 && h < 12) {
    return {
      label: "Bon matin",
      emoji: "☀️",
      heroGradient:
        "radial-gradient(ellipse at top left, rgba(56,189,248,0.25), transparent 60%), radial-gradient(ellipse at top right, rgba(251,146,60,0.18), transparent 60%)",
      particles: "sparkles",
      particleColor: "#38bdf8",
    };
  }
  if (h >= 12 && h < 18) {
    return {
      label: "Bon aprem",
      emoji: "🌤️",
      heroGradient:
        "radial-gradient(ellipse at top left, rgba(251,191,36,0.22), transparent 60%), radial-gradient(ellipse at top right, rgba(0,212,255,0.18), transparent 60%)",
      particles: "sparkles",
      particleColor: "#fbbf24",
    };
  }
  if (h >= 18 && h < 22) {
    return {
      label: "Bonsoir",
      emoji: "🌆",
      heroGradient:
        "radial-gradient(ellipse at top left, rgba(244,114,182,0.22), transparent 60%), radial-gradient(ellipse at top right, rgba(251,146,60,0.18), transparent 60%)",
      particles: "fireflies",
      particleColor: "#f472b6",
    };
  }
  return {
    label: "Bonne nuit",
    emoji: "🌙",
    heroGradient:
      "radial-gradient(ellipse at top left, rgba(139,92,246,0.25), transparent 60%), radial-gradient(ellipse at top right, rgba(0,212,255,0.18), transparent 60%)",
    particles: "stars",
    particleColor: "#8b5cf6",
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
