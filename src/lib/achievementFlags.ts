/**
 * Local one-shot flags that feed into the achievement evaluation
 * context but are not derivable from Firestore alone (e.g. "did the
 * user open the share-profile modal at least once?").
 *
 * These persist across launches via localStorage. They're intentionally
 * not synced to Firestore — they only matter as triggers for the local
 * unlock check, and once an achievement is unlocked the unlock doc on
 * Firestore is the canonical record.
 *
 * The `bootHour` flag is special: it isn't a flag at all, just a
 * convenience getter for the hour of the current launch (used by the
 * night-owl / early-bird achievements). Stored as `boot.lastHour` so
 * the achievement evaluator can read it without needing to know about
 * `Date()`.
 */

const KEY_PROFILE_SHARED = "ach.flag.profileShared.v1";
const KEY_OFFLINE_USED = "ach.flag.offlineUsed.v1";
const KEY_LAST_BOOT_HOUR = "ach.boot.lastHour.v1";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

export const achievementFlags = {
  /** Mark the user as having opened the share-profile modal. Called by
   *  ShareProfileModal on mount. Idempotent. */
  markProfileShared() {
    writeFlag(KEY_PROFILE_SHARED, true);
  },
  hasSharedProfile(): boolean {
    return readFlag(KEY_PROFILE_SHARED);
  },

  /** Mark the user as having entered offline mode at least once. Called
   *  by the offline boot fallback in App.tsx. Idempotent. */
  markOfflineUsed() {
    writeFlag(KEY_OFFLINE_USED, true);
  },
  hasUsedOffline(): boolean {
    return readFlag(KEY_OFFLINE_USED);
  },

  /** Persist the current boot hour so the achievement context has a
   *  deterministic source for it (rather than re-reading Date() each
   *  evaluation, which could shift across midnight mid-session). */
  setBootHour(hour: number) {
    try {
      localStorage.setItem(KEY_LAST_BOOT_HOUR, String(hour));
    } catch {
      /* non-fatal */
    }
  },
  getBootHour(): number {
    try {
      const raw = localStorage.getItem(KEY_LAST_BOOT_HOUR);
      const n = raw === null ? new Date().getHours() : parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 && n < 24 ? n : new Date().getHours();
    } catch {
      return new Date().getHours();
    }
  },
};
