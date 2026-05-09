// Picture-in-Picture wrappers — frontend → Rust commands. Le PiP est
// une 4e fenêtre Tauri (en plus de main / overlay / toasts) qui flotte
// au-dessus d'un jeu en borderless pour afficher un mini-feed live :
// amis online, derniers DM, derniers achievements.
//
// Toggle pilotable depuis :
//   - Bouton dans Settings → Notifications
//   - Raccourci custom (cf. customShortcuts.ts → action "pip.toggle")

import { invoke } from "@tauri-apps/api/core";

export async function togglePip(): Promise<void> {
  await invoke("pip_toggle");
}

export async function showPip(): Promise<void> {
  await invoke("pip_show");
}

export async function hidePip(): Promise<void> {
  await invoke("pip_hide");
}

export async function setPipBounds(
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<void> {
  await invoke("pip_set_bounds", { x, y, w, h });
}

// ─── Position persistée en localStorage ─────────────────────────────────

const LS_BOUNDS = "pip.bounds.v1";

export type PipBounds = { x: number; y: number; w: number; h: number };

export function loadPipBounds(): PipBounds | null {
  try {
    const raw = localStorage.getItem(LS_BOUNDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.x === "number" &&
      typeof parsed?.y === "number" &&
      typeof parsed?.w === "number" &&
      typeof parsed?.h === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePipBounds(bounds: PipBounds): void {
  try {
    localStorage.setItem(LS_BOUNDS, JSON.stringify(bounds));
  } catch {
    /* ignore */
  }
}
