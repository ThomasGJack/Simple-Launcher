/**
 * Generic in-app toast queue used by ALL the app's transient
 * feedback that's not specifically tied to a window or page.
 *
 * Lives in parallel to the achievement toast queue (which has its
 * own celebrate animation) and the in-game toasts window (separate
 * Tauri webview). This one fires inside the main launcher window
 * and is meant for short status updates : "Crew créé", "Image
 * uploadée", "Erreur réseau", etc.
 *
 * The queue is a tiny pub/sub : `pushUiToast()` adds + notifies
 * subscribers, and `<UiToastsHost>` renders the live list. No
 * Zustand needed — toasts are ephemeral, no other components care
 * about them.
 */

export type UiToastKind = "info" | "success" | "warning" | "error";

export type UiToast = {
  id: string;
  kind: UiToastKind;
  title: string;
  description?: string;
  /** Optional action button shown on the right of the toast (e.g.
   *  "Voir" → navigate to a page). Auto-dismisses on click. */
  action?: { label: string; onClick: () => void };
  /** Lifetime in ms. Default 4000. Errors default 6000 (a bit more
   *  time to read). Pass `0` to make it persistent until the user
   *  dismisses with the close button. */
  lifetimeMs?: number;
};

type Listener = (toasts: UiToast[]) => void;

let queue: UiToast[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function notify(): void {
  for (const l of listeners) l(queue);
}

/**
 * Push a toast. Returns the toast id so the caller can manually
 * dismiss it before its lifetime elapses (e.g. an upload progress
 * toast that the caller wants to replace with a success toast).
 */
export function pushUiToast(toast: Omit<UiToast, "id">): string {
  // Per-kind opt-in : the user can disable categories from Settings.
  // Errors are never silenced (we never want to swallow a fatal).
  if (toast.kind !== "error" && !getUiToastsKindEnabled(toast.kind)) {
    return "";
  }
  const id = `toast-${nextId++}`;
  const t: UiToast = { ...toast, id };
  queue = [...queue, t];
  notify();
  const lifetime = t.lifetimeMs ?? (t.kind === "error" ? 6000 : 4000);
  if (lifetime > 0) {
    setTimeout(() => dismissUiToast(id), lifetime);
  }
  return id;
}

export function dismissUiToast(id: string): void {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) notify();
}

export function dismissAllUiToasts(): void {
  if (queue.length === 0) return;
  queue = [];
  notify();
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeUiToasts(listener: Listener): () => void {
  listeners.push(listener);
  // Immediately push current state so the new subscriber paints
  // existing toasts on mount.
  listener(queue);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

// ─── Per-kind opt-in (localStorage flags) ───────────────────────────

const KIND_KEY = (kind: UiToastKind) => `ui-toast-${kind}-enabled`;

/** Default-on for everything — user can disable categories in
 *  Settings if a particular kind is too chatty for them. */
export function getUiToastsKindEnabled(kind: UiToastKind): boolean {
  try {
    const v = localStorage.getItem(KIND_KEY(kind));
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setUiToastsKindEnabled(kind: UiToastKind, value: boolean): void {
  try {
    localStorage.setItem(KIND_KEY(kind), value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

export const UI_TOAST_KIND_LABEL: Record<UiToastKind, string> = {
  info: "Info",
  success: "Succès",
  warning: "Avertissement",
  error: "Erreur (toujours visible)",
};
