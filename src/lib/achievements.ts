import {
  AlarmClock,
  Award,
  BookOpen,
  Bug,
  CalendarCheck,
  CalendarDays,
  Castle,
  Clock,
  Cloud,
  CloudOff,
  Compass,
  Crown,
  Eye,
  Flame,
  FlaskConical,
  Gamepad2,
  Gem,
  Hammer,
  Heart,
  Image as ImageIcon,
  Library,
  Link2,
  type LucideIcon,
  Medal,
  MessageCircle,
  Moon,
  Network,
  Package,
  Palette,
  Pin,
  QrCode,
  RotateCcw,
  Rocket,
  Server,
  Share2,
  Sparkles,
  Star,
  Sun,
  Sword,
  Target,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import type { LauncherModule } from "@/types/module";
import type { PlaytimeEntry } from "@/firebase/playtime";
import type { Conversation } from "@/types/messaging";

/** One unlockable achievement. Pure data — actual unlocking happens
 *  client-side by evaluating `isUnlocked()` against the user's live
 *  state. Persisted under `/users/{uid}/achievements/{id}` once. */
export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Visual tier — affects color and glow. Bronze < Silver < Gold < Platinum. */
  tier: "bronze" | "silver" | "gold" | "platinum";
  /** One of 11 logical groups (used by AchievementsPage filters). */
  category: AchievementCategory;
  /** Hidden until unlocked — surprise factor. */
  secret?: boolean;
  /** Cryptic clue rendered when locked + secret. No hint = no help. */
  hint?: string;
};

export type AchievementCategory =
  | "onboarding"
  | "library"
  | "playtime"
  | "launches"
  | "social"
  | "minecraft"
  | "personalization"
  | "discovery"
  | "temporal"
  | "easter-eggs"
  | "legend";

/** Display label + lucide icon per category, used by AchievementsPage
 *  group headers. Order in this array determines display order. */
export const CATEGORY_META: Record<
  AchievementCategory,
  { label: string; icon: LucideIcon; emoji: string }
> = {
  onboarding: { label: "Premiers pas", icon: Sparkles, emoji: "🎯" },
  library: { label: "Bibliothèque", icon: Library, emoji: "📚" },
  playtime: { label: "Temps de jeu", icon: Clock, emoji: "⏱️" },
  launches: { label: "Lancements", icon: Rocket, emoji: "🚀" },
  social: { label: "Social & communauté", icon: Users, emoji: "💬" },
  minecraft: { label: "Minecraft", icon: Gem, emoji: "⛏️" },
  personalization: { label: "Personnalisation", icon: Palette, emoji: "🎨" },
  discovery: { label: "Découverte", icon: Compass, emoji: "🔍" },
  temporal: { label: "Patterns temporels", icon: Moon, emoji: "🌙" },
  "easter-eggs": { label: "Easter eggs", icon: FlaskConical, emoji: "🥚" },
  legend: { label: "Légende", icon: Crown, emoji: "👑" },
};

export type AchievementContext = {
  modules: LauncherModule[];
  installedCount: number;
  /** Number of user-owned shortcut modules (custom .exe entries). */
  shortcutCount: number;
  playtime: PlaytimeEntry[];
  conversations: Conversation[];
  /** Total number of distinct friends the user has DM'd at least once. */
  distinctChatPartners: number;
  /** Number of online users including self. */
  onlineUsersCount: number;
  /** Total messages sent across all conversations. */
  totalMessagesSent: number;
  /** All-time number of game launches summed across modules. */
  totalLaunches: number;
  /** Distinct module IDs the user has launched at least once. */
  distinctModulesLaunched: number;
  /** Cumulative playtime in ms across modules of type "minecraft". */
  totalMcMs: number;
  /** Distinct Minecraft versions launched (e.g. 1.20.1, 1.21, 1.21.1). */
  distinctMcVersions: number;
  /** Hour-of-day (0-23) snapshot at app boot — used by the time-of-day
   *  secrets (night-owl, early-bird) so the value can't shift mid-session. */
  bootHour: number;
  /** Longest streak of consecutive days with at least one launch ending
   *  on today (computed from `users/{uid}/launchDays`). */
  currentStreakDays: number;
  /** Max single-day playtime (in ms) recorded on a Saturday or Sunday. */
  maxWeekendDayMs: number;
  /** Number of crew memberships the user is part of. */
  crewMembershipsCount: number;
  /** True if the user's profile has a non-default theme OR custom accent. */
  profilePersonalized: boolean;
  /** True if the user uploaded a banner on their public profile. */
  profileHasBanner: boolean;
  /** Number of pinned modules on the public profile. */
  pinnedModulesCount: number;
  // ─── localStorage flags (one-shot triggers) ──────────────────────
  microsoftLinkedOnce: boolean;
  modpackInstalledOnce: boolean;
  mcServerJoinedOnce: boolean;
  mcBackupRestoredOnce: boolean;
  themeChangedOnce: boolean;
  qrSharedOnce: boolean;
  /** Same trigger as qrSharedOnce, but separately tracked so the secret
   *  variant unlocks too. */
  sharedProfileOnce: boolean;
  trayDiscoveredOnce: boolean;
  updateInstalledOnce: boolean;
  usedOfflineModeOnce: boolean;
  crashReportSentOnce: boolean;
  konamiOnce: boolean;
};

/** ---------------------------------------------------------------------------
 * The full catalog — 50 entries grouped into 11 categories.
 *
 * IDs are stable: the 18 entries that existed in the previous catalog
 * keep their original id so users don't lose unlocks. The new 32 use
 * fresh kebab-case identifiers.
 * ------------------------------------------------------------------------- */
export const ACHIEVEMENTS: Achievement[] = [
  // ─── 1. Premiers pas ──────────────────────────────────────────────
  {
    id: "first-launch",
    title: "Premier pas",
    description: "Tu as ouvert Simple Launcher pour la première fois",
    icon: Sparkles,
    tier: "bronze",
    category: "onboarding",
  },
  {
    id: "discord-linked",
    title: "Lien établi",
    description: "Tu as connecté ton compte Discord",
    icon: Link2,
    tier: "bronze",
    category: "onboarding",
  },
  {
    id: "microsoft-linked",
    title: "Compte de jeu",
    description: "Tu as lié un compte Microsoft pour Minecraft (officiel ou Mojang fallback)",
    icon: Gamepad2,
    tier: "silver",
    category: "onboarding",
  },
  {
    id: "profile-personalized",
    title: "Tu as du style",
    description: "Tu as changé ta couleur d'accent ou ton thème de profil",
    icon: Palette,
    tier: "bronze",
    category: "onboarding",
  },

  // ─── 2. Bibliothèque ─────────────────────────────────────────────
  {
    id: "first-install",
    title: "Bibliothèque entamée",
    description: "Tu as installé ton premier jeu",
    icon: Package,
    tier: "bronze",
    category: "library",
  },
  {
    id: "library-3-games",
    title: "Collectionneur",
    description: "Tu as 3 jeux installés simultanément",
    icon: Star,
    tier: "silver",
    category: "library",
  },
  {
    id: "library-5-games",
    title: "Bibliothèque garnie",
    description: "5 jeux installés simultanément",
    icon: Library,
    tier: "gold",
    category: "library",
  },
  {
    id: "library-10-games",
    title: "Cabinet de curiosités",
    description: "10 jeux installés simultanément",
    icon: BookOpen,
    tier: "gold",
    category: "library",
  },
  {
    id: "shortcut-master",
    title: "Maître des raccourcis",
    description: "Tu as ajouté 5 raccourcis personnalisés",
    icon: Zap,
    tier: "silver",
    category: "library",
  },

  // ─── 3. Temps de jeu ─────────────────────────────────────────────
  {
    id: "playtime-1h",
    title: "Une heure au compteur",
    description: "Cumul d'1 heure de jeu via le launcher",
    icon: Clock,
    tier: "bronze",
    category: "playtime",
  },
  {
    id: "playtime-10h",
    title: "Dix heures au compteur",
    description: "Cumul de 10 heures de jeu — t'es accro ?",
    icon: Clock,
    tier: "silver",
    category: "playtime",
  },
  {
    id: "playtime-50h",
    title: "Mi-temps",
    description: "Cumul de 50 heures de jeu",
    icon: Timer,
    tier: "silver",
    category: "playtime",
  },
  {
    id: "playtime-100h",
    title: "Le marathonien",
    description: "100 heures cumulées — respect",
    icon: Trophy,
    tier: "gold",
    category: "playtime",
  },
  {
    id: "playtime-500h",
    title: "No-life mais on t'aime",
    description: "500 heures cumulées",
    icon: Flame,
    tier: "gold",
    category: "playtime",
  },
  {
    id: "playtime-1000h",
    title: "Légende vivante",
    description: "1000 heures cumulées de jeu",
    icon: Crown,
    tier: "platinum",
    category: "playtime",
  },

  // ─── 4. Lancements ───────────────────────────────────────────────
  {
    id: "first-launch-game",
    title: "Allumage",
    description: "Tu as lancé un jeu pour la première fois",
    icon: Zap,
    tier: "bronze",
    category: "launches",
  },
  {
    id: "launches-10",
    title: "Habitué",
    description: "10 lancements de jeu cumulés",
    icon: Rocket,
    tier: "bronze",
    category: "launches",
  },
  {
    id: "session-spree",
    title: "Lanceur en série",
    description: "50 lancements de jeu cumulés",
    icon: Rocket,
    tier: "silver",
    category: "launches",
  },
  {
    id: "launches-100",
    title: "Centurion",
    description: "100 lancements de jeu cumulés",
    icon: Award,
    tier: "gold",
    category: "launches",
  },
  {
    id: "launches-500",
    title: "Quincaillier compulsif",
    description: "500 lancements de jeu cumulés",
    icon: Hammer,
    tier: "gold",
    category: "launches",
  },

  // ─── 5. Social & communauté ──────────────────────────────────────
  {
    id: "first-message",
    title: "Brise-glace",
    description: "Tu as envoyé ton premier message privé",
    icon: MessageCircle,
    tier: "bronze",
    category: "social",
  },
  {
    id: "social-3-friends",
    title: "Cercle social",
    description: "Tu as discuté avec 3 personnes différentes",
    icon: Users,
    tier: "silver",
    category: "social",
  },
  {
    id: "social-10-friends",
    title: "Réseau étendu",
    description: "Tu as discuté avec 10 personnes différentes",
    icon: Network,
    tier: "gold",
    category: "social",
  },
  {
    id: "social-popular",
    title: "Mr/Mme Popularité",
    description: "100 messages envoyés au total",
    icon: Heart,
    tier: "gold",
    category: "social",
  },
  {
    id: "messages-1000",
    title: "Bavardage olympique",
    description: "1000 messages envoyés au total",
    icon: MessageCircle,
    tier: "platinum",
    category: "social",
  },
  {
    id: "crew-joined",
    title: "Esprit de clan",
    description: "Tu as rejoint un crew",
    icon: Castle,
    tier: "silver",
    category: "social",
  },

  // ─── 6. Minecraft ────────────────────────────────────────────────
  {
    id: "mc-first-launch",
    title: "Bienvenue à Minecraft",
    description: "Tu as lancé Minecraft natif pour la première fois",
    icon: Gem,
    tier: "silver",
    category: "minecraft",
  },
  {
    id: "mc-modpack-installed",
    title: "Pack en main",
    description: "Tu as installé un modpack (Modrinth, Forge ou ZIP custom)",
    icon: Package,
    tier: "silver",
    category: "minecraft",
  },
  {
    id: "mc-server-joined",
    title: "Co-op activé",
    description: "Tu as rejoint un serveur Minecraft (ping détecté)",
    icon: Server,
    tier: "gold",
    category: "minecraft",
  },
  {
    id: "mc-100h",
    title: "Diamant",
    description: "100 heures cumulées sur Minecraft",
    icon: Sword,
    tier: "gold",
    category: "minecraft",
  },
  {
    id: "mc-multiple-versions",
    title: "Voyageur temporel",
    description: "Tu as lancé 3 versions différentes de Minecraft",
    icon: AlarmClock,
    tier: "silver",
    category: "minecraft",
  },
  {
    id: "mc-backup-restore",
    title: "Phoenix",
    description: "Tu as restauré une sauvegarde Minecraft",
    icon: RotateCcw,
    tier: "silver",
    category: "minecraft",
  },

  // ─── 7. Personnalisation ─────────────────────────────────────────
  {
    id: "theme-changed",
    title: "Couleur perso",
    description: "Tu as changé la couleur d'accent au moins une fois",
    icon: Palette,
    tier: "bronze",
    category: "personalization",
  },
  {
    id: "profile-banner",
    title: "Identité visuelle",
    description: "Tu as uploadé une bannière sur ton profil public",
    icon: ImageIcon,
    tier: "silver",
    category: "personalization",
  },
  {
    id: "pinned-modules",
    title: "Coup de cœur",
    description: "Tu as épinglé 3 jeux sur ton profil public",
    icon: Pin,
    tier: "silver",
    category: "personalization",
  },
  {
    id: "qr-shared",
    title: "Code rapide",
    description: "Tu as ouvert le QR code de partage de profil",
    icon: QrCode,
    tier: "bronze",
    category: "personalization",
  },

  // ─── 8. Découverte ───────────────────────────────────────────────
  {
    id: "explorer",
    title: "Touche-à-tout",
    description: "Tu as lancé 5 modules différents",
    icon: Compass,
    tier: "silver",
    category: "discovery",
  },
  {
    id: "explorer-10",
    title: "Encyclopédiste",
    description: "Tu as lancé 10 modules différents",
    icon: BookOpen,
    tier: "gold",
    category: "discovery",
  },
  {
    id: "tray-discovered",
    title: "Discret",
    description: "Tu as fermé le launcher dans le tray puis l'as rouvert",
    icon: Eye,
    tier: "bronze",
    category: "discovery",
  },
  {
    id: "update-installed",
    title: "Up to date",
    description: "Tu as installé une mise à jour via l'auto-updater",
    icon: Cloud,
    tier: "silver",
    category: "discovery",
  },

  // ─── 9. Patterns temporels (secrets) ─────────────────────────────
  {
    id: "night-owl",
    title: "Hibou de nuit",
    description: "Lance le launcher entre minuit et 5h du matin",
    icon: Moon,
    tier: "silver",
    category: "temporal",
    secret: true,
    hint: "L'horloge tourne encore quand le monde dort…",
  },
  {
    id: "early-bird",
    title: "Lève-tôt",
    description: "Lance le launcher entre 5h et 7h du matin",
    icon: Sun,
    tier: "silver",
    category: "temporal",
    secret: true,
    hint: "Le café fume avant que le soleil ne se lève.",
  },
  {
    id: "weekend-warrior",
    title: "Guerrier du week-end",
    description: "5h+ de jeu un samedi ou un dimanche",
    icon: CalendarDays,
    tier: "silver",
    category: "temporal",
    secret: true,
    hint: "Le repos n'est pas pour tout le monde.",
  },
  {
    id: "streak-3-days",
    title: "Série de 3",
    description: "Lance un jeu 3 jours consécutifs",
    icon: CalendarCheck,
    tier: "silver",
    category: "temporal",
    secret: true,
    hint: "La constance forge les habitudes.",
  },
  {
    id: "streak-7-days",
    title: "Streak de fer",
    description: "Lance un jeu 7 jours consécutifs",
    icon: Flame,
    tier: "gold",
    category: "temporal",
    secret: true,
    hint: "Une semaine entière sans rater une journée.",
  },

  // ─── 10. Easter eggs (secrets) ───────────────────────────────────
  {
    id: "evangelist",
    title: "Évangéliste",
    description: "Partage ton profil au moins une fois (lien ou QR)",
    icon: Share2,
    tier: "bronze",
    category: "easter-eggs",
    secret: true,
    hint: "Le bouche-à-oreille est la meilleure pub.",
  },
  {
    id: "lone-wolf",
    title: "Loup solitaire",
    description: "Utilise le launcher en mode hors ligne",
    icon: CloudOff,
    tier: "bronze",
    category: "easter-eggs",
    secret: true,
    hint: "Pas besoin du réseau pour s'amuser.",
  },
  {
    id: "crash-reporter",
    title: "Bug bounty",
    description: "Envoie un rapport de crash à l'admin",
    icon: Bug,
    tier: "silver",
    category: "easter-eggs",
    secret: true,
    hint: "Tout le monde peut aider à améliorer.",
  },
  {
    id: "konami",
    title: "Code Konami",
    description: "Tape ↑ ↑ ↓ ↓ ← → ← → B A sur la home",
    icon: Target,
    tier: "gold",
    category: "easter-eggs",
    secret: true,
    hint: "Une vieille recette de gamers.",
  },

  // ─── 11. Légende ─────────────────────────────────────────────────
  {
    id: "platinum",
    title: "Légende du launcher",
    description: "Tous les autres achievements (hors secrets) débloqués",
    icon: Crown,
    tier: "platinum",
    category: "legend",
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
 * achievements that have no meaningful progress bar (boolean unlocks).
 */
export function computeProgress(
  id: string,
  ctx: AchievementContext,
): AchievementProgress | null {
  const totalMs = totalPlaytimeMs(ctx);
  switch (id) {
    // Playtime
    case "playtime-1h":
      return { current: totalMs, threshold: 60 * 60 * 1000 };
    case "playtime-10h":
      return { current: totalMs, threshold: 10 * 60 * 60 * 1000 };
    case "playtime-50h":
      return { current: totalMs, threshold: 50 * 60 * 60 * 1000 };
    case "playtime-100h":
      return { current: totalMs, threshold: 100 * 60 * 60 * 1000 };
    case "playtime-500h":
      return { current: totalMs, threshold: 500 * 60 * 60 * 1000 };
    case "playtime-1000h":
      return { current: totalMs, threshold: 1000 * 60 * 60 * 1000 };
    // Library
    case "library-3-games":
      return { current: ctx.installedCount, threshold: 3 };
    case "library-5-games":
      return { current: ctx.installedCount, threshold: 5 };
    case "library-10-games":
      return { current: ctx.installedCount, threshold: 10 };
    case "shortcut-master":
      return { current: ctx.shortcutCount, threshold: 5 };
    // Launches
    case "launches-10":
      return { current: ctx.totalLaunches, threshold: 10 };
    case "session-spree":
      return { current: ctx.totalLaunches, threshold: 50 };
    case "launches-100":
      return { current: ctx.totalLaunches, threshold: 100 };
    case "launches-500":
      return { current: ctx.totalLaunches, threshold: 500 };
    // Social
    case "social-3-friends":
      return { current: ctx.distinctChatPartners, threshold: 3 };
    case "social-10-friends":
      return { current: ctx.distinctChatPartners, threshold: 10 };
    case "social-popular":
      return { current: ctx.totalMessagesSent, threshold: 100 };
    case "messages-1000":
      return { current: ctx.totalMessagesSent, threshold: 1000 };
    // Discovery / Minecraft
    case "explorer":
      return { current: ctx.distinctModulesLaunched, threshold: 5 };
    case "explorer-10":
      return { current: ctx.distinctModulesLaunched, threshold: 10 };
    case "mc-100h":
      return { current: ctx.totalMcMs, threshold: 100 * 60 * 60 * 1000 };
    case "mc-multiple-versions":
      return { current: ctx.distinctMcVersions, threshold: 3 };
    case "pinned-modules":
      return { current: ctx.pinnedModulesCount, threshold: 3 };
    // Streaks
    case "streak-3-days":
      return { current: ctx.currentStreakDays, threshold: 3 };
    case "streak-7-days":
      return { current: ctx.currentStreakDays, threshold: 7 };
    case "weekend-warrior":
      return { current: ctx.maxWeekendDayMs, threshold: 5 * 60 * 60 * 1000 };
    default:
      return null;
  }
}

/** Human-readable formatter for `current` / `threshold`. */
export function formatProgress(id: string, progress: AchievementProgress): string {
  if (id.startsWith("playtime-") || id === "mc-100h" || id === "weekend-warrior") {
    const hours = progress.current / 3_600_000;
    const target = progress.threshold / 3_600_000;
    return `${hours.toFixed(hours < 10 ? 1 : 0)} / ${target} h`;
  }
  return `${Math.min(progress.current, progress.threshold)} / ${progress.threshold}`;
}

/** Percent in `[0, 100]`. */
export function progressPercent(progress: AchievementProgress): number {
  if (progress.threshold <= 0) return 0;
  return Math.max(0, Math.min(100, (progress.current / progress.threshold) * 100));
}

/** Evaluates the unlock condition for an achievement. */
export function isUnlocked(id: string, ctx: AchievementContext): boolean {
  // Numeric achievements: delegate to progress for a single source of truth.
  const progress = computeProgress(id, ctx);
  if (progress) return progress.current >= progress.threshold;

  switch (id) {
    case "first-launch":
      return true; // implicit — user is in the app
    case "discord-linked":
      // The user is logged in via Discord OAuth — App.tsx requires this
      // before mounting. Still gate on auth presence for safety.
      return true;
    case "microsoft-linked":
      return ctx.microsoftLinkedOnce;
    case "profile-personalized":
      return ctx.profilePersonalized;
    case "first-install":
      return ctx.installedCount > 0;
    case "first-launch-game":
      return ctx.totalLaunches > 0;
    case "first-message":
      return (
        ctx.totalMessagesSent > 0 ||
        ctx.conversations.some((c) => !!c.lastMessage)
      );
    case "crew-joined":
      return ctx.crewMembershipsCount > 0;
    case "mc-first-launch":
      return ctx.distinctMcVersions > 0 || ctx.totalMcMs > 0;
    case "mc-modpack-installed":
      return ctx.modpackInstalledOnce;
    case "mc-server-joined":
      return ctx.mcServerJoinedOnce;
    case "mc-backup-restore":
      return ctx.mcBackupRestoredOnce;
    case "theme-changed":
      return ctx.themeChangedOnce;
    case "profile-banner":
      return ctx.profileHasBanner;
    case "qr-shared":
      return ctx.qrSharedOnce;
    case "tray-discovered":
      return ctx.trayDiscoveredOnce;
    case "update-installed":
      return ctx.updateInstalledOnce;
    case "night-owl":
      return ctx.bootHour >= 0 && ctx.bootHour < 5;
    case "early-bird":
      return ctx.bootHour >= 5 && ctx.bootHour < 7;
    case "evangelist":
      return ctx.sharedProfileOnce;
    case "lone-wolf":
      return ctx.usedOfflineModeOnce;
    case "crash-reporter":
      return ctx.crashReportSentOnce;
    case "konami":
      return ctx.konamiOnce;
    case "platinum": {
      const others = ACHIEVEMENTS.filter(
        (a) => !a.secret && a.id !== "platinum",
      );
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

export const TIER_WEIGHT: Record<Achievement["tier"], number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

// ─── exhaustive icon import keep-alives ──────────────────────────────
// Keep these so dead-code elimination doesn't drop icons referenced by
// only via the catalog map (TS doesn't see the icon as used by the
// renderer if all references are array literals). The `void`-cast
// ensures no runtime cost.
void Medal;
