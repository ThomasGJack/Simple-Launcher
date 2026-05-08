// Twitch Rich Presence — wrappers TS autour des commands Tauri Rust
// définies dans `src-tauri/src/twitch_rpc.rs`.
//
// Le user fournit manuellement son Client ID (Twitch dev console)
// et son User Access Token (twitchtokengenerator.com avec scope
// `channel:manage:broadcast`). Pas d'OAuth flow auto pour l'instant.
//
// La config est persistée en localStorage côté client. Au boot,
// `restoreTwitchConfig()` la relit et appelle `twitch_set_config`
// pour réhydrater la state Rust.

import { invoke } from "@tauri-apps/api/core";

export type TwitchConfig = {
  clientId: string;
  accessToken: string;
  broadcasterId: string;
};

export type TwitchUserInfo = {
  userId: string;
  login: string;
  displayName: string;
};

const LS_KEY = "twitch.config.v1";

export async function validateTwitchToken(
  clientId: string,
  accessToken: string,
): Promise<TwitchUserInfo> {
  return invoke<TwitchUserInfo>("twitch_validate_token", {
    clientId,
    accessToken,
  });
}

/**
 * Persiste la config localStorage + push vers Rust state. Renvoie
 * la config complète (avec broadcasterId résolu via validation).
 */
export async function connectTwitch(
  clientId: string,
  accessToken: string,
): Promise<{ config: TwitchConfig; user: TwitchUserInfo }> {
  const user = await validateTwitchToken(clientId, accessToken);
  const config: TwitchConfig = {
    clientId,
    accessToken,
    broadcasterId: user.userId,
  };
  await invoke("twitch_set_config", {
    config: {
      // snake_case attendu côté Rust serde
      client_id: config.clientId,
      access_token: config.accessToken,
      broadcaster_id: config.broadcasterId,
    },
  });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    /* storage off */
  }
  return { config, user };
}

export async function disconnectTwitch(): Promise<void> {
  await invoke("twitch_set_config", { config: null });
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStoredTwitchConfig(): TwitchConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.clientId === "string" &&
      typeof parsed.accessToken === "string" &&
      typeof parsed.broadcasterId === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Au boot de l'app, restaurer la config Twitch en mémoire Rust depuis
 * localStorage. Pas de validation API ici — si le token a expiré, le
 * prochain set_title échouera silencieusement et l'user devra
 * reconnecter via le panel Settings.
 */
export async function restoreTwitchConfig(): Promise<TwitchConfig | null> {
  const cfg = loadStoredTwitchConfig();
  if (!cfg) return null;
  try {
    await invoke("twitch_set_config", {
      config: {
        client_id: cfg.clientId,
        access_token: cfg.accessToken,
        broadcaster_id: cfg.broadcasterId,
      },
    });
    return cfg;
  } catch (err) {
    console.warn("[twitch] restore config failed:", err);
    return null;
  }
}

export async function setTwitchTitle(title: string): Promise<void> {
  await invoke("twitch_set_title", { title });
}
