import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

export type CurrentActivity = {
  moduleId: string;
  moduleName: string;
  startedAt: number;
};

/**
 * Per-user privacy switches that drive what other launcher users can see
 * about this profile. Defaults are open (legacy users implicitly = all
 * `true`) since the launcher is a small friend-group tool, but the user
 * can lock things down individually.
 */
export type UserPrivacy = {
  /** Whether other users see your live "currently playing" status. */
  showActivity: boolean;
  /** Whether your total playtime + top games are visible on your public profile. */
  showPlaytime: boolean;
  /** Whether other users can DM you from the Communauté page. When false,
   *  the « Message » button is hidden — friends can still respond to a
   *  thread you started, just no cold DMs. */
  allowDirectMessages: boolean;
};

export type UserPresence = {
  uid: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  discordId: string | null;
  lastSeen: number | null;
  currentActivity: CurrentActivity | null;
  /**
   * Customization fields editable from the user's own profile page.
   * All optional — undefined = unset / inherit defaults.
   */
  bio: string | null;
  /** URL of a banner image (16:5 ratio recommended) shown behind the
   *  avatar on the profile page hero. Uploaded to
   *  `users/{uid}/profile/banner.{ext}` via Firebase Storage. */
  bannerUrl: string | null;
  /** Hex color string ("#00d4ff") that overrides the cyan accent on the
   *  user's profile page only. Used when `profileTheme === "custom"`. */
  accentColor: string | null;
  /** Predefined visual theme id for the profile page (gradient + accent).
   *  When null, falls back to "default" (cyan/violet). */
  profileTheme: import("@/lib/profileThemes").ProfileThemeId | null;
  /** Module ids pinned by the user — overrides the auto-computed
   *  "top games by playtime" on the profile page. Max 3. */
  pinnedModuleIds: string[];
  privacy: UserPrivacy;
};

export type PresenceStatus = "online" | "idle" | "offline";

const ONLINE_WINDOW_MS = 60_000;
const IDLE_WINDOW_MS = 5 * 60_000;

export function statusFromLastSeen(lastSeen: number | null): PresenceStatus {
  if (!lastSeen) return "offline";
  const now = Date.now();
  if (now - lastSeen < ONLINE_WINDOW_MS) return "online";
  if (now - lastSeen < IDLE_WINDOW_MS) return "idle";
  return "offline";
}

export async function pushHeartbeat(uid: string, activity: CurrentActivity | null) {
  const fb = getFirebase();
  if (!fb) return;
  await setDoc(
    doc(fb.db, "users", uid),
    {
      lastSeen: serverTimestamp(),
      currentActivity: activity,
    },
    { merge: true },
  );
}

export function watchAllUsers(callback: (users: UserPresence[]) => void): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  return onSnapshot(collection(fb.db, "users"), (snap) => {
    const users: UserPresence[] = snap.docs.map((d) => parseUserDoc(d.id, d.data()));
    callback(users);
  });
}

/**
 * Single source of truth for parsing a Firestore user doc into a
 * `UserPresence` shape. Used by both `watchAllUsers` and any future
 * single-doc subscription (e.g. profile page detail). Defensive on every
 * field — older user docs predate the customization additions, so anything
 * missing falls back to a safe default.
 */
export function parseUserDoc(uid: string, data: Record<string, unknown>): UserPresence {
  const lastSeen =
    data.lastSeen && typeof (data.lastSeen as { toMillis?: () => number }).toMillis === "function"
      ? (data.lastSeen as { toMillis: () => number }).toMillis()
      : null;
  const activityRaw = data.currentActivity as
    | { moduleId?: string; moduleName?: string; startedAt?: number }
    | null
    | undefined;
  const activity = activityRaw && activityRaw.moduleId && activityRaw.moduleName
    ? {
        moduleId: activityRaw.moduleId,
        moduleName: activityRaw.moduleName,
        startedAt: activityRaw.startedAt ?? 0,
      }
    : null;
  const privacyRaw = (data.privacy as Partial<UserPrivacy> | undefined) ?? {};
  const pinnedRaw = data.pinnedModuleIds;
  const pinned = Array.isArray(pinnedRaw)
    ? pinnedRaw.filter((m): m is string => typeof m === "string").slice(0, 3)
    : [];
  return {
    uid,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    username: typeof data.username === "string" ? data.username : null,
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    discordId: typeof data.discordId === "string" ? data.discordId : null,
    lastSeen,
    currentActivity: activity,
    bio: typeof data.bio === "string" ? data.bio : null,
    bannerUrl: typeof data.bannerUrl === "string" ? data.bannerUrl : null,
    accentColor: typeof data.accentColor === "string" ? data.accentColor : null,
    profileTheme: typeof data.profileTheme === "string"
      ? (data.profileTheme as import("@/lib/profileThemes").ProfileThemeId)
      : null,
    pinnedModuleIds: pinned,
    privacy: {
      // Defaults open since older docs don't have the field.
      showActivity: privacyRaw.showActivity !== false,
      showPlaytime: privacyRaw.showPlaytime !== false,
      allowDirectMessages: privacyRaw.allowDirectMessages !== false,
    },
  };
}
