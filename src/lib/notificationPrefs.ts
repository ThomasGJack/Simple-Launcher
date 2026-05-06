/**
 * User preferences controlling which kinds of events trigger an OS-
 * native Windows notification (toast in the bottom-right that
 * persists in Action Center even after the user comes back). The
 * native notification fires only when the launcher is NOT focused
 * (minimized, in tray, or another window has focus). When the user
 * is actively in the launcher, in-app toasts handle the same events.
 *
 * Persisted to localStorage so the choice survives a relaunch.
 */

export type NotifKind =
  | "message"
  | "friend-online"
  | "friend-launched"
  | "achievement"
  | "crew-mention";

const KEY = (kind: NotifKind) => `notif-native-${kind}`;
const MASTER_KEY = "notif-native-enabled";

/** Default-on for messages + achievements, default-off for the more
 *  ambient signals so the user isn't bombarded on day 1. They can
 *  flip them on in Settings. */
const DEFAULTS: Record<NotifKind, boolean> = {
  message: true,
  achievement: true,
  "crew-mention": true,
  "friend-online": false,
  "friend-launched": false,
};

export function getNativeNotifsEnabled(): boolean {
  try {
    const v = localStorage.getItem(MASTER_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setNativeNotifsEnabled(value: boolean): void {
  try {
    localStorage.setItem(MASTER_KEY, value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

export function getNativeNotifKind(kind: NotifKind): boolean {
  try {
    const v = localStorage.getItem(KEY(kind));
    return v === null ? DEFAULTS[kind] : v === "1";
  } catch {
    return DEFAULTS[kind];
  }
}

export function setNativeNotifKind(kind: NotifKind, value: boolean): void {
  try {
    localStorage.setItem(KEY(kind), value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

/** True if a notification of the given kind should fire right now —
 *  master switch ON + this specific kind ON. Used by the dispatchers
 *  to gate the actual `sendNotification` call. */
export function shouldFireNativeNotif(kind: NotifKind): boolean {
  return getNativeNotifsEnabled() && getNativeNotifKind(kind);
}

export const NOTIF_KIND_LABEL: Record<NotifKind, string> = {
  message: "Nouveau message privé",
  achievement: "Achievement débloqué",
  "crew-mention": "Tu es mentionné dans un crew",
  "friend-online": "Ami passe en ligne",
  "friend-launched": "Ami lance un jeu",
};
