// OBS WebSocket bridge — wrappers TS autour des commands Tauri Rust
// définies dans `src-tauri/src/obs_ws.rs`. Permet de connecter au
// plugin obs-websocket d'OBS Studio et pousser des events overlay
// (achievement, friend online, crew activity).

import { invoke } from "@tauri-apps/api/core";

export type ObsConfig = {
  url: string;
  password: string;
};

const LS_KEY = "obs.config.v1";

export async function connectObs(url: string, password: string): Promise<void> {
  await invoke("obs_connect", { url, password });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ url, password }));
  } catch {
    /* ignore */
  }
}

export async function disconnectObs(): Promise<void> {
  await invoke("obs_disconnect");
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export async function sendObsOverlayEvent(payload: unknown): Promise<void> {
  await invoke("obs_send_overlay_event", { payload });
}

export function loadStoredObsConfig(): ObsConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.url === "string" &&
      typeof parsed.password === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Restore au boot — silencieux si OBS Studio n'est pas lancé chez le
 * user (la connexion WebSocket échoue, on log et on continue).
 */
export async function restoreObsConfig(): Promise<ObsConfig | null> {
  const cfg = loadStoredObsConfig();
  if (!cfg) return null;
  try {
    await invoke("obs_connect", { url: cfg.url, password: cfg.password });
    return cfg;
  } catch (err) {
    console.warn("[obs] restore failed (OBS pas lancé ?) :", err);
    return null;
  }
}
