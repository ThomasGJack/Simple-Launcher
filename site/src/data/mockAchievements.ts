import type { Achievement, AchievementContext } from "@/lib/achievements";
import { ACHIEVEMENTS } from "@/lib/achievements";

/**
 * Picks 12 achievements depuis le catalog launcher pour la démo
 * gallery + 3 pour la section profil. Mix de tiers (bronze/silver/gold/
 * platinum) et catégories pour montrer la variété.
 *
 * Chaque entry est annotée avec un état mock (unlocked + date OU
 * progress en %). L'`AchievementContext` est minimal — on triche en
 * passant un context aux valeurs ajustées pour que `computeProgress`
 * retourne ce qu'on veut afficher.
 */

const PICK_IDS_GALLERY = [
  "first-launch",
  "discord-linked",
  "library-3-games",
  "library-10-games",
  "playtime-10h",
  "playtime-100h",
  "social-butterfly",
  "minecraft-builder",
  "night-owl",
  "weekend-warrior",
  "perfect-streak-7",
  "konami",
] as const;

export type MockAchievementEntry = {
  ach: Achievement;
  unlocked: boolean;
  unlockedAt?: number;
  rarityPercent?: number;
};

function findOrFallback(id: string, fallbackIndex: number): Achievement {
  return (
    ACHIEVEMENTS.find((a) => a.id === id) ?? ACHIEVEMENTS[fallbackIndex] ?? ACHIEVEMENTS[0]
  );
}

const D = (daysAgo: number) => Date.now() - daysAgo * 24 * 60 * 60 * 1000;

export const MOCK_ACHIEVEMENTS_GALLERY: MockAchievementEntry[] = [
  { ach: findOrFallback(PICK_IDS_GALLERY[0], 0), unlocked: true, unlockedAt: D(42), rarityPercent: 92 },
  { ach: findOrFallback(PICK_IDS_GALLERY[1], 1), unlocked: true, unlockedAt: D(41), rarityPercent: 89 },
  { ach: findOrFallback(PICK_IDS_GALLERY[2], 5), unlocked: true, unlockedAt: D(28), rarityPercent: 64 },
  { ach: findOrFallback(PICK_IDS_GALLERY[3], 7), unlocked: true, unlockedAt: D(8), rarityPercent: 12 },
  { ach: findOrFallback(PICK_IDS_GALLERY[4], 10), unlocked: false, rarityPercent: 48 },
  { ach: findOrFallback(PICK_IDS_GALLERY[5], 12), unlocked: false, rarityPercent: 6 },
  { ach: findOrFallback(PICK_IDS_GALLERY[6], 15), unlocked: false, rarityPercent: 23 },
  { ach: findOrFallback(PICK_IDS_GALLERY[7], 20), unlocked: true, unlockedAt: D(15), rarityPercent: 37 },
  { ach: findOrFallback(PICK_IDS_GALLERY[8], 25), unlocked: false, rarityPercent: 18 },
  { ach: findOrFallback(PICK_IDS_GALLERY[9], 28), unlocked: false, rarityPercent: 41 },
  { ach: findOrFallback(PICK_IDS_GALLERY[10], 30), unlocked: false, rarityPercent: 9 },
  { ach: findOrFallback(PICK_IDS_GALLERY[11], 45), unlocked: false, rarityPercent: 2 },
];

/**
 * Subset 3 achievements pour la démo profil (section 03) :
 * 1 unlocked gold récent, 1 locked en cours (~60%), 1 secret locked.
 */
export const MOCK_ACHIEVEMENTS_PROFILE: MockAchievementEntry[] = [
  { ach: findOrFallback("library-10-games", 7), unlocked: true, unlockedAt: D(3), rarityPercent: 12 },
  { ach: findOrFallback("playtime-10h", 10), unlocked: false, rarityPercent: 48 },
  { ach: findOrFallback("konami", 49), unlocked: false, rarityPercent: 2 },
];

/**
 * Context mocké pour AchievementCard. Les valeurs sont ajustées pour
 * que `computeProgress(id, ctx)` retourne des progress bars crédibles
 * (~60% sur les locked tracked).
 */
export const MOCK_CTX: AchievementContext = {
  modules: [],
  installedCount: 6, // entre 5 et 10
  shortcutCount: 3,
  playtime: [],
  conversations: [],
  distinctChatPartners: 4,
  onlineUsersCount: 12,
  totalMessagesSent: 87,
  totalLaunches: 142,
  distinctModulesLaunched: 5,
  totalMcMs: 1000 * 60 * 60 * 8.5, // 8.5 hours
  distinctMcVersions: 3,
  bootHour: 21,
  currentStreakDays: 4,
  maxWeekendDayMs: 1000 * 60 * 60 * 6,
  crewMembershipsCount: 2,
  profilePersonalized: true,
  profileHasBanner: true,
  pinnedModulesCount: 2,
  microsoftLinkedOnce: true,
  modpackInstalledOnce: true,
  mcServerJoinedOnce: true,
  mcBackupRestoredOnce: false,
  themeChangedOnce: true,
  qrSharedOnce: false,
  sharedProfileOnce: false,
  trayDiscoveredOnce: true,
  updateInstalledOnce: true,
  usedOfflineModeOnce: false,
  crashReportSentOnce: false,
  konamiOnce: false,
};
