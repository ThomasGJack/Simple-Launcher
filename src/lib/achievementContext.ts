import type { User } from "firebase/auth";
import type { LauncherModule } from "@/types/module";
import type { Conversation } from "@/types/messaging";
import type { PlaytimeEntry } from "@/firebase/playtime";
import type { UserPresence } from "@/firebase/presence";
import {
  computeCurrentStreak,
  maxWeekendDayMs,
  type LaunchDay,
} from "@/firebase/launchDays";
import type { AchievementContext } from "@/lib/achievements";
import { achievementFlags } from "@/lib/achievementFlags";
import { mcVersionsTracker } from "@/lib/mcVersionsTracker";
import { useSettingsStore } from "@/store/settings";

/**
 * Single source of truth for assembling an `AchievementContext` from
 * the live data sources spread across the app.
 *
 * Three places need to evaluate achievements (App.tsx for the unlock
 * detector, AchievementsPage.tsx for the gallery + progress bars,
 * NextAchievementChip.tsx for the home rotation), and they should all
 * see the same context shape — otherwise progress bars in the gallery
 * could show different numbers than the unlock toast. This helper
 * centralizes the build so adding a new field touches exactly one
 * file.
 *
 * The `myProfile` argument is the `UserPresence` doc for the current
 * user (read from `useUsers()`); we rely on its
 * `accentColor`/`profileTheme`/`bannerUrl`/`pinnedModuleIds` fields for
 * the personalization-related achievements.
 */
export function buildAchievementContext(args: {
  me: User;
  modules: LauncherModule[];
  allUsers: UserPresence[];
  playtime: PlaytimeEntry[];
  conversations: Conversation[];
  launchDays: LaunchDay[];
  myProfile: UserPresence | null | undefined;
  shortcutCount: number;
}): AchievementContext {
  const {
    me,
    modules,
    allUsers,
    playtime,
    conversations,
    launchDays,
    myProfile,
    shortcutCount,
  } = args;

  const distinctChatPartners = new Set(
    conversations.flatMap((c) =>
      c.participants.filter((p) => p && p !== me.uid),
    ),
  ).size;
  const onlineUsersCount = allUsers.filter(
    (u) => u.lastSeen && Date.now() - u.lastSeen < 60_000,
  ).length;
  const totalLaunches = playtime.reduce((s, p) => s + p.totalLaunches, 0);
  const distinctModulesLaunched = playtime.filter(
    (p) => p.totalLaunches > 0,
  ).length;

  // Sum playtime across modules whose `type === "minecraft"` only.
  const mcModuleIds = new Set(
    modules.filter((m) => m.type === "minecraft").map((m) => m.id),
  );
  const totalMcMs = playtime
    .filter((p) => mcModuleIds.has(p.moduleId))
    .reduce((s, p) => s + p.totalMs, 0);

  // Personalization signals derived from the live profile doc + the
  // local settings store. The settings store mirrors localStorage —
  // it's the user's per-machine accent override which counts even when
  // the public profile theme stays at default.
  const settingsAccent = useSettingsStore.getState().accentColor;
  const profileHasAccent =
    typeof myProfile?.accentColor === "string" && myProfile.accentColor.length > 0;
  const profileHasTheme =
    typeof myProfile?.profileTheme === "string" &&
    myProfile.profileTheme.length > 0 &&
    myProfile.profileTheme !== "default";
  const profilePersonalized =
    !!settingsAccent ||
    profileHasAccent ||
    profileHasTheme ||
    achievementFlags.hasThemeChanged();

  return {
    modules,
    // Heuristic: "installed" is approximated as "has launched at least
    // once" — the launcher doesn't track installs server-side.
    installedCount: distinctModulesLaunched,
    shortcutCount,
    playtime,
    conversations,
    distinctChatPartners,
    onlineUsersCount,
    totalMessagesSent: conversations.filter(
      (c) => c.lastMessage?.senderUid === me.uid,
    ).length,
    totalLaunches,
    distinctModulesLaunched,
    totalMcMs,
    distinctMcVersions: mcVersionsTracker.count(),
    bootHour: achievementFlags.getBootHour(),
    currentStreakDays: computeCurrentStreak(launchDays),
    maxWeekendDayMs: maxWeekendDayMs(launchDays),
    crewMembershipsCount: achievementFlags.hasCrewJoined() ? 1 : 0,
    profilePersonalized,
    profileHasBanner: !!myProfile?.bannerUrl,
    pinnedModulesCount: myProfile?.pinnedModuleIds?.length ?? 0,
    microsoftLinkedOnce: achievementFlags.hasMicrosoftLinked(),
    modpackInstalledOnce: achievementFlags.hasModpackInstalled(),
    mcServerJoinedOnce: achievementFlags.hasMcServerJoined(),
    mcBackupRestoredOnce: achievementFlags.hasMcBackupRestored(),
    themeChangedOnce: achievementFlags.hasThemeChanged(),
    qrSharedOnce: achievementFlags.hasQrShared(),
    sharedProfileOnce: achievementFlags.hasSharedProfile(),
    trayDiscoveredOnce: achievementFlags.hasTrayDiscovered(),
    updateInstalledOnce: achievementFlags.hasUpdateInstalled(),
    usedOfflineModeOnce: achievementFlags.hasUsedOffline(),
    crashReportSentOnce: achievementFlags.hasCrashReportSent(),
    konamiOnce: achievementFlags.hasKonami(),
  };
}
