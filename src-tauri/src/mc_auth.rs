// Microsoft → Xbox Live → XSTS → Mojang authentication chain for
// Minecraft. This is the auth side of the eventual native Minecraft
// launcher (no Prism dependency). It does **not** install or launch the
// game — just gets a valid `mcAccessToken` + profile (UUID, name) and
// stores enough refresh material to renew the session silently later.
//
// Flow (5 hops):
//   1. PKCE-protected OAuth 2.0 against `login.microsoftonline.com`
//      (redirect_uri = http://localhost:{port}/callback)
//   2. Exchange the auth code for a Microsoft access_token + refresh_token
//   3. Trade the MS access_token for an Xbox Live (XBL) token + userHash
//   4. Trade the XBL token for an XSTS token (the one Mojang accepts)
//   5. Trade the XSTS token for a Minecraft access_token, then GET the
//      profile (UUID, name)
//
// The MS refresh_token is what we keep long-term — it lets us silently
// re-do steps 2..5 when the MC token expires, without the user seeing a
// browser pop-up.
//
// Account storage: a JSON file at <APPDATA>/Simple Launcher/mc_accounts.json.
// For the dev iteration this file is plain text — production should move
// to OS keyring (Windows Credential Manager via the `keyring` crate). The
// API surface here doesn't change, so the swap is one struct method away.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

// ─── Config ───────────────────────────────────────────────────────────

/// Public Azure App Registration client ID. Safe to bundle: it's a public
/// identifier, not a secret. Authentication is secured via PKCE + the
/// loopback redirect (only the local launcher can receive the code).
const MS_CLIENT_ID: &str = "f7c636bd-ce15-4cae-9ad2-ff4bfc4d4f3a";

/// Scopes requested. `XboxLive.signin` is the gateway to the Xbox/Mojang
/// chain, `offline_access` is needed for refresh tokens (silent renewal).
const MS_SCOPES: &str = "XboxLive.signin offline_access";

/// Endpoints. We deliberately use `/consumers/` rather than `/common/` —
/// only personal Microsoft accounts work with Xbox/Minecraft auth, and
/// `common` would route some users to AAD where the chain breaks.
const MS_AUTHORIZE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const MS_TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

// ─── Fallback (legacy MSA) flow ───────────────────────────────────────
//
// Used as a backup when the primary Azure app registration hasn't been
// allowlisted by Mojang yet (the `aka.ms/AppRegInfo` 403). Uses the old
// Mojang-launcher client_id which has been allowlisted "since forever",
// at the cost of:
//   - No PKCE (legacy MSA flow)
//   - Redirect URI must be `oauth20_desktop.srf` (Microsoft-hosted page,
//     so we can't intercept it locally — user pastes the URL back)
//   - XBL hop uses the raw access_token (no "d=" prefix)
//
// This is a stopgap. Once the primary app is approved, the user should
// switch back to the primary flow (which is more secure + supports
// silent refresh via standard MS endpoints).
const FALLBACK_CLIENT_ID: &str = "00000000402b5328";
const FALLBACK_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";
const FALLBACK_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const FALLBACK_AUTHORIZE_URL: &str = "https://login.live.com/oauth20_authorize.srf";
const FALLBACK_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";

// ─── Types ────────────────────────────────────────────────────────────

/// The fully-resolved record stored on disk. We keep both the MS refresh
/// token (long-lived, used for silent renewal) and the current MC access
/// token (short-lived, used to launch the game). When the MC token
/// expires, we re-run the full chain from the MS refresh token without
/// re-prompting the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McAccount {
    /// Minecraft UUID without dashes.
    pub uuid: String,
    /// Minecraft in-game player name.
    pub player_name: String,
    /// Current Minecraft access token. Short-lived (~24 h).
    pub mc_access_token: String,
    /// Microsoft refresh token. Long-lived. Used to silently re-mint a
    /// fresh MC access token when the current one expires.
    pub ms_refresh_token: String,
    /// Epoch millis at which `mc_access_token` stops being usable. We
    /// refresh ~5 minutes before this on the next launch attempt.
    pub expires_at: i64,
    /// When this record was first added (informational).
    pub added_at: i64,
}

/// Marker state managed by Tauri so commands can be `tauri::State<...>`
/// in the future if we ever need shared in-memory cache. For now, all
/// state lives on disk in `mc_accounts.json`, so this is a unit struct.
pub struct McAuthState;

impl McAuthState {
    pub fn new() -> Self {
        Self
    }
}

// ─── Storage ──────────────────────────────────────────────────────────
//
// Two-tier persistence:
//
//   1. The PUBLIC profile (uuid, playerName, expiresAt, addedAt) lives
//      in `<APPDATA>/Simple Launcher/mc_accounts.json` so the UI and the
//      launch path can list / filter accounts cheaply.
//   2. The SECRETS (mcAccessToken, msRefreshToken) live in the OS
//      keyring (Windows Credential Manager on Win, Keychain on macOS,
//      Secret Service on Linux) under service `KEYRING_SERVICE` and
//      username `mc-{uuid}`. Keyring entries are scoped to the user
//      account so a stolen `mc_accounts.json` no longer hands an
//      attacker session material.
//
// Backwards compatibility: when reading, we accept both the old "all
// fields in JSON" format and the new "secrets in keyring" format. Any
// account read in the old shape is upgraded on the next write.

const KEYRING_SERVICE: &str = "simple-launcher-mc-auth";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct KeyringSecrets {
    mc_access_token: String,
    ms_refresh_token: String,
}

/// Public-facing record stored on disk. Secrets are stripped — only
/// metadata that's safe to expose lands here.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PublicAccount {
    uuid: String,
    player_name: String,
    expires_at: i64,
    added_at: i64,
    /// Legacy: old format had the access + refresh tokens here too. We
    /// still parse them on read so existing installs keep working, then
    /// migrate them into the keyring on the next save.
    #[serde(default)]
    mc_access_token: Option<String>,
    #[serde(default)]
    ms_refresh_token: Option<String>,
}

fn accounts_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {}", e))?;
    Ok(base.join("mc_accounts.json"))
}

fn keyring_set(uuid: &str, secrets: &KeyringSecrets) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("mc-{}", uuid))
        .map_err(|e| format!("keyring entry create failed: {}", e))?;
    let json = serde_json::to_string(secrets)
        .map_err(|e| format!("serialize secrets failed: {}", e))?;
    entry
        .set_password(&json)
        .map_err(|e| format!("keyring set failed: {}", e))?;
    // Verify the write actually stuck. On some Windows setups
    // (CredWrite blocked by AV, or transient Credential Manager
    // service quirks) `set_password` returns Ok but the entry is not
    // actually persisted — the next `get_password` returns NoEntry.
    // Without this readback the caller would think the secret was
    // saved, drop it from the JSON fallback, and then silently lose
    // the account on the very next refresh. Same flaky behaviour we
    // hit with the GitHub PAT.
    match entry.get_password() {
        Ok(stored) if stored == json => Ok(()),
        Ok(_) => Err("keyring set OK but readback returned a different value".into()),
        Err(e) => Err(format!("keyring set OK but readback failed: {}", e)),
    }
}

fn keyring_get(uuid: &str) -> Result<Option<KeyringSecrets>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("mc-{}", uuid))
        .map_err(|e| format!("keyring entry create failed: {}", e))?;
    match entry.get_password() {
        Ok(json) => {
            let parsed: KeyringSecrets = serde_json::from_str(&json)
                .map_err(|e| format!("parse keyring entry failed: {}", e))?;
            Ok(Some(parsed))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get failed: {}", e)),
    }
}

fn keyring_delete(uuid: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("mc-{}", uuid))
        .map_err(|e| format!("keyring entry create failed: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete failed: {}", e)),
    }
}

/// Short prefix of a UUID, suitable for diagnostic logs without
/// leaking the full identifier.
fn short_uuid(uuid: &str) -> &str {
    if uuid.len() >= 8 {
        &uuid[..8]
    } else {
        uuid
    }
}

async fn load_accounts<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<McAccount>, String> {
    let path = accounts_path(app)?;
    if !path.exists() {
        eprintln!("[mc-auth] load_accounts: no JSON file at {:?}", path);
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path)
        .await
        .map_err(|e| format!("read mc_accounts failed: {}", e))?;
    let public_list: Vec<PublicAccount> =
        serde_json::from_slice(&bytes).map_err(|e| format!("parse mc_accounts failed: {}", e))?;
    eprintln!(
        "[mc-auth] load_accounts: {} entries in JSON",
        public_list.len()
    );

    let mut out = Vec::with_capacity(public_list.len());
    for pub_acc in public_list {
        // JSON is the source of truth (cf. comment in save_accounts).
        // Read secrets from JSON first; only consult the keyring as a
        // last-ditch migration path for legacy entries written by a
        // previous build that stripped the JSON copy on save.
        let secrets = match (
            pub_acc.mc_access_token.clone(),
            pub_acc.ms_refresh_token.clone(),
        ) {
            (Some(a), Some(r)) => {
                eprintln!(
                    "[mc-auth] load_accounts: JSON HIT for uuid={}",
                    short_uuid(&pub_acc.uuid)
                );
                KeyringSecrets {
                    mc_access_token: a,
                    ms_refresh_token: r,
                }
            }
            _ => match keyring_get(&pub_acc.uuid) {
                Ok(Some(s)) => {
                    eprintln!(
                        "[mc-auth] load_accounts: JSON had no secrets for uuid={}, keyring rescue OK",
                        short_uuid(&pub_acc.uuid)
                    );
                    s
                }
                _ => {
                    eprintln!(
                        "[mc-auth] load_accounts: DROPPING uuid={} — no secrets in JSON or keyring",
                        short_uuid(&pub_acc.uuid)
                    );
                    continue;
                }
            },
        };
        out.push(McAccount {
            uuid: pub_acc.uuid,
            player_name: pub_acc.player_name,
            mc_access_token: secrets.mc_access_token,
            ms_refresh_token: secrets.ms_refresh_token,
            expires_at: pub_acc.expires_at,
            added_at: pub_acc.added_at,
        });
    }
    eprintln!(
        "[mc-auth] load_accounts: {} accounts ready after secret resolution",
        out.len()
    );
    Ok(out)
}

async fn save_accounts<R: Runtime>(
    app: &AppHandle<R>,
    accounts: &[McAccount],
) -> Result<(), String> {
    let path = accounts_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("create dir failed: {}", e))?;
    }
    // Source-of-truth strategy: always persist the full record (incl.
    // secrets) to the JSON file. The keyring is a best-effort second
    // copy — we still try to write to it so users with a healthy
    // Credential Manager get at-rest encryption on top — but we
    // NEVER strip the JSON-side secrets based on whether the keyring
    // reported success.
    //
    // Why: on Windows, `set_password` and the immediate readback can
    // both succeed in one process while a `get_password` call from a
    // *later* Tauri command silently returns `NoEntry`. We saw this
    // on the GitHub PAT path. Anything that drops JSON-side secrets
    // based on keyring success ends up with a phantom-logout footgun
    // ("modal closes but no account appears") because the next
    // `load_accounts` call can no longer reconstruct the secrets.
    //
    // Trade-off: refresh tokens sit in plain text inside the user's
    // `%APPDATA%\Simple Launcher\mc_accounts.json`, which is already
    // protected by Windows ACLs (per-user dir). Acceptable for a
    // small-group launcher; revoking a leaked token is a one-click
    // operation on account.live.com anyway.
    let mut public_list: Vec<PublicAccount> = Vec::with_capacity(accounts.len());
    for acc in accounts {
        match keyring_set(
            &acc.uuid,
            &KeyringSecrets {
                mc_access_token: acc.mc_access_token.clone(),
                ms_refresh_token: acc.ms_refresh_token.clone(),
            },
        ) {
            Ok(()) => eprintln!(
                "[mc-auth] save_accounts: keyring write OK for uuid={} (JSON also kept as fallback)",
                short_uuid(&acc.uuid)
            ),
            Err(err) => eprintln!(
                "[mc-auth] save_accounts: keyring write FAILED for uuid={} ({}). JSON file is the only copy.",
                short_uuid(&acc.uuid),
                err
            ),
        }
        public_list.push(PublicAccount {
            uuid: acc.uuid.clone(),
            player_name: acc.player_name.clone(),
            expires_at: acc.expires_at,
            added_at: acc.added_at,
            // Always keep secrets in JSON. See comment above.
            mc_access_token: Some(acc.mc_access_token.clone()),
            ms_refresh_token: Some(acc.ms_refresh_token.clone()),
        });
    }
    let bytes = serde_json::to_vec_pretty(&public_list)
        .map_err(|e| format!("serialize mc_accounts failed: {}", e))?;
    fs::write(&path, bytes)
        .await
        .map_err(|e| format!("write mc_accounts failed: {}", e))?;
    Ok(())
}

/// Loads a single account by UUID, fully populated (secrets included).
/// Used by `mc_launch::load_account` so launch logic doesn't have to
/// know about the keyring split.
pub async fn load_account_by_uuid<R: Runtime>(
    app: &AppHandle<R>,
    uuid: &str,
) -> Result<Option<McAccount>, String> {
    let list = load_accounts(app).await?;
    Ok(list.into_iter().find(|a| a.uuid == uuid))
}

async fn upsert_account<R: Runtime>(
    app: &AppHandle<R>,
    account: McAccount,
) -> Result<(), String> {
    let mut list = load_accounts(app).await.unwrap_or_default();
    if let Some(existing) = list.iter_mut().find(|a| a.uuid == account.uuid) {
        // Preserve original `added_at`; everything else is updated.
        let added_at = existing.added_at;
        *existing = account;
        existing.added_at = added_at;
    } else {
        list.push(account);
    }
    save_accounts(app, &list).await
}

// ─── PKCE + loopback callback ─────────────────────────────────────────

const RESPONSE_HTML: &str = r#"<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Simple Launcher — Minecraft authentifié</title>
<style>
  html,body{height:100%;margin:0;background:#07090d;color:#f5f7fa;font-family:system-ui,sans-serif;display:grid;place-items:center}
  .card{padding:36px 48px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.3);text-align:center;backdrop-filter:blur(20px);box-shadow:0 0 48px rgba(168,85,247,0.25)}
  .dot{width:10px;height:10px;border-radius:999px;background:#a855f7;display:inline-block;box-shadow:0 0 16px #a855f7;margin-right:8px;animation:p 1.4s ease-in-out infinite}
  @keyframes p{0%,100%{opacity:.5}50%{opacity:1}}
  h1{font-size:18px;margin:0 0 6px;font-weight:500}
  p{color:#97a3b6;font-size:13px;margin:0}
</style>
</head>
<body>
  <div class="card">
    <h1><span class="dot"></span>Compte Microsoft authentifié</h1>
    <p>Tu peux fermer cet onglet et retourner dans Simple Launcher.</p>
  </div>
  <script>setTimeout(()=>window.close(),1500)</script>
</body>
</html>"#;

const ERROR_HTML: &str = r#"<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Simple Launcher — Erreur</title>
<style>
  html,body{height:100%;margin:0;background:#07090d;color:#f5f7fa;font-family:system-ui,sans-serif;display:grid;place-items:center}
  .card{padding:36px 48px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(239,68,68,0.3);text-align:center;backdrop-filter:blur(20px)}
  h1{font-size:18px;margin:0 0 6px;color:#ef4444}
  p{color:#97a3b6;font-size:13px;margin:0}
</style>
</head>
<body>
  <div class="card">
    <h1>Authentification échouée</h1>
    <p>Retourne dans Simple Launcher pour voir le détail de l'erreur.</p>
  </div>
</body>
</html>"#;

fn random_b64(num_bytes: usize) -> String {
    let mut bytes = vec![0u8; num_bytes];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(&bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            other => {
                out.push('%');
                out.push_str(&format!("{:02X}", other));
            }
        }
    }
    out
}

fn urldecode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 2;
                } else {
                    out.push(bytes[i]);
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Awaits one HTTP request on `127.0.0.1:{port}` and returns the
/// `code` + `state` query params from the URL. Times out after 5 minutes
/// so a user who closes the browser doesn't strand the loopback.
async fn await_callback(listener: TcpListener) -> Result<HashMap<String, String>, String> {
    let accept = tokio::time::timeout(Duration::from_secs(300), listener.accept())
        .await
        .map_err(|_| "timeout (5 min) — la fenêtre Microsoft est restée trop longtemps ouverte".to_string())?
        .map_err(|e| format!("accept failed: {}", e))?;
    let (mut socket, _) = accept;

    let mut buf = [0u8; 8192];
    let n = socket
        .read(&mut buf)
        .await
        .map_err(|e| format!("read callback failed: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");

    let params: HashMap<String, String> = query
        .split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|kv| {
            let mut it = kv.splitn(2, '=');
            Some((urldecode(it.next()?), urldecode(it.next().unwrap_or(""))))
        })
        .collect();

    let html = if params.contains_key("error") {
        ERROR_HTML
    } else {
        RESPONSE_HTML
    };
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = socket.write_all(response.as_bytes()).await;
    let _ = socket.shutdown().await;

    Ok(params)
}

// ─── Hops 2..5 ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MsTokenResponse {
    access_token: String,
    refresh_token: String,
    #[allow(dead_code)]
    expires_in: i64,
}

async fn exchange_code_for_tokens(
    client: &reqwest::Client,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<MsTokenResponse, String> {
    let body = format!(
        "client_id={}&grant_type=authorization_code&code={}&redirect_uri={}&code_verifier={}&scope={}",
        urlencode(MS_CLIENT_ID),
        urlencode(code),
        urlencode(redirect_uri),
        urlencode(code_verifier),
        urlencode(MS_SCOPES),
    );
    let res = client
        .post(MS_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("MS token request failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("MS token response read failed: {}", e))?;
    if !status.is_success() {
        return Err(format!("MS token HTTP {}: {}", status, text));
    }
    serde_json::from_str(&text).map_err(|e| format!("MS token parse failed: {} (body: {})", e, text))
}

async fn refresh_ms_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<MsTokenResponse, String> {
    let body = format!(
        "client_id={}&grant_type=refresh_token&refresh_token={}&scope={}",
        urlencode(MS_CLIENT_ID),
        urlencode(refresh_token),
        urlencode(MS_SCOPES),
    );
    let res = client
        .post(MS_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("MS refresh failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("MS refresh response read failed: {}", e))?;
    if !status.is_success() {
        return Err(format!("MS refresh HTTP {}: {}", status, text));
    }
    serde_json::from_str(&text)
        .map_err(|e| format!("MS refresh parse failed: {} (body: {})", e, text))
}

#[derive(Debug, Deserialize)]
struct XblResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XblDisplayClaims,
}
#[derive(Debug, Deserialize)]
struct XblDisplayClaims {
    xui: Vec<XblXui>,
}
#[derive(Debug, Deserialize)]
struct XblXui {
    uhs: String,
}

/// Internal helper. The XBL hop accepts the MS access token as
/// `RpsTicket`, but the prefix differs between flows:
///   - modern OAuth 2.0 v2 (`consumers/oauth2/v2.0`) → `d={token}`
///   - legacy MSA (`oauth20_authorize.srf`) → raw `{token}` (no prefix)
fn rps_ticket(access_token: &str, legacy: bool) -> String {
    if legacy {
        access_token.to_string()
    } else {
        format!("d={}", access_token)
    }
}

async fn xbl_authenticate_with_flavor(
    client: &reqwest::Client,
    ms_access_token: &str,
    legacy: bool,
) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": rps_ticket(ms_access_token, legacy),
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
    });
    let res = client
        .post(XBL_AUTH_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XBL auth failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("XBL response read failed: {}", e))?;
    if !status.is_success() {
        return Err(format!("XBL HTTP {}: {}", status, text));
    }
    let parsed: XblResponse = serde_json::from_str(&text)
        .map_err(|e| format!("XBL parse failed: {} (body: {})", e, text))?;
    let user_hash = parsed
        .display_claims
        .xui
        .first()
        .map(|u| u.uhs.clone())
        .ok_or_else(|| "XBL response missing userHash".to_string())?;
    Ok((parsed.token, user_hash))
}

/// Modern flow: passes RpsTicket as `d={access_token}`.
async fn xbl_authenticate(
    client: &reqwest::Client,
    ms_access_token: &str,
) -> Result<(String, String), String> {
    xbl_authenticate_with_flavor(client, ms_access_token, false).await
}

#[derive(Debug, Deserialize)]
struct XstsResponse {
    #[serde(rename = "Token")]
    token: String,
}
#[derive(Debug, Deserialize)]
struct XstsErrorResponse {
    #[serde(rename = "XErr")]
    x_err: i64,
}

async fn xsts_authenticate(
    client: &reqwest::Client,
    xbl_token: &str,
) -> Result<String, String> {
    let body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token],
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT",
    });
    let res = client
        .post(XSTS_AUTH_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XSTS request failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("XSTS response read failed: {}", e))?;
    // 401 + XErr code is the standard "Xbox profile / age" error path.
    // Decode it into a friendly message rather than a cryptic HTTP code.
    if status == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(err) = serde_json::from_str::<XstsErrorResponse>(&text) {
            let msg = match err.x_err {
                2148916233 => {
                    "Ce compte Microsoft n'a pas de profil Xbox. Va sur https://www.xbox.com/profile pour en créer un, puis réessaye."
                }
                2148916235 => "Xbox Live n'est pas disponible dans ton pays.",
                2148916236 | 2148916237 => "Vérification d'âge requise. Connecte-toi sur https://account.xbox.com pour la compléter.",
                2148916238 => {
                    "Compte mineur sans rattachement à une famille. Un parent doit ajouter ce compte à un groupe famille via Microsoft Family."
                }
                code => return Err(format!("XSTS XErr inconnu : {}", code)),
            };
            return Err(msg.to_string());
        }
    }
    if !status.is_success() {
        return Err(format!("XSTS HTTP {}: {}", status, text));
    }
    let parsed: XstsResponse = serde_json::from_str(&text)
        .map_err(|e| format!("XSTS parse failed: {} (body: {})", e, text))?;
    Ok(parsed.token)
}

#[derive(Debug, Deserialize)]
struct McLoginResponse {
    access_token: String,
    expires_in: i64,
}

async fn mc_login_with_xbox(
    client: &reqwest::Client,
    user_hash: &str,
    xsts_token: &str,
) -> Result<(String, i64), String> {
    let body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_token),
    });
    let res = client
        .post(MC_LOGIN_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MC login failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("MC login response read failed: {}", e))?;
    if !status.is_success() {
        return Err(format!("MC login HTTP {}: {}", status, text));
    }
    let parsed: McLoginResponse = serde_json::from_str(&text)
        .map_err(|e| format!("MC login parse failed: {} (body: {})", e, text))?;
    Ok((parsed.access_token, parsed.expires_in))
}

#[derive(Debug, Deserialize)]
struct McProfile {
    id: String,
    name: String,
}

async fn fetch_mc_profile(
    client: &reqwest::Client,
    mc_access_token: &str,
) -> Result<McProfile, String> {
    let res = client
        .get(MC_PROFILE_URL)
        .bearer_auth(mc_access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("MC profile fetch failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("MC profile response read failed: {}", e))?;
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err("Ce compte ne possède pas Minecraft. Achète-le sur https://minecraft.net puis relance la connexion.".to_string());
    }
    if !status.is_success() {
        return Err(format!("MC profile HTTP {}: {}", status, text));
    }
    serde_json::from_str(&text)
        .map_err(|e| format!("MC profile parse failed: {} (body: {})", e, text))
}

async fn run_full_chain(
    client: &reqwest::Client,
    ms_access_token: String,
    ms_refresh_token: String,
) -> Result<McAccount, String> {
    let (xbl_token, user_hash) = xbl_authenticate(client, &ms_access_token).await?;
    let xsts_token = xsts_authenticate(client, &xbl_token).await?;
    let (mc_access_token, expires_in) = mc_login_with_xbox(client, &user_hash, &xsts_token).await?;
    let profile = fetch_mc_profile(client, &mc_access_token).await?;
    let now = chrono_millis_now();
    Ok(McAccount {
        uuid: profile.id,
        player_name: profile.name,
        mc_access_token,
        ms_refresh_token,
        expires_at: now + expires_in.saturating_mul(1000),
        added_at: now,
    })
}

fn chrono_millis_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ─── Tauri commands ───────────────────────────────────────────────────

/// Starts an OAuth login. Opens the user's browser to Microsoft's auth
/// page, waits for the loopback redirect with the auth code, runs the
/// full Microsoft → Xbox → XSTS → Mojang chain, and persists the
/// resulting account locally. Returns the freshly-stored account on
/// success; a friendly error string on any leg failure.
#[tauri::command]
pub async fn mc_auth_login<R: Runtime>(app: AppHandle<R>) -> Result<McAccount, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("loopback bind failed: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr failed: {}", e))?
        .port();
    // Azure registers `http://localhost` (no path) as the redirect URI
    // for this app. MS wildcards the port for loopback addresses but
    // requires an EXACT path match. So we drop the `/callback` suffix
    // and send the URL with port-only — the local HTTP listener accepts
    // any path anyway and just parses the query params for `code`/`state`.
    let redirect_uri = format!("http://localhost:{}", port);

    let code_verifier = random_b64(64);
    let code_challenge = pkce_challenge(&code_verifier);
    let state = random_b64(16);

    let auth_url = format!(
        "{base}?client_id={cid}&response_type=code&redirect_uri={ru}&response_mode=query&scope={scope}&state={state}&code_challenge={ch}&code_challenge_method=S256&prompt=select_account",
        base = MS_AUTHORIZE_URL,
        cid = urlencode(MS_CLIENT_ID),
        ru = urlencode(&redirect_uri),
        scope = urlencode(MS_SCOPES),
        state = urlencode(&state),
        ch = urlencode(&code_challenge),
    );

    // Open the system browser. We can't `webbrowser::open` reliably from
    // every Windows shell, so we fall back to the OS default via Tauri's
    // opener plugin if available; otherwise plain `Command::new`.
    if let Err(err) = open_in_browser(&auth_url) {
        return Err(format!("Impossible d'ouvrir le navigateur : {}", err));
    }

    let params = await_callback(listener).await?;

    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return Err(format!("Microsoft a refusé : {} — {}", err, desc));
    }
    if params.get("state").map(|s| s.as_str()) != Some(state.as_str()) {
        return Err("OAuth state mismatch — possible CSRF, abandon.".to_string());
    }
    let code = params
        .get("code")
        .ok_or_else(|| "Pas de code dans la réponse Microsoft.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    let ms_tokens = exchange_code_for_tokens(&client, code, &code_verifier, &redirect_uri).await?;
    let account = run_full_chain(&client, ms_tokens.access_token, ms_tokens.refresh_token).await?;
    upsert_account(&app, account.clone()).await?;
    Ok(account)
}

/// Returns the list of stored Minecraft accounts. Sensitive token fields
/// are still part of the record (for the launch path) but the frontend
/// should treat this as opaque "have I auth'd" data — the UI only needs
/// `uuid` + `playerName` + `expiresAt` for display.
#[tauri::command]
pub async fn mc_auth_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<McAccount>, String> {
    load_accounts(&app).await
}

/// Removes a stored account by UUID. Idempotent. Wipes BOTH the public
/// JSON entry AND the keyring secret entry so no session material
/// lingers after a logout.
#[tauri::command]
pub async fn mc_auth_logout<R: Runtime>(
    app: AppHandle<R>,
    uuid: String,
) -> Result<(), String> {
    let mut list = load_accounts(&app).await.unwrap_or_default();
    let before = list.len();
    list.retain(|a| a.uuid != uuid);
    let _ = keyring_delete(&uuid);
    if list.len() == before {
        return Ok(());
    }
    save_accounts(&app, &list).await
}

/// Forces a silent re-auth using the stored MS refresh token. Updates
/// the local record + returns the refreshed account. Used both to extend
/// an about-to-expire token and as a "test that my refresh still works"
/// utility from the Settings page.
#[tauri::command]
pub async fn mc_auth_refresh<R: Runtime>(
    app: AppHandle<R>,
    uuid: String,
) -> Result<McAccount, String> {
    let list = load_accounts(&app).await?;
    let existing = list
        .into_iter()
        .find(|a| a.uuid == uuid)
        .ok_or_else(|| format!("Pas de compte stocké pour UUID {}", uuid))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    let ms_tokens = refresh_ms_token(&client, &existing.ms_refresh_token).await?;
    let mut refreshed =
        run_full_chain(&client, ms_tokens.access_token, ms_tokens.refresh_token).await?;
    // Keep the original added_at — refresh shouldn't reset history.
    refreshed.added_at = existing.added_at;
    upsert_account(&app, refreshed.clone()).await?;
    Ok(refreshed)
}

// ─── Fallback flow (legacy MSA + Mojang client_id) ────────────────────

/// Step 1 of the fallback flow. Opens the user's default browser to the
/// legacy MSA authorize URL with Mojang's well-known client ID. The user
/// logs in there, then ends up on a Microsoft-hosted "you can close this
/// window" page at `https://login.live.com/oauth20_desktop.srf?code=…`.
///
/// Since that page is on Microsoft's domain (not localhost), we can't
/// intercept the redirect locally — the user has to copy the address-bar
/// URL and pass it to `mc_auth_fallback_complete` for code extraction.
///
/// Returns nothing on success; the actual chain runs in `_complete`.
#[tauri::command]
pub async fn mc_auth_fallback_start() -> Result<(), String> {
    let auth_url = format!(
        "{base}?client_id={cid}&response_type=code&redirect_uri={ru}&scope={scope}&prompt=select_account",
        base = FALLBACK_AUTHORIZE_URL,
        cid = urlencode(FALLBACK_CLIENT_ID),
        ru = urlencode(FALLBACK_REDIRECT_URI),
        scope = urlencode(FALLBACK_SCOPE),
    );
    open_in_browser(&auth_url).map_err(|e| format!("Impossible d'ouvrir le navigateur : {}", e))?;
    Ok(())
}

/// Step 2 of the fallback flow. Takes the redirect URL the user pasted
/// after logging in (e.g. `https://login.live.com/oauth20_desktop.srf?code=M.R3_BAY.XXX`),
/// extracts the auth code, exchanges it for tokens via the legacy
/// endpoint, then runs the standard XBL → XSTS → MC chain (with the
/// legacy XBL flavor). Persists the resulting account locally.
#[tauri::command]
pub async fn mc_auth_fallback_complete<R: Runtime>(
    app: AppHandle<R>,
    redirect_url: String,
) -> Result<McAccount, String> {
    let code = extract_query_param(&redirect_url, "code").ok_or_else(|| {
        "Pas de paramètre `code=` dans l'URL collée. Assure-toi d'avoir copié l'URL complète après le login Microsoft.".to_string()
    })?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;

    // Exchange code for tokens via the LEGACY token endpoint. Form
    // encoded, no PKCE verifier (legacy flow doesn't use PKCE).
    let body = format!(
        "client_id={}&grant_type=authorization_code&code={}&redirect_uri={}&scope={}",
        urlencode(FALLBACK_CLIENT_ID),
        urlencode(&code),
        urlencode(FALLBACK_REDIRECT_URI),
        urlencode(FALLBACK_SCOPE),
    );
    let res = client
        .post(FALLBACK_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Échange du code échoué : {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Lecture réponse Microsoft échouée : {}", e))?;
    if !status.is_success() {
        return Err(format!(
            "Microsoft a refusé le code (HTTP {}): {}. Le code a peut-être expiré — relance la connexion.",
            status, text
        ));
    }
    let tokens: MsTokenResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Parse réponse Microsoft échoué : {} (body: {})", e, text))?;

    // Run the standard chain, but with the LEGACY XBL flavor (no `d=`
    // prefix on RpsTicket). The XSTS / MC / profile hops are identical.
    let (xbl_token, user_hash) =
        xbl_authenticate_with_flavor(&client, &tokens.access_token, true).await?;
    let xsts_token = xsts_authenticate(&client, &xbl_token).await?;
    let (mc_access_token, expires_in) = mc_login_with_xbox(&client, &user_hash, &xsts_token).await?;
    let profile = fetch_mc_profile(&client, &mc_access_token).await?;
    let now = chrono_millis_now();
    let account = McAccount {
        uuid: profile.id,
        player_name: profile.name,
        mc_access_token,
        ms_refresh_token: tokens.refresh_token,
        expires_at: now + expires_in.saturating_mul(1000),
        added_at: now,
    };
    upsert_account(&app, account.clone()).await?;
    Ok(account)
}

/// Tiny standalone query-param parser for the fallback paste-URL step.
/// We don't need the full `url` crate just for one field extraction.
fn extract_query_param(full_url: &str, key: &str) -> Option<String> {
    let query = full_url.split_once('?').map(|(_, q)| q)?;
    // Strip a trailing fragment if present.
    let query = query.split_once('#').map(|(q, _)| q).unwrap_or(query);
    for kv in query.split('&') {
        if let Some((k, v)) = kv.split_once('=') {
            if k == key {
                return Some(urldecode(v));
            }
        }
    }
    None
}

// ─── Browser opener (cross-shell fallback) ────────────────────────────

#[cfg(target_os = "windows")]
fn open_in_browser(url: &str) -> Result<(), String> {
    use std::process::Command;
    // We can't use `cmd /C start "" {url}` here: cmd.exe parses `&` as a
    // command separator BEFORE `start` sees the URL, so the OAuth auth
    // URL (full of `&` joining its query params) gets shredded into a
    // dozen "command not found" errors. `rundll32 url.dll,FileProtocolHandler`
    // takes the URL as a single positional argument, no shell parsing,
    // and shells out to whatever the user's default browser is —
    // exactly what we want.
    Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_in_browser(url: &str) -> Result<(), String> {
    use std::process::Command;
    let bin = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    Command::new(bin)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ─── Tests ────────────────────────────────────────────────────────────
//
// Pure helpers : `short_uuid`, `urlencode`, `urldecode`,
// `extract_query_param`, `pkce_challenge`. The flow paths
// (`mc_auth_login`, `mc_auth_refresh`, fallback flows) all hit external
// HTTP services + the OS keyring, not realistically unit-testable
// without integration scaffolding — those are validated end-to-end via
// `tauri dev`.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_uuid_takes_first_8_chars() {
        assert_eq!(short_uuid("030db5be395342b7938bdf13c6d2d618"), "030db5be");
    }

    #[test]
    fn short_uuid_returns_full_when_too_short() {
        assert_eq!(short_uuid("abc"), "abc");
        assert_eq!(short_uuid(""), "");
    }

    #[test]
    fn urlencode_passes_unreserved_through() {
        // RFC 3986 unreserved set: A-Z a-z 0-9 - _ . ~
        assert_eq!(urlencode("Hello-World_1.0~"), "Hello-World_1.0~");
    }

    #[test]
    fn urlencode_percent_encodes_reserved_and_spaces() {
        assert_eq!(urlencode("a b"), "a%20b");
        assert_eq!(urlencode("a/b"), "a%2Fb");
        assert_eq!(urlencode("hello world"), "hello%20world");
    }

    #[test]
    fn urlencode_handles_utf8() {
        // Each UTF-8 byte gets percent-encoded individually.
        assert_eq!(urlencode("é"), "%C3%A9");
    }

    #[test]
    fn urldecode_inverts_urlencode_for_ascii() {
        // Round-trip preserves all input. `urlencode` percent-escapes
        // anything outside the unreserved set (so `+` becomes `%2B`,
        // not a literal `+`), and `urldecode` of `%2B` returns `+`.
        // Therefore `urldecode(urlencode(s)) == s` for any ASCII s.
        let original = "hello world / foo+bar";
        let encoded = urlencode(original);
        assert_eq!(urldecode(&encoded), original);
    }

    #[test]
    fn urldecode_treats_plus_as_space() {
        // application/x-www-form-urlencoded : + → space.
        assert_eq!(urldecode("a+b+c"), "a b c");
    }

    #[test]
    fn urldecode_handles_percent_sequences() {
        assert_eq!(urldecode("hello%20world"), "hello world");
        assert_eq!(urldecode("%C3%A9"), "é");
    }

    #[test]
    fn extract_query_param_finds_param() {
        let url = "https://example.com/cb?code=abc123&state=xyz";
        assert_eq!(
            extract_query_param(url, "code"),
            Some("abc123".to_string())
        );
        assert_eq!(
            extract_query_param(url, "state"),
            Some("xyz".to_string())
        );
    }

    #[test]
    fn extract_query_param_returns_none_when_absent() {
        let url = "https://example.com/cb?code=abc";
        assert_eq!(extract_query_param(url, "missing"), None);
    }

    #[test]
    fn extract_query_param_returns_none_when_no_query() {
        assert_eq!(extract_query_param("https://example.com/", "code"), None);
    }

    #[test]
    fn extract_query_param_strips_fragment() {
        let url = "https://example.com/cb?code=abc#fragment-here";
        assert_eq!(extract_query_param(url, "code"), Some("abc".to_string()));
    }

    #[test]
    fn extract_query_param_decodes_percent_encoded_value() {
        let url = "https://example.com/cb?msg=hello%20world";
        assert_eq!(
            extract_query_param(url, "msg"),
            Some("hello world".to_string())
        );
    }

    #[test]
    fn pkce_challenge_is_base64url_no_padding() {
        // The verifier is a fixed string here; the resulting challenge
        // is its SHA-256 hash, base64url-encoded without trailing `=`.
        // Don't hardcode the exact challenge value — assert the shape.
        let challenge = pkce_challenge("a-fixed-verifier-string-of-sufficient-length");
        // Base64URL of a 32-byte SHA-256 hash is 43 chars (no padding).
        assert_eq!(challenge.len(), 43);
        // No padding char allowed.
        assert!(!challenge.contains('='));
        // Only base64url-safe chars : A-Z a-z 0-9 - _
        assert!(challenge
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn pkce_challenge_is_deterministic_for_same_verifier() {
        let v = "verifier-xyz";
        assert_eq!(pkce_challenge(v), pkce_challenge(v));
    }

    #[test]
    fn pkce_challenge_differs_for_different_verifiers() {
        assert_ne!(pkce_challenge("a"), pkce_challenge("b"));
    }
}
