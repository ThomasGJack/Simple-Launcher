/**
 * Local one-shot flags that feed into the achievement evaluation context
 * but are not derivable from Firestore alone (e.g. "did the user open
 * the share-profile modal at least once?").
 *
 * Each flag is a single localStorage key. They survive across launches,
 * are not synced to Firestore (the unlock doc is the canonical record),
 * and are intentionally one-way — once true, always true. That makes
 * the achievement evaluator deterministic and the flags safe to read at
 * any time without race conditions.
 */

const KEYS = {
  bootHour: "ach.boot.lastHour.v1",
  microsoftLinked: "ach.flag.microsoftLinked.v1",
  modpackInstalled: "ach.flag.modpackInstalled.v1",
  mcServerJoined: "ach.flag.mcServerJoined.v1",
  mcBackupRestored: "ach.flag.mcBackupRestored.v1",
  themeChanged: "ach.flag.themeChanged.v1",
  qrShared: "ach.flag.qrShared.v1",
  profileShared: "ach.flag.profileShared.v1",
  trayDiscovered: "ach.flag.trayDiscovered.v1",
  updateInstalled: "ach.flag.updateInstalled.v1",
  offlineUsed: "ach.flag.offlineUsed.v1",
  crashReportSent: "ach.flag.crashReportSent.v1",
  konami: "ach.flag.konami.v1",
} as const;

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
  // ── Boot hour snapshot ───────────────────────────────────────────
  setBootHour(hour: number) {
    try {
      localStorage.setItem(KEYS.bootHour, String(hour));
    } catch {
      /* non-fatal */
    }
  },
  getBootHour(): number {
    try {
      const raw = localStorage.getItem(KEYS.bootHour);
      const n = raw === null ? new Date().getHours() : parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 && n < 24 ? n : new Date().getHours();
    } catch {
      return new Date().getHours();
    }
  },

  // ── One-shot flags ───────────────────────────────────────────────
  markMicrosoftLinked() { writeFlag(KEYS.microsoftLinked, true); },
  hasMicrosoftLinked(): boolean { return readFlag(KEYS.microsoftLinked); },

  markModpackInstalled() { writeFlag(KEYS.modpackInstalled, true); },
  hasModpackInstalled(): boolean { return readFlag(KEYS.modpackInstalled); },

  markMcServerJoined() { writeFlag(KEYS.mcServerJoined, true); },
  hasMcServerJoined(): boolean { return readFlag(KEYS.mcServerJoined); },

  markMcBackupRestored() { writeFlag(KEYS.mcBackupRestored, true); },
  hasMcBackupRestored(): boolean { return readFlag(KEYS.mcBackupRestored); },

  markThemeChanged() { writeFlag(KEYS.themeChanged, true); },
  hasThemeChanged(): boolean { return readFlag(KEYS.themeChanged); },

  /** Triggered by the QR-code modal (visible Personalisation badge). */
  markQrShared() { writeFlag(KEYS.qrShared, true); },
  hasQrShared(): boolean { return readFlag(KEYS.qrShared); },

  /** Triggered by ANY share-profile action — feeds the secret
   *  Easter-egg "evangelist". Same source as `markQrShared`, kept
   *  separate so the two unlocks stay logically distinct. */
  markProfileShared() {
    writeFlag(KEYS.profileShared, true);
    writeFlag(KEYS.qrShared, true);
  },
  hasSharedProfile(): boolean { return readFlag(KEYS.profileShared); },

  markTrayDiscovered() { writeFlag(KEYS.trayDiscovered, true); },
  hasTrayDiscovered(): boolean { return readFlag(KEYS.trayDiscovered); },

  markUpdateInstalled() { writeFlag(KEYS.updateInstalled, true); },
  hasUpdateInstalled(): boolean { return readFlag(KEYS.updateInstalled); },

  markOfflineUsed() { writeFlag(KEYS.offlineUsed, true); },
  hasUsedOffline(): boolean { return readFlag(KEYS.offlineUsed); },

  markCrashReportSent() { writeFlag(KEYS.crashReportSent, true); },
  hasCrashReportSent(): boolean { return readFlag(KEYS.crashReportSent); },

  markKonami() { writeFlag(KEYS.konami, true); },
  hasKonami(): boolean { return readFlag(KEYS.konami); },

  /** Re-export of the crew-joined flag managed inside `firebase/crews.ts`
   *  (set on first message sent in any crew channel). Lives in the
   *  same localStorage key so the evaluator only sees one source of
   *  truth via this helper. */
  hasCrewJoined(): boolean {
    return readFlag("ach.flag.crewJoined.v1");
  },
};
