import { Trophy, Medal, Sparkles, Flame, Heart, type LucideIcon, MessageCircle, Gamepad2, Clock, Star, Zap, Users } from "lucide-react";
import type { LauncherModule } from "@/types/module";
import type { PlaytimeEntry } from "@/firebase/playtime";
import type { Conversation } from "@/types/messaging";

/**
 * One unlockable achievement. Pure data — actual unlocking happens
 * client-side by evaluating `condition()` against the user's live state.
 * When all conditions become true, the entry is persisted to Firestore
 * under `/users/{uid}/achievements/{id}` so it stays unlocked across
 * devices.
 */
export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Visual tier — affects color and glow. Bronze < Silver < Gold < Platinum. */
  tier: "bronze" | "silver" | "gold" | "platinum";
  /** Hidden until unlocked — surprise factor. */
  secret?: boolean;
  /**
   * Cryptic clue rendered when the achievement is locked AND `secret`.
   * Lets players guess what triggers it without giving the full
   * description away. No hint = no help (true mystery).
   */
  hint?: string;
};

export type AchievementContext = {
  modules: LauncherModule[];
  installedCount: number;
  playtime: PlaytimeEntry[];
  conversations: Conversation[];
  /** Total number of distinct friends the user has DM'd at least once. */
  distinctChatPartners: number;
  /** Number of online users including self. */
  onlineUsersCount: number;
  /** Total messages sent across all conversations (estimated from local
   *  counters or 0 — TODO when message-count is tracked). */
  totalMessagesSent: number;
  /** All-time number of game launches summed across modules. */
  totalLaunches: number;
  /** Distinct module IDs the user has launched at least once. */
  distinctModulesLaunched: number;
  /** Hour-of-day (0-23) when the launcher last booted, used by
   *  time-of-day secrets like "night-owl" and "early-bird". */
  bootHour: number;
  /** True if the user opened the share-profile modal at least once. */
  sharedProfileOnce: boolean;
  /** True if the user accessed the launcher in offline mode at least once. */
  usedOfflineModeOnce: boolean;
};

/**
 * The full catalog. Order matters only for display — internally each
 * achievement is keyed by `id` and matched against unlocked records.
 */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-launch",
    title: "Premier pas",
    description: "Tu as ouvert Simple Launcher pour la première fois",
    icon: Sparkles,
    tier: "bronze",
  },
  {
    id: "first-install",
    title: "Bibliothèque entamée",
    description: "Tu as installé ton premier jeu",
    icon: Gamepad2,
    tier: "bronze",
  },
  {
    id: "first-launch-game",
    title: "Allumage",
    description: "Tu as lancé un jeu pour la première fois",
    icon: Zap,
    tier: "bronze",
  },
  {
    id: "first-message",
    title: "Brise-glace",
    description: "Tu as envoyé ton premier message privé",
    icon: MessageCircle,
    tier: "bronze",
  },
  {
    id: "playtime-1h",
    title: "Une heure au compteur",
    description: "Cumul d'1 heure de jeu via le launcher",
    icon: Clock,
    tier: "silver",
  },
  {
    id: "playtime-10h",
    title: "Dix heures au compteur",
    description: "Cumul de 10 heures de jeu — t'es accro ?",
    icon: Clock,
    tier: "silver",
  },
  {
    id: "playtime-100h",
    title: "Le marathonien",
    description: "100 heures cumulées de jeu — respect",
    icon: Trophy,
    tier: "gold",
  },
  {
    id: "library-3-games",
    title: "Collectionneur",
    description: "Tu as 3 jeux installés simultanément",
    icon: Star,
    tier: "silver",
  },
  {
    id: "library-5-games",
    title: "Bibliothèque garnie",
    description: "5 jeux installés en même temps",
    icon: Medal,
    tier: "gold",
  },
  {
    id: "social-3-friends",
    title: "Cercle social",
    description: "Tu as discuté avec 3 potes différents",
    icon: Users,
    tier: "silver",
  },
  {
    id: "social-popular",
    title: "Mr/Mme Popularité",
    description: "100 messages envoyés au total",
    icon: Heart,
    tier: "gold",
  },
  {
    id: "session-spree",
    title: "Lanceur en série",
    description: "50 lancements de jeu cumulés",
    icon: Flame,
    tier: "gold",
  },
  // ─── Hidden achievements (with cryptic hints) ──────────────────────
  {
    id: "night-owl",
    title: "Hibou de nuit",
    description: "Lance le launcher entre minuit et 5h du matin",
    icon: Sparkles,
    tier: "silver",
    secret: true,
    hint: "L'horloge tourne encore quand le monde dort…",
  },
  {
    id: "early-bird",
    title: "Lève-tôt",
    description: "Lance le launcher entre 5h et 7h du matin",
    icon: Sparkles,
    tier: "silver",
    secret: true,
    hint: "Le café fume avant que le soleil ne se lève.",
  },
  {
    id: "explorer",
    title: "Touche-à-tout",
    description: "Lance 5 modules différents au moins une fois",
    icon: Star,
    tier: "silver",
    secret: true,
    hint: "Pourquoi se contenter d'un seul jeu ?",
  },
  {
    id: "evangelist",
    title: "Évangéliste",
    description: "Partage ton profil au moins une fois (lien ou QR)",
    icon: Sparkles,
    tier: "bronze",
    secret: true,
    hint: "Le bouche-à-oreille est la meilleure pub.",
  },
  {
    id: "lone-wolf",
    title: "Loup solitaire",
    description: "Utilise le launcher en mode hors ligne",
    icon: Sparkles,
    tier: "bronze",
    secret: true,
    hint: "Pas besoin du réseau pour s'amuser.",
  },
  {
    id: "platinum",
    title: "Légende du launcher",
    description: "Tous les autres achievements débloqués",
    icon: Trophy,
    tier: "platinum",
    secret: true,
    hint: "Réveille la légende qui sommeille en toi.",
  },
];

/** Numeric progress descriptor. `current` clamps to `[0, threshold]`. */
export type AchievementProgress = {
  current: number;
  threshold: number;
};

/**
 * Compute the numeric progress towards an achievement. Returns null for
 * achievements that have no meaningful progress bar (boolean-style
 * unlocks like "first-launch"). The UI uses this to render an inline
 * "23 / 100" bar on locked entries and to drive the milestone toasts at
 * 75 % / 90 % thresholds.
 */
export function computeProgress(
  id: string,
  ctx: AchievementContext,
): AchievementProgress | null {
  const ms = totalPlaytimeMs(ctx);
  switch (id) {
    case "playtime-1h":
      return { current: ms, threshold: 60 * 60 * 1000 };
    case "playtime-10h":
      return { current: ms, threshold: 10 * 60 * 60 * 1000 };
    case "playtime-100h":
      return { current: ms, threshold: 100 * 60 * 60 * 1000 };
    case "library-3-games":
      return { current: ctx.installedCount, threshold: 3 };
    case "library-5-games":
      return { current: ctx.installedCount, threshold: 5 };
    case "social-3-friends":
      return { current: ctx.distinctChatPartners, threshold: 3 };
    case "social-popular":
      return { current: ctx.totalMessagesSent, threshold: 100 };
    case "session-spree":
      return { current: ctx.totalLaunches, threshold: 50 };
    case "explorer":
      return { current: ctx.distinctModulesLaunched, threshold: 5 };
    default:
      // Boolean achievements (first-launch, first-message, time-of-day,
      // platinum, …) don't have a numeric track.
      return null;
  }
}

/** Human-readable formatter for `current` / `threshold`. Picks units
 *  appropriate to the achievement (hours for ms thresholds, integers
 *  otherwise). */
export function formatProgress(id: string, progress: AchievementProgress): string {
  if (id.startsWith("playtime-")) {
    const hours = progress.current / 3_600_000;
    const target = progress.threshold / 3_600_000;
    return `${hours.toFixed(hours < 10 ? 1 : 0)} / ${target} h`;
  }
  return `${Math.min(progress.current, progress.threshold)} / ${progress.threshold}`;
}

/** Percent in `[0, 100]`. Returns 0 for invalid thresholds (defensive). */
export function progressPercent(progress: AchievementProgress): number {
  if (progress.threshold <= 0) return 0;
  return Math.max(0, Math.min(100, (progress.current / progress.threshold) * 100));
}

/**
 * Evaluates the unlock condition for an achievement against the current
 * context. Kept as a separate function so it can be inlined where needed
 * (avoiding closure capture in the catalog above).
 */
export function isUnlocked(id: string, ctx: AchievementContext): boolean {
  // Numeric achievements: delegate to the progress helper for a single
  // source of truth on thresholds.
  const progress = computeProgress(id, ctx);
  if (progress) return progress.current >= progress.threshold;

  switch (id) {
    case "first-launch":
      return true; // implicit — user is in the app right now
    case "first-install":
      return ctx.installedCount > 0;
    case "first-launch-game":
      return ctx.totalLaunches > 0;
    case "first-message":
      return ctx.totalMessagesSent > 0 || ctx.conversations.some((c) => !!c.lastMessage);
    case "night-owl":
      return ctx.bootHour >= 0 && ctx.bootHour < 5;
    case "early-bird":
      return ctx.bootHour >= 5 && ctx.bootHour < 7;
    case "evangelist":
      return ctx.sharedProfileOnce;
    case "lone-wolf":
      return ctx.usedOfflineModeOnce;
    case "platinum": {
      // All non-secret + non-platinum unlocked
      const others = ACHIEVEMENTS.filter((a) => !a.secret && a.id !== "platinum");
      return others.every((a) => isUnlocked(a.id, ctx));
    }
    default:
      return false;
  }
}

function totalPlaytimeMs(ctx: AchievementContext): number {
  return ctx.playtime.reduce((s, p) => s + p.totalMs, 0);
}

/** Color tokens per tier — used for the icon container + ring + glow. */
export const TIER_STYLES = {
  bronze: {
    bg: "bg-amber-700/15",
    text: "text-amber-400",
    ring: "ring-amber-700/40",
    glow: "shadow-[0_0_20px_rgba(180,83,9,0.4)]",
    label: "Bronze",
  },
  silver: {
    bg: "bg-slate-400/15",
    text: "text-slate-200",
    ring: "ring-slate-400/40",
    glow: "shadow-[0_0_20px_rgba(148,163,184,0.4)]",
    label: "Argent",
  },
  gold: {
    bg: "bg-amber-400/15",
    text: "text-amber-300",
    ring: "ring-amber-400/40",
    glow: "shadow-[0_0_24px_rgba(252,211,77,0.5)]",
    label: "Or",
  },
  platinum: {
    bg: "bg-cyan-400/15",
    text: "text-cyan-200",
    ring: "ring-cyan-400/50",
    glow: "shadow-[0_0_28px_var(--color-accent-glow)]",
    label: "Platine",
  },
} as const;

/** Numeric weight of each tier — used to sort the showcase / top picks
 *  so platinum > gold > silver > bronze regardless of unlock date. */
export const TIER_WEIGHT: Record<Achievement["tier"], number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};
