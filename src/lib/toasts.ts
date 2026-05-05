/**
 * In-game toast notifications — Phase 2 of the overlay feature.
 * The toasts window itself is rendered by `ToastsApp.tsx` ; this
 * helper just centralises the localStorage flags that gate which
 * kinds the user wants to see, plus a global on/off switch.
 *
 * Default : everything ON. Users who find it too noisy can flip
 * individual kinds off in Settings → Overlay.
 */

export type ToastKind = "friend-online" | "friend-launched" | "message";

const ENABLED_KEY = "toasts-enabled";
const KIND_KEY = (kind: ToastKind) => `toasts-${kind}-enabled`;

export function getToastsEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setToastsEnabled(value: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

export function getToastsKindEnabled(kind: ToastKind): boolean {
  try {
    const v = localStorage.getItem(KIND_KEY(kind));
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setToastsKindEnabled(kind: ToastKind, value: boolean): void {
  try {
    localStorage.setItem(KIND_KEY(kind), value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

/** Pretty label for the Settings UI. */
export const TOAST_KIND_LABEL: Record<ToastKind, string> = {
  "friend-online": "Ami passe en ligne",
  "friend-launched": "Ami lance un jeu",
  message: "Nouveau message",
};
