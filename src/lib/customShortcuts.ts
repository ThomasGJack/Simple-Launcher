// Custom keyboard shortcuts — registry des actions bindables côté
// frontend + glue avec les commands Tauri Rust (`shortcuts.rs`).
//
// Architecture : chaque action a un `id` stable + un handler React.
// Le user peut rebinder le hotkey via Settings ; au boot, on
// re-register tous les bindings. Sur trigger, Rust émet
// `shortcut-triggered` que `bootCustomShortcuts()` écoute pour
// dispatcher vers le bon handler.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ShortcutAction = {
  /** Stable key — utilisée comme localStorage / Rust binding ID. */
  id: string;
  /** Label affiché dans le panel Settings. */
  label: string;
  /** Hotkey par défaut, ex `"F2"`, `"Ctrl+Shift+O"`. Vide = pas de
   *  binding par défaut, l'user doit en assigner un. */
  defaultKey: string;
  /** Hint optionnel sous le label dans le panel. */
  hint?: string;
};

/**
 * Catalog des actions disponibles. Order = order d'affichage dans
 * le panel Settings.
 *
 * Note : certaines actions (screenshot, mute) ne sont pas encore
 * implémentées (Phase G + Phase ultérieure). Le binding fonctionne
 * mais le handler logge "TODO" — on les remplit au fil des phases
 * sans casser la compat des bindings utilisateur déjà sauvés.
 */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // Note : `overlay.toggle` est géré séparément par le panel Overlay
  // existant (overlay.rs), pour éviter un conflit de double binding
  // sur la même combo. Le user customise l'overlay là-bas, et les
  // autres actions ici.
  {
    id: "screenshot.capture",
    label: "Capture d'écran",
    defaultKey: "F2",
    hint: "Pas encore implémenté — sera dispo en Phase G (screenshot manager).",
  },
  {
    id: "mute.toggle",
    label: "Mute / unmute du micro",
    defaultKey: "",
    hint: "Sera dispo avec le voice chat WebRTC (Phase I).",
  },
  {
    id: "library.next",
    label: "Module suivant dans la bibliothèque",
    defaultKey: "",
    hint: "Naviguer vite dans ta liste de modules sans la souris.",
  },
  {
    id: "library.prev",
    label: "Module précédent",
    defaultKey: "",
  },
  {
    id: "focus.search",
    label: "Focus la barre de recherche",
    defaultKey: "",
    hint: "Pour aller vite quand tu cherches un user / module / channel.",
  },
];

const LS_KEY = "shortcuts.bindings.v1";
type Bindings = Record<string, string>; // action_id → spec

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultBindings();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...defaultBindings(), ...parsed };
    }
    return defaultBindings();
  } catch {
    return defaultBindings();
  }
}

function defaultBindings(): Bindings {
  const out: Bindings = {};
  for (const a of SHORTCUT_ACTIONS) {
    if (a.defaultKey) out[a.id] = a.defaultKey;
  }
  return out;
}

export function saveBindings(b: Bindings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

/**
 * (Re-)register tous les bindings côté Rust. Appelée au boot et
 * après chaque rebind dans le panel Settings.
 */
export async function applyBindings(b: Bindings): Promise<void> {
  // Unregister tout — plus simple que de diff.
  try {
    await invoke("shortcuts_unregister_all");
  } catch (err) {
    console.warn("[shortcuts] unregister_all failed:", err);
  }
  for (const [actionId, spec] of Object.entries(b)) {
    if (!spec) continue;
    try {
      await invoke("shortcuts_register", { actionId, spec });
    } catch (err) {
      console.warn(`[shortcuts] register ${actionId}=${spec} failed:`, err);
    }
  }
}

/** Met à jour 1 binding + persiste + re-applique. */
export async function setBinding(actionId: string, spec: string): Promise<void> {
  const b = loadBindings();
  if (spec) {
    b[actionId] = spec;
  } else {
    delete b[actionId];
  }
  saveBindings(b);
  await applyBindings(b);
}

// ─── Action handlers ─────────────────────────────────────────────────

type Handler = () => void | Promise<void>;
const handlers = new Map<string, Handler>();

/** Permet aux composants React de register leur propre handler pour
 *  une action donnée. Utile pour les actions qui dépendent du React
 *  state (ex: navigation library next module). */
export function onShortcut(actionId: string, handler: Handler): () => void {
  handlers.set(actionId, handler);
  return () => {
    if (handlers.get(actionId) === handler) {
      handlers.delete(actionId);
    }
  };
}

/**
 * Dispatcher central : au boot, écoute les events Rust
 * `shortcut-triggered` et call le handler enregistré pour l'action_id.
 * Si pas de handler enregistré, fallback : pour `overlay.toggle` on
 * appelle directement `invoke("overlay_toggle")` ; sinon log TODO.
 */
export async function bootCustomShortcuts(): Promise<() => void> {
  await applyBindings(loadBindings());
  const unlisten = await listen<string>("shortcut-triggered", (event) => {
    const actionId = event.payload;
    const h = handlers.get(actionId);
    if (h) {
      try {
        const r = h();
        if (r instanceof Promise) {
          r.catch((err) => console.warn(`[shortcuts] ${actionId} handler:`, err));
        }
      } catch (err) {
        console.warn(`[shortcuts] ${actionId} handler:`, err);
      }
      return;
    }
    // Pas de handler enregistré — log et continue. Les composants
    // qui veulent écouter une action devraient appeler `onShortcut()`
    // au mount.
    console.info(`[shortcuts] action « ${actionId} » triggered, no handler.`);
  });
  return unlisten;
}
