import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrapper around the Rust `mc_auth_*` Tauri commands. The
 * heavy-lifting (loopback OAuth, the 4-hop Microsoft → Xbox → XSTS →
 * Mojang chain, refresh-token persistence) all happens in
 * `src-tauri/src/mc_auth.rs`. This module just types the inputs and
 * outputs cleanly.
 *
 * Sensitive token fields (`mcAccessToken`, `msRefreshToken`) come
 * through here for the eventual launch path — the UI itself only needs
 * `uuid`, `playerName`, `expiresAt` for display.
 */

export type McAccount = {
  /** Minecraft UUID without dashes. */
  uuid: string;
  /** In-game player name. */
  playerName: string;
  /** Current Minecraft access token. Short-lived. */
  mcAccessToken: string;
  /** Microsoft refresh token. Long-lived; never sent over the network
   *  except to login.microsoftonline.com during silent renewal. */
  msRefreshToken: string;
  /** Epoch millis at which `mcAccessToken` stops being usable. */
  expiresAt: number;
  /** When this record was first added (epoch millis). */
  addedAt: number;
};

/**
 * Starts an interactive Microsoft login. Opens the system browser to
 * the Microsoft consent screen, waits for the user to complete the
 * flow, then runs the full chain to Mojang and persists the resulting
 * account locally. Resolves with the new account on success; rejects
 * with a friendly French message on any leg failure (no Xbox profile,
 * minor with no family, doesn't own Minecraft, etc.).
 *
 * Caller should show a "logging in…" UI while this runs and surface
 * any rejection text directly to the user.
 */
export async function mcAuthLogin(): Promise<McAccount> {
  return invoke<McAccount>("mc_auth_login");
}

/** Returns every Minecraft account stored locally. */
export async function mcAuthList(): Promise<McAccount[]> {
  return invoke<McAccount[]>("mc_auth_list");
}

/** Removes a stored account. Idempotent. */
export async function mcAuthLogout(uuid: string): Promise<void> {
  await invoke<void>("mc_auth_logout", { uuid });
}

/**
 * Forces a silent refresh using the stored MS refresh token. Use this
 * before launching the game when `account.expiresAt - Date.now() < ~5 min`,
 * or as a "test that auth still works" button in settings.
 */
export async function mcAuthRefresh(uuid: string): Promise<McAccount> {
  return invoke<McAccount>("mc_auth_refresh", { uuid });
}

// ─── Fallback (legacy MSA + Mojang client_id) ─────────────────────────
//
// Stopgap path while the primary Azure app is being reviewed by Mojang
// (the `Invalid app registration` 403). Two-step flow because the legacy
// redirect lands on a Microsoft-hosted page we can't intercept locally —
// the user has to paste the final URL back.

/** Step 1 of the fallback flow: opens the system browser at Microsoft's
 *  legacy authorize URL with Mojang's well-known client_id. The user
 *  logs in, ends up on a "you can close this window" page; they must
 *  copy that page's address-bar URL and pass it to `mcAuthFallbackComplete`. */
export async function mcAuthFallbackStart(): Promise<void> {
  await invoke<void>("mc_auth_fallback_start");
}

/** Step 2 of the fallback flow: extracts the auth code from the URL the
 *  user pasted, then runs the full XBL → XSTS → Mojang chain (legacy
 *  XBL flavor) and persists the resulting account. */
export async function mcAuthFallbackComplete(redirectUrl: string): Promise<McAccount> {
  return invoke<McAccount>("mc_auth_fallback_complete", { redirectUrl });
}

/** Convenience: true if the account's MC access token is within 5 min
 *  of expiring (or already expired). UI can colour the chip in amber. */
export function isAccountExpiringSoon(account: McAccount): boolean {
  return account.expiresAt - Date.now() < 5 * 60_000;
}

/** Mojang returns UUIDs with no dashes (`06bcf2c47a5e4f5fb5f9e3cce8a3b94f`).
 *  Most avatar services accept both forms but the dashed form
 *  (`06bcf2c4-7a5e-4f5f-b5f9-e3cce8a3b94f`) is the canonical one and works
 *  with every service we might fall back to. */
export function uuidWithDashes(uuid: string): string {
  const cleaned = uuid.replace(/-/g, "");
  if (cleaned.length !== 32) return uuid;
  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
}

/** Returns an array of avatar/face URLs for the given UUID, ordered by
 *  preference. The UI tries them in order via `<img onError>`: if one
 *  service is down or rate-limiting us, we move on to the next. */
export function avatarUrls(uuid: string, size = 64): string[] {
  const dashed = uuidWithDashes(uuid);
  return [
    `https://mc-heads.net/avatar/${dashed}/${size}`,
    `https://minotar.net/avatar/${dashed}/${size}`,
    `https://crafatar.com/avatars/${dashed}?size=${size}&overlay`,
  ];
}
