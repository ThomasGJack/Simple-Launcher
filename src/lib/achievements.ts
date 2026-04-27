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
  {
    id: "platinum",
    title: "Légende du launcher",
    description: "Tous les autres achievements débloqués",
    icon: Trophy,
    tier: "platinum",
    secret: true,
  },
];

/**
 * Evaluates the unlock condition for an achievement against the current
 * context. Kept as a separate function so it can be inlined where needed
 * (avoiding closure capture in the catalog above).
 */
export function isUnlocked(id: string, ctx: AchievementContext): boolean {
  switch (id) {
    case "first-launch":
      return true; // implicit — user is in the app right now
    case "first-install":
      return ctx.installedCount > 0;
    case "first-launch-game":
      return ctx.totalLaunches > 0;
    case "first-message":
      return ctx.totalMessagesSent > 0 || ctx.conversations.some((c) => !!c.lastMessage);
    case "playtime-1h":
      return totalPlaytimeMs(ctx) >= 60 * 60 * 1000;
    case "playtime-10h":
      return totalPlaytimeMs(ctx) >= 10 * 60 * 60 * 1000;
    case "playtime-100h":
      return totalPlaytimeMs(ctx) >= 100 * 60 * 60 * 1000;
    case "library-3-games":
      return ctx.installedCount >= 3;
    case "library-5-games":
      return ctx.installedCount >= 5;
    case "social-3-friends":
      return ctx.distinctChatPartners >= 3;
    case "social-popular":
      return ctx.totalMessagesSent >= 100;
    case "session-spree":
      return ctx.totalLaunches >= 50;
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
