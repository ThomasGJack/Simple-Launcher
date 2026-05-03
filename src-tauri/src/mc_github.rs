// GitHub Releases integration for modpack hosting.
//
// Why this exists: Microsoft tightened OneDrive's anonymous-share API
// in 2024-2025 (it now returns 401 UnauthenticatedVroomException for
// most personal share URLs). Firebase Storage works but billing scales
// with file size + bandwidth. GitHub Releases is free, permanent,
// 2 GB per file, with unmetered public download bandwidth — basically
// the ideal CDN for modpacks shared between friends.
//
// Auth approach: **Personal Access Token** (PAT), not OAuth.
//
//   - The user generates a fine-grained PAT with `Contents: Read/Write`
//     scope on the target repo (or a classic PAT with `public_repo`).
//   - We validate the token via `GET /user`, then store it in the OS
//     keyring (Windows Credential Manager) under
//     `simple-launcher-github`. From then on, all API calls send it as
//     `Authorization: Bearer {pat}`.
//   - No OAuth app registration on the dev side, no client_secret to
//     leak. The trade-off is the user has to do a one-time copy/paste
//     from github.com/settings/tokens.
//
// What this module exposes:
//
//   - `gh_token_set(token)`  → validate + store
//   - `gh_token_status()`    → returns the GitHub username if a valid
//                              token is on disk, or None otherwise
//   - `gh_token_clear()`     → wipe the keyring entry (logout)
//   - `gh_list_repos()`      → list the user's owned repos for the picker
//   - `gh_upload_modpack(repo, tag, file_path, ..)` → end-to-end:
//                              ensures the release exists for `tag`,
//                              uploads `file_path` as an asset, returns
//                              the public download URL ready to paste
//                              into `nativeModpackUrl`.

use std::path::Path;
use std::time::Duration;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;

const KEYRING_SERVICE: &str = "simple-launcher-github";
const KEYRING_USERNAME: &str = "pat";
const GITHUB_API: &str = "https://api.github.com";

// ─── PAT storage ──────────────────────────────────────────────────────
//
// Hybrid approach: we try the OS keyring first (Windows Credential
// Manager / macOS Keychain / Linux Secret Service) for proper at-rest
// encryption. If that fails for any reason — and historically the
// keyring crate on Windows has had several flakiness modes (stale entry
// invisible to subsequent reads, antivirus blocking CredWrite, etc.) —
// we transparently fall back to a plain-text JSON file in the user's
// app data dir. The fallback is less secure than the keyring but
// dramatically more reliable, and a leaked PAT is easy to revoke
// (much easier than recovering a lost token).
//
// Every read tries keyring first, then JSON. Every write writes to
// keyring AND verifies the readback; if verification fails, we
// auto-fall-back to the JSON file. This way the rest of the codebase
// just calls `pat_set` / `pat_get` / `pat_clear` and doesn't care
// which backend is active.

use std::path::PathBuf;

fn fallback_path() -> Result<PathBuf, String> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| "data_local_dir indisponible".to_string())?;
    let dir = dir.join("Simple Launcher");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("create app data dir failed: {}", e))?;
    Ok(dir.join("github_pat.txt"))
}

fn fallback_set(token: &str) -> Result<(), String> {
    let path = fallback_path()?;
    std::fs::write(&path, token)
        .map_err(|e| format!("fallback write {} failed: {}", path.display(), e))
}

fn fallback_get() -> Result<Option<String>, String> {
    let path = fallback_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("fallback read failed: {}", e))?;
    let text = String::from_utf8_lossy(&bytes).trim().to_string();
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

fn fallback_clear() -> Result<(), String> {
    let path = fallback_path()?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("fallback remove failed: {}", e))?;
    }
    Ok(())
}

fn pat_set(token: &str) -> Result<(), String> {
    eprintln!("[mc-github] pat_set called with token len={}", token.len());

    // ALWAYS write to the fallback file first — it's the reliable
    // source of truth. Without this, observed behaviour on some Windows
    // setups: keyring's set_password() + immediate readback succeed,
    // but the next get_password() (called from a *later* command, even
    // the same process) returns NoEntry. Clearing the fallback when the
    // initial verify passed would then leave us with no token at all.
    // Solution: always keep the fallback file in sync.
    let fb_result = fallback_set(token);
    match &fb_result {
        Ok(_) => eprintln!(
            "[mc-github] pat_set: fallback file SUCCESS at {:?}",
            fallback_path()
        ),
        Err(e) => eprintln!("[mc-github] pat_set: fallback file FAILED: {}", e),
    }

    // ALSO try the keyring as a "best-effort" upgrade — if it works,
    // the at-rest encryption is nicer. We don't error out if it fails;
    // we already have the fallback file in place.
    let keyring_result: Result<(), String> = (|| {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USERNAME)
            .map_err(|e| format!("keyring entry create failed: {}", e))?;
        entry
            .set_password(token)
            .map_err(|e| format!("keyring set failed: {}", e))?;
        match entry.get_password() {
            Ok(stored) if stored == token => Ok(()),
            Ok(_) => Err("keyring write OK mais readback différent".into()),
            Err(e) => Err(format!("keyring write OK mais readback NoEntry/erreur : {}", e)),
        }
    })();
    match keyring_result {
        Ok(()) => eprintln!("[mc-github] pat_set: keyring SUCCESS (write+verify, but file fallback also kept)"),
        Err(keyring_err) => eprintln!(
            "[mc-github] pat_set: keyring write/verify FAILED ({}). Token stored in fallback file only.",
            keyring_err
        ),
    }

    // Surface the fallback's error (if any) so the user is told if even
    // the file write didn't go through (e.g., disk full, AV blocking).
    fb_result
}

fn pat_get() -> Result<Option<String>, String> {
    // The fallback file is the source of truth (cf. `pat_set`). Read
    // it first and short-circuit on hit. The keyring is consulted only
    // as a last-ditch rescue path for legacy installs that wrote to
    // the keyring before the fallback file existed — same priority
    // we use for `mc_auth` accounts.
    match fallback_get() {
        Ok(Some(token)) => {
            eprintln!("[mc-github] pat_get: file HIT (len={})", token.len());
            return Ok(Some(token));
        }
        Ok(None) => eprintln!("[mc-github] pat_get: file empty, trying keyring as rescue"),
        Err(e) => eprintln!("[mc-github] pat_get: file ERROR ({}), trying keyring as rescue", e),
    }
    // Rescue path — also "rehydrate" the file so the next read goes
    // through the fast path.
    let entry = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USERNAME) {
        Ok(e) => e,
        Err(err) => {
            eprintln!("[mc-github] pat_get: keyring entry create failed: {}", err);
            return Ok(None);
        }
    };
    match entry.get_password() {
        Ok(token) => {
            eprintln!(
                "[mc-github] pat_get: keyring rescue HIT (len={}), rehydrating fallback file",
                token.len()
            );
            let _ = fallback_set(&token);
            Ok(Some(token))
        }
        Err(keyring::Error::NoEntry) => {
            eprintln!("[mc-github] pat_get: keyring rescue MISS — no token anywhere");
            Ok(None)
        }
        Err(e) => {
            eprintln!("[mc-github] pat_get: keyring rescue ERROR ({})", e);
            Ok(None)
        }
    }
}

fn pat_clear() -> Result<(), String> {
    // Try to clear both stores so a "logout" never leaves orphan creds.
    let keyring_result = (|| -> Result<(), String> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USERNAME)
            .map_err(|e| format!("keyring entry create failed: {}", e))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keyring delete failed: {}", e)),
        }
    })();
    let fallback_result = fallback_clear();
    // Surface the worst error if any; otherwise success.
    keyring_result?;
    fallback_result?;
    Ok(())
}

// ─── HTTP helpers ────────────────────────────────────────────────────

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("SimpleLauncher (mc-github)")
        .build()
        .map_err(|e| format!("HTTP client build failed: {}", e))
}

fn auth_headers(pat: &str) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION};
    let mut h = HeaderMap::new();
    h.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", pat)).unwrap_or_else(|_| HeaderValue::from_static("")),
    );
    h.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
    h.insert(
        "X-GitHub-Api-Version",
        HeaderValue::from_static("2022-11-28"),
    );
    h
}

// ─── Public API ──────────────────────────────────────────────────────

// `rename_all(serialize = "camelCase")` ONLY renames fields when we
// serialize them out to the frontend (which expects camelCase). On the
// deserialize path (parsing GitHub's API response) we keep the default
// behaviour, which means the Rust field names — which are snake_case —
// match GitHub's snake_case JSON keys (`full_name`, `avatar_url`,
// `html_url`, etc.) verbatim.
//
// The previous full `rename_all = "camelCase"` was wrong for the
// deserialize side: it made serde look for `fullName` / `avatarUrl` in
// GitHub's body, those keys never existed, the parse failed, and the
// frontend silently received an empty list (because the JS catch
// swallowed it). Symptom: "I just created a repo and Refresh doesn't
// show it."
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct GithubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub html_url: String,
    pub description: Option<String>,
    /// True if the authenticated user has push access — only those
    /// repos can host releases via the API.
    pub permissions: Option<RepoPermissions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoPermissions {
    #[serde(default)]
    pub push: bool,
    #[serde(default)]
    pub admin: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    /// Numeric release ID returned by GitHub. We don't currently use
    /// it (the asset upload uses `upload_url` directly), but it's
    /// captured for future "delete previous asset before re-upload"
    /// support which needs the release ID for `DELETE /releases/{id}`.
    #[allow(dead_code)]
    id: u64,
    upload_url: String,
    #[allow(dead_code)]
    html_url: String,
    #[allow(dead_code)]
    tag_name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    #[allow(dead_code)]
    id: u64,
    #[allow(dead_code)]
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    /// Public DL URL — paste this into `nativeModpackUrl`.
    pub download_url: String,
    /// Human-readable release name + tag (for the success toast).
    pub release_name: String,
    pub release_tag: String,
    pub asset_size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub phase: String, // "ensuring-release" | "uploading" | "done"
    pub bytes_uploaded: u64,
    pub bytes_total: u64,
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, p: UploadProgress) {
    let _ = app.emit("gh-upload-progress", p);
}

/// Validates a PAT by calling `GET /user`. Returns the user info on
/// success; otherwise an actionable error message. Useful as a "test
/// my token" action and as a precondition for upload.
async fn fetch_authenticated_user(pat: &str) -> Result<GithubUser, String> {
    let client = http_client()?;
    let res = client
        .get(format!("{}/user", GITHUB_API))
        .headers(auth_headers(pat))
        .send()
        .await
        .map_err(|e| format!("GitHub /user GET failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("GitHub /user body failed: {}", e))?;
    if !status.is_success() {
        return Err(format!(
            "Token invalide (HTTP {}). Régénère-en un sur https://github.com/settings/tokens.\n\nRéponse GitHub : {}",
            status,
            text.chars().take(300).collect::<String>()
        ));
    }
    serde_json::from_str(&text).map_err(|e| format!("GitHub /user parse failed: {}", e))
}

// ─── Tauri commands ──────────────────────────────────────────────────

/// Stores a freshly-validated PAT into the OS keyring. Calls
/// `GET /user` first to ensure the token works — saves the user a
/// frustrating "token saved but everything fails later" experience.
#[tauri::command]
pub async fn gh_token_set(token: String) -> Result<GithubUser, String> {
    let trimmed = token.trim().to_string();
    if trimmed.is_empty() {
        return Err("Token vide.".into());
    }
    let user = fetch_authenticated_user(&trimmed).await?;
    pat_set(&trimmed)?;
    Ok(user)
}

/// Returns the GitHub username if a token is on disk AND still valid,
/// `None` otherwise. The frontend uses this on mount to decide whether
/// to show the "Configurer GitHub" button or the "Connecté en tant
/// que X" status.
#[tauri::command]
pub async fn gh_token_status() -> Result<Option<GithubUser>, String> {
    let pat = match pat_get()? {
        Some(p) => p,
        None => return Ok(None),
    };
    match fetch_authenticated_user(&pat).await {
        Ok(user) => Ok(Some(user)),
        Err(_) => Ok(None), // Token expired/revoked — surface as "not connected"
    }
}

/// Wipes the stored PAT. Idempotent.
#[tauri::command]
pub async fn gh_token_clear() -> Result<(), String> {
    pat_clear()
}

/// Lists every repo the authenticated user has push access to. Used
/// by the admin form's repo picker. Sorted newest-first by GitHub's
/// default. Limited to the first 100 owned repos (good enough for the
/// vast majority of users).
///
/// We deliberately keep the filter loose: we KEEP a repo if either
///
///   - `permissions.push` is `true`, **or**
///   - the `permissions` field is missing entirely (some PAT types
///     don't include it, but a repo returned under `affiliation=owner`
///     is by definition owned by the authenticated user, who always
///     has push)
///
/// This avoids the silent "I just created a repo and it doesn't show
/// up" footgun that the strict filter caused before.
#[tauri::command]
pub async fn gh_list_repos() -> Result<Vec<GithubRepo>, String> {
    let pat = pat_get()?.ok_or_else(|| {
        "Token GitHub introuvable. Re-configure-le via le bouton « Configurer GitHub »."
            .to_string()
    })?;
    let client = http_client()?;
    // Pass `affiliation=owner` so the user's own repos are guaranteed
    // to come back. Adding `collaborator` and `organization_member`
    // widens the result set so shared repos also appear.
    let url = format!(
        "{}/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100",
        GITHUB_API
    );
    eprintln!("[mc-github] gh_list_repos: GET {}", url);
    let res = client
        .get(&url)
        .headers(auth_headers(&pat))
        .send()
        .await
        .map_err(|e| format!("GitHub /user/repos GET failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("GitHub /user/repos body failed: {}", e))?;
    if !status.is_success() {
        eprintln!(
            "[mc-github] gh_list_repos: HTTP {} body: {}",
            status,
            text.chars().take(400).collect::<String>()
        );
        return Err(format!(
            "GitHub repos HTTP {}: {}",
            status,
            text.chars().take(400).collect::<String>()
        ));
    }
    let repos: Vec<GithubRepo> = serde_json::from_str(&text)
        .map_err(|e| format!("GitHub repos parse failed: {}", e))?;
    let total_returned = repos.len();
    let kept: Vec<GithubRepo> = repos
        .into_iter()
        .filter(|r| {
            // Keep if permissions.push=true OR if no permissions field
            // at all (= owner repo, push implied).
            match r.permissions.as_ref() {
                Some(p) => p.push,
                None => true,
            }
        })
        .collect();
    eprintln!(
        "[mc-github] gh_list_repos: API returned {} repos, kept {} after push-filter",
        total_returned,
        kept.len()
    );
    if total_returned > 0 && kept.is_empty() {
        eprintln!(
            "[mc-github] gh_list_repos: NOTE — all repos filtered out by push check. \
             This usually means the PAT is fine-grained without write access. \
             Consider regenerating a classic PAT with `public_repo` scope."
        );
    }
    Ok(kept)
}

/// End-to-end upload: ensures a release tagged `tag` exists on
/// `repo` (creating it if not), then uploads `file_path` as an asset.
/// Returns the asset's public `browser_download_url` ready to paste
/// into `nativeModpackUrl`.
///
/// Emits `gh-upload-progress` events so the UI can show a progress
/// bar (the asset upload is the long pole, especially for ≥ 100 MB
/// modpacks on slow connections).
#[tauri::command]
pub async fn gh_upload_modpack<R: Runtime>(
    app: AppHandle<R>,
    repo_full_name: String,
    tag: String,
    release_name: Option<String>,
    file_path: String,
) -> Result<UploadResult, String> {
    let pat = pat_get()?.ok_or_else(|| {
        "Token GitHub introuvable côté backend (keyring vide + fichier fallback absent). \
         Re-clique « Configurer GitHub » et recolle ton PAT — le validateur va automatiquement \
         basculer sur le fichier fallback si le coffre-fort Windows refuse de stocker."
            .to_string()
    })?;
    let client = http_client()?;

    // Step 1: ensure a release exists for this tag. GitHub's
    // `POST /repos/{repo}/releases` returns 422 if a release for the
    // tag already exists — in that case we look it up via
    // `GET /repos/{repo}/releases/tags/{tag}` and reuse it. This makes
    // re-uploading a new version of an existing modpack idempotent.
    emit_progress(
        &app,
        UploadProgress {
            phase: "ensuring-release".into(),
            bytes_uploaded: 0,
            bytes_total: 0,
        },
    );
    let resolved_release_name = release_name
        .as_deref()
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| tag.clone());
    let release = ensure_release(&client, &pat, &repo_full_name, &tag, &resolved_release_name).await?;

    // Step 2: upload the asset. The release's `upload_url` template
    // looks like `https://uploads.github.com/repos/.../releases/{id}/assets{?name,label}`
    // — strip the `{?…}` placeholder + query-encode the filename.
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Fichier introuvable : {}", path.display()));
    }
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| "Chemin de fichier sans nom".to_string())?;
    let bytes = fs::read(path)
        .await
        .map_err(|e| format!("Lecture du fichier échouée : {}", e))?;
    let asset_size = bytes.len() as u64;

    emit_progress(
        &app,
        UploadProgress {
            phase: "uploading".into(),
            bytes_uploaded: 0,
            bytes_total: asset_size,
        },
    );

    let upload_base = release
        .upload_url
        .split('{')
        .next()
        .unwrap_or(&release.upload_url)
        .to_string();
    let upload_url = format!("{}?name={}", upload_base, urlencode(&filename));

    let res = client
        .post(&upload_url)
        .headers(auth_headers(&pat))
        .header(reqwest::header::CONTENT_TYPE, "application/zip")
        .header(reqwest::header::CONTENT_LENGTH, asset_size)
        .timeout(Duration::from_secs(60 * 30)) // 30 min cap for big modpacks on slow links
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("Upload GitHub échoué : {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Lecture réponse upload : {}", e))?;
    if !status.is_success() {
        // 422 = a file with that name already exists for this release
        // (GitHub doesn't allow overwriting). The user has to bump the
        // tag or delete the asset first. Surface that clearly.
        if status == reqwest::StatusCode::UNPROCESSABLE_ENTITY {
            return Err(format!(
                "Un asset nommé « {} » existe déjà dans cette release.\nSupprime-le sur GitHub OU change le tag (ex. {}-v2) puis réessaye.",
                filename, tag
            ));
        }
        return Err(format!(
            "Upload GitHub HTTP {} : {}",
            status,
            text.chars().take(400).collect::<String>()
        ));
    }
    let asset: GithubAsset = serde_json::from_str(&text)
        .map_err(|e| format!("Parse asset response failed: {}\n\nbody: {}", e, text))?;

    emit_progress(
        &app,
        UploadProgress {
            phase: "done".into(),
            bytes_uploaded: asset_size,
            bytes_total: asset_size,
        },
    );

    Ok(UploadResult {
        download_url: asset.browser_download_url,
        release_name: resolved_release_name,
        release_tag: tag,
        asset_size,
    })
}

/// Idempotently fetches or creates a GitHub release for `tag`.
///
/// If the repo is brand-new and empty (no commits at all), GitHub's
/// release creation fails with HTTP 422 `"Repository is empty"`. In
/// that case we transparently bootstrap the repo by pushing a tiny
/// README via the Contents API — this creates the initial commit on
/// the default branch — and then retry the release creation. From the
/// admin's POV the empty-repo case Just Works.
async fn ensure_release(
    client: &reqwest::Client,
    pat: &str,
    repo_full_name: &str,
    tag: &str,
    name: &str,
) -> Result<GithubRelease, String> {
    // Try to fetch an existing release first.
    let lookup = client
        .get(format!(
            "{}/repos/{}/releases/tags/{}",
            GITHUB_API, repo_full_name, tag
        ))
        .headers(auth_headers(pat))
        .send()
        .await
        .map_err(|e| format!("GitHub release lookup failed: {}", e))?;
    if lookup.status().is_success() {
        return lookup
            .json()
            .await
            .map_err(|e| format!("Parse existing release failed: {}", e));
    }
    if lookup.status() != reqwest::StatusCode::NOT_FOUND {
        let body = lookup.text().await.unwrap_or_default();
        return Err(format!(
            "Lookup release HTTP {} : {}",
            "?",
            body.chars().take(300).collect::<String>()
        ));
    }
    // Doesn't exist yet — create it.
    let body = serde_json::json!({
        "tag_name": tag,
        "name": name,
        "draft": false,
        "prerelease": false,
        "generate_release_notes": false,
    });
    let res = client
        .post(format!("{}/repos/{}/releases", GITHUB_API, repo_full_name))
        .headers(auth_headers(pat))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Create release failed: {}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Create release body failed: {}", e))?;
    if status.is_success() {
        return serde_json::from_str(&text)
            .map_err(|e| format!("Parse new release failed: {}", e));
    }
    // 422 + "Repository is empty" → push a README to create the first
    // commit, then retry. Handles the freshly-created-repo case where
    // the user clicked "Create" on github.com/new without ticking
    // "Initialize this repository with a README".
    if status == reqwest::StatusCode::UNPROCESSABLE_ENTITY && text.contains("Repository is empty") {
        eprintln!(
            "[mc-github] ensure_release: repo {} is empty — bootstrapping with README.md",
            repo_full_name
        );
        bootstrap_empty_repo(client, pat, repo_full_name).await?;
        // Retry creating the release. After the bootstrap commit there
        // is a default branch + HEAD, so the same payload should work.
        let retry = client
            .post(format!("{}/repos/{}/releases", GITHUB_API, repo_full_name))
            .headers(auth_headers(pat))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Retry create release failed: {}", e))?;
        let retry_status = retry.status();
        let retry_text = retry
            .text()
            .await
            .map_err(|e| format!("Retry create release body failed: {}", e))?;
        if !retry_status.is_success() {
            return Err(format!(
                "Création release HTTP {} après auto-init du repo : {}",
                retry_status,
                retry_text.chars().take(400).collect::<String>()
            ));
        }
        return serde_json::from_str(&retry_text)
            .map_err(|e| format!("Parse retry release failed: {}", e));
    }
    Err(format!(
        "Création release HTTP {} : {}",
        status,
        text.chars().take(400).collect::<String>()
    ))
}

/// Pushes a minimal README.md to a freshly-created empty repo so it
/// has a first commit + a default branch, which is a precondition for
/// every release-creation API call. Uses GitHub's Contents API
/// (`PUT /repos/{repo}/contents/README.md`) — no Git plumbing
/// required.
async fn bootstrap_empty_repo(
    client: &reqwest::Client,
    pat: &str,
    repo_full_name: &str,
) -> Result<(), String> {
    let readme_short_name = repo_full_name.split('/').nth(1).unwrap_or(repo_full_name);
    let readme = format!(
        "# {}\n\nModpacks hébergés pour [Simple Launcher](https://github.com/).\n\nCe repo a été initialisé automatiquement par Simple Launcher.\n",
        readme_short_name
    );
    let encoded = base64::engine::general_purpose::STANDARD.encode(readme.as_bytes());
    let body = serde_json::json!({
        "message": "Initial commit (auto-created by Simple Launcher)",
        "content": encoded,
    });
    let res = client
        .put(format!(
            "{}/repos/{}/contents/README.md",
            GITHUB_API, repo_full_name
        ))
        .headers(auth_headers(pat))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Bootstrap empty repo failed: {}", e))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!(
            "Auto-init repo (README.md) HTTP {} : {}.\n\n\
             Astuce : ouvre le repo sur github.com et clique « Add a README » manuellement, \
             puis réessaye l'upload.",
            status,
            text.chars().take(300).collect::<String>()
        ));
    }
    eprintln!(
        "[mc-github] bootstrap_empty_repo: README.md pushed successfully to {}",
        repo_full_name
    );
    Ok(())
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
