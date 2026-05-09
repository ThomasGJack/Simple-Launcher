import {
  collection,
  doc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
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
  /** Status custom défini par l'user (genre "AFK 30min", "Travaille",
   *  "Concentré"). Override l'affichage "joue à X" / "online" si set.
   *  Null = pas de status custom, fallback sur l'activité auto. */
  customStatus: string | null;
  /** Cosmetics équipés par l'user (frame d'avatar pour l'instant —
   *  badge / banner peuvent venir plus tard). Null si rien d'équipé. */
  equippedFrameId: string | null;
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
  /**
   * Paid supporter tier — drives the VIP / Légende badge on the user's
   * profile and unlocks features gated behind a tier (e.g. creating
   * private crews). Granted manually by the admin until subscription
   * payments are wired up. `null` for free users.
   */
  tier: import("@/lib/supporterTier").SupporterTier | null;
};

export type PresenceStatus = "online" | "idle" | "offline";

const ONLINE_WINDOW_MS = 60_000;
const IDLE_WINDOW_MS = 5 * 60_000;

export function statusFromLastSeen(
  lastSeen: number | null,
  /** Optional reference time. Pass a shared `now` (e.g. from
   *  `useTickEvery`) when computing the status for many users in a
   *  single render — guarantees a stable result across the list and
   *  lets React.memo'd children skip re-renders when the status
   *  doesn't change. Defaults to `Date.now()` for callers that don't
   *  care. */
  now: number = Date.now(),
): PresenceStatus {
  if (!lastSeen) return "offline";
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

/**
 * Set / clear le status custom de l'user. Pass `null` ou `""` pour
 * effacer. Cap 80 chars pour éviter qu'un user balance un roman dans
 * son statut et casse les UIs qui l'affichent.
 */
export async function setCustomStatus(uid: string, text: string | null): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  const cleaned = text?.trim().slice(0, 80) ?? "";
  await setDoc(
    doc(fb.db, "users", uid),
    {
      customStatus: cleaned || null,
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
  // Reuse the same `UserPresence` reference across snapshots when the
  // visible fields didn't change, so React.memo'd consumers (UserRow,
  // MemberRow, MessageItem) skip work when an unrelated user heartbeats.
  // Without this, every 30 s heartbeat from any single user would
  // emit a fresh array of 30+ fresh objects, busting referential
  // equality everywhere.
  const cache = new Map<string, UserPresence>();
  // Cap the live stream at 200 most-recently-seen users. The launcher
  // is small enough today (< 50 active users) that this is well above
  // the realistic ceiling, but having an explicit cap means the
  // bandwidth and re-render cost stays bounded as the user base grows.
  // If we ever exceed 200, older accounts are still readable via
  // direct fetch on ProfilePage — they just don't appear in the
  // Communauté list automatically.
  const q = query(
    collection(fb.db, "users"),
    orderBy("lastSeen", "desc"),
    fbLimit(200),
  );
  return onSnapshot(q, (snap) => {
    const next: UserPresence[] = [];
    const seen = new Set<string>();
    for (const d of snap.docs) {
      seen.add(d.id);
      const fresh = parseUserDoc(d.id, d.data());
      const cached = cache.get(d.id);
      if (cached && userPresenceEqual(cached, fresh)) {
        next.push(cached);
      } else {
        cache.set(d.id, fresh);
        next.push(fresh);
      }
    }
    // Drop cache entries for users that no longer exist in the snapshot.
    for (const uid of cache.keys()) {
      if (!seen.has(uid)) cache.delete(uid);
    }
    callback(next);
  });
}

/**
 * Deep equality check on the fields a consumer would observe. Returns
 * true when two `UserPresence` objects are visibly identical, so the
 * old reference can be reused. Order and field set must match
 * `UserPresence` exactly — adding a new visible field requires
 * extending this check or memoization will return stale values.
 */
function userPresenceEqual(a: UserPresence, b: UserPresence): boolean {
  if (
    a.uid !== b.uid ||
    a.displayName !== b.displayName ||
    a.username !== b.username ||
    a.avatarUrl !== b.avatarUrl ||
    a.discordId !== b.discordId ||
    a.lastSeen !== b.lastSeen ||
    a.bio !== b.bio ||
    a.bannerUrl !== b.bannerUrl ||
    a.accentColor !== b.accentColor ||
    a.profileTheme !== b.profileTheme ||
    a.tier !== b.tier ||
    a.customStatus !== b.customStatus ||
    a.equippedFrameId !== b.equippedFrameId
  ) {
    return false;
  }
  // currentActivity (object | null)
  if ((a.currentActivity == null) !== (b.currentActivity == null)) return false;
  if (
    a.currentActivity &&
    b.currentActivity &&
    (a.currentActivity.moduleId !== b.currentActivity.moduleId ||
      a.currentActivity.moduleName !== b.currentActivity.moduleName ||
      a.currentActivity.startedAt !== b.currentActivity.startedAt)
  ) {
    return false;
  }
  // pinnedModuleIds (string[]) — order-sensitive on purpose, the user
  // may reorder their pinned games.
  if (a.pinnedModuleIds.length !== b.pinnedModuleIds.length) return false;
  for (let i = 0; i < a.pinnedModuleIds.length; i++) {
    if (a.pinnedModuleIds[i] !== b.pinnedModuleIds[i]) return false;
  }
  // privacy (object) — three booleans.
  if (
    a.privacy.showActivity !== b.privacy.showActivity ||
    a.privacy.showPlaytime !== b.privacy.showPlaytime ||
    a.privacy.allowDirectMessages !== b.privacy.allowDirectMessages
  ) {
    return false;
  }
  return true;
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
    customStatus:
      typeof data.customStatus === "string" && data.customStatus.trim()
        ? data.customStatus.trim().slice(0, 80)
        : null,
    equippedFrameId: (() => {
      const eq = data.equippedCosmetics as { frame?: unknown } | undefined;
      return typeof eq?.frame === "string" ? eq.frame : null;
    })(),
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
    tier:
      data.tier === "supporter" || data.tier === "vip" || data.tier === "legend"
        ? data.tier
        : null,
  };
}
