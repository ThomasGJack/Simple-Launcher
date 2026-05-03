// "Bring-your-own-zip" modpack installer.
//
// Two ZIP shapes are accepted, auto-detected at extract time:
//
//   1. **CurseForge fat-zip** — the format CurseForge produces when
//      the admin downloads a modpack export with the mods bundled in.
//      Layout:
//          manifest.json
//          overrides/
//              mods/*.jar
//              config/…
//              resourcepacks/…
//      We strip the `overrides/` prefix so the contents land at the
//      root of `.minecraft/`, and we ignore `manifest.json` itself
//      (it's only useful at upload time for auto-filling MC version /
//      loader info; the launcher reads it via `read_manifest_url`).
//
//   2. **Flat / hand-crafted zip** — already shaped like a `.minecraft/`
//      folder, with `mods/`, `config/`, `resourcepacks/`, etc. at the
//      root (or wrapped in a single named folder we strip). Used by
//      hand-built packs.
//
// What this module does NOT do:
//   - Resolve mod project IDs via the CurseForge API (we don't have a
//     key and the user explicitly wanted to skip per-mod download).
//   - Handle Modrinth `.mrpack` (that's `mc_modrinth.rs`'s job).
//
// MC version + loader + loader version are configured by the admin —
// when they upload a CF zip, we surface the parsed manifest values via
// `mc_zip_read_manifest_url` so the form auto-populates.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::mc_vanilla::{http_client, mc_root, InstallProgress};

fn emit<R: Runtime>(app: &AppHandle<R>, p: &InstallProgress) {
    let _ = app.emit("mc-vanilla-progress", p);
}

/// Transforms common file-host "share" URLs into URLs that return the
/// raw bytes when fetched anonymously by `reqwest`. Returns the URL
/// unchanged if it's already a direct download or the provider isn't
/// recognised.
///
/// Why this exists: most cloud providers' "share" URLs route the
/// browser through a viewer page that needs a session cookie; an
/// HTTP client gets back HTML, not the file. Each provider has a
/// separate "direct content" endpoint we can hit anonymously.
///
/// Supported providers:
///
/// | Pattern                                  | Becomes                                                   |
/// | ---------------------------------------- | --------------------------------------------------------- |
/// | `https://pixeldrain.com/u/{id}`          | `https://pixeldrain.com/api/file/{id}`                     |
/// | `https://drive.google.com/file/d/{id}/...` | `https://drive.google.com/uc?export=download&id={id}`    |
/// | `https://drive.google.com/open?id={id}`  | `https://drive.google.com/uc?export=download&id={id}`     |
/// | `https://github.com/.../releases/download/...` | Already direct, pass through                        |
/// | `https://files.catbox.moe/...`           | Already direct, pass through                              |
/// | Anything else                            | Pass through verbatim                                     |
///
/// OneDrive used to be supported but Microsoft locked the anonymous
/// `api.onedrive.com/v1.0/shares` endpoint in 2024-2025, returning
/// `401 UnauthenticatedVroomException` for any modern share URL.
/// We removed the rewrite path entirely — admins should host modpacks
/// on GitHub Releases / Pixeldrain / Firebase Storage instead.
pub fn normalize_share_url(input: &str) -> String {
    let url = input.trim();

    // Pixeldrain share → API direct content.
    if let Some(rest) = url.strip_prefix("https://pixeldrain.com/u/") {
        let id = rest.split(['?', '#', '/']).next().unwrap_or(rest);
        return format!("https://pixeldrain.com/api/file/{}", id);
    }

    // Google Drive — convert viewer URL to `uc?export=download` form.
    if url.starts_with("https://drive.google.com/file/d/") {
        if let Some(after) = url.strip_prefix("https://drive.google.com/file/d/") {
            let id = after.split('/').next().unwrap_or(after);
            return format!("https://drive.google.com/uc?export=download&id={}", id);
        }
    }
    if let Some(query) = url.strip_prefix("https://drive.google.com/open?") {
        for kv in query.split('&') {
            if let Some(id) = kv.strip_prefix("id=") {
                return format!("https://drive.google.com/uc?export=download&id={}", id);
            }
        }
    }

    // Default: pass through.
    url.to_string()
}

/// Async wrapper around `normalize_share_url` kept for API stability —
/// callers can `.await` it whether or not we end up needing a network
/// hop. We no longer perform any redirect-follow magic (that was the
/// OneDrive accommodation, since removed) so this just delegates to
/// the sync transform.
pub async fn resolve_share_url_for_dl(url: &str) -> String {
    normalize_share_url(url)
}

/// Top-level install: download the ZIP, extract everything into the
/// instance's `.minecraft/`, drop the temp file. Files inside the ZIP
/// are paths relative to `.minecraft/` — typically `mods/foo.jar`,
/// `config/something.toml`, `resourcepacks/pack.zip`, etc.
///
/// If a top-level folder wraps everything (e.g. CF zips that contain
/// `Pack Name 1.2/mods/...`), we strip it during extraction so the
/// final layout is what MC expects (`.minecraft/mods/...`).
pub async fn install_zip_pack<R: Runtime>(
    app: &AppHandle<R>,
    zip_url: &str,
    instance_id: &str,
) -> Result<(), String> {
    emit(
        app,
        &InstallProgress {
            mc_version: "?".into(),
            phase: "zip-dl".into(),
            current: 0,
            total: 1,
            message: "Téléchargement du ZIP modpack…".into(),
        },
    );

    let scratch = mc_root(app)?
        .join("scratch")
        .join(format!("zip-pack-{}", millis_now()));
    fs::create_dir_all(&scratch)
        .await
        .map_err(|e| format!("mkdir scratch failed: {}", e))?;

    // 1. Download the zip ────────────────────────────────────────────
    //
    // Stream chunk-by-chunk and emit a progress event every ~150 ms so
    // the UI can render a real progress bar instead of the "stuck at
    // 0 %" we used to get with `res.bytes().await` (which reads the
    // whole body before yielding control). For a 500 MB modpack on a
    // ~50 Mbps line, that's 80 s of dead air without this loop.
    let zip_path = scratch.join("pack.zip");
    let effective_url = resolve_share_url_for_dl(zip_url).await;
    let client = http_client()?;
    let res = client
        .get(&effective_url)
        .timeout(Duration::from_secs(60 * 60)) // 1 h cap for big modpacks on slow links
        .send()
        .await
        .map_err(|e| format!("DL ZIP failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("ZIP HTTP {} ({})", res.status(), effective_url));
    }
    let total_bytes = res.content_length().unwrap_or(0);
    let mut f = fs::File::create(&zip_path)
        .await
        .map_err(|e| format!("create zip temp failed: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("DL chunk failed: {}", e))?;
        f.write_all(&chunk)
            .await
            .map_err(|e| format!("write zip temp failed: {}", e))?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            emit(
                app,
                &InstallProgress {
                    mc_version: "?".into(),
                    phase: "zip-dl".into(),
                    current: downloaded,
                    // Fall back to a "moving target" total when the
                    // server didn't send Content-Length, otherwise the
                    // UI's pct = current/total math divides by zero.
                    total: if total_bytes > 0 {
                        total_bytes
                    } else {
                        downloaded
                    },
                    message: format_dl_message(downloaded, total_bytes),
                },
            );
            last_emit = Instant::now();
        }
    }
    f.flush().await.ok();
    drop(f);
    // Final tick at 100 % so the bar lands cleanly before phase swap.
    emit(
        app,
        &InstallProgress {
            mc_version: "?".into(),
            phase: "zip-dl".into(),
            current: downloaded,
            total: if total_bytes > 0 {
                total_bytes
            } else {
                downloaded.max(1)
            },
            message: format_dl_message(downloaded, total_bytes),
        },
    );

    // 2. Extract with file-level progress ────────────────────────────
    //
    // The `zip` crate is synchronous, so the actual extraction runs
    // inside `spawn_blocking`. We feed progress (current_index,
    // total_files) back into async land via an mpsc channel and a
    // sibling task forwards each tick to the renderer. Throttled to
    // 150 ms inside the blocking task so the channel doesn't get
    // flooded for thousand-file packs.
    let game_dir = mc_root(app)?
        .join("instances")
        .join(instance_id)
        .join(".minecraft");
    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("mkdir game_dir failed: {}", e))?;

    emit(
        app,
        &InstallProgress {
            mc_version: "?".into(),
            phase: "zip-extract".into(),
            current: 0,
            total: 1,
            message: "Extraction du contenu du ZIP…".into(),
        },
    );

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(u64, u64)>();
    let app_for_progress = app.clone();
    let progress_task = tokio::spawn(async move {
        while let Some((current, total)) = rx.recv().await {
            let _ = app_for_progress.emit(
                "mc-vanilla-progress",
                InstallProgress {
                    mc_version: "?".into(),
                    phase: "zip-extract".into(),
                    current,
                    total: total.max(1),
                    message: format!("Extraction… ({} / {} fichiers)", current, total),
                },
            );
        }
    });

    let zip_path_clone = zip_path.clone();
    let game_dir_clone = game_dir.clone();
    let extract_result = tokio::task::spawn_blocking(move || {
        extract_pack_zip(&zip_path_clone, &game_dir_clone, tx)
    })
    .await
    .map_err(|e| format!("zip extract join failed: {}", e))?;
    // The Sender is dropped when the closure returns → the progress
    // task's `rx.recv()` returns None → the task exits cleanly.
    let _ = progress_task.await;
    let count = extract_result?;

    // 3. Cleanup ─────────────────────────────────────────────────────
    let _ = fs::remove_dir_all(&scratch).await;

    emit(
        app,
        &InstallProgress {
            mc_version: "?".into(),
            phase: "done".into(),
            current: 1,
            total: 1,
            message: format!("ZIP modpack extrait : {} fichiers.", count),
        },
    );
    Ok(())
}

/// Pretty download status with the right unit. Hides the total when the
/// server omitted Content-Length so we don't confuse the user with a
/// "0 Mo" denominator.
fn format_dl_message(downloaded: u64, total: u64) -> String {
    let dl_mb = downloaded as f64 / 1_048_576.0;
    if total > 0 {
        let total_mb = total as f64 / 1_048_576.0;
        let pct = (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0);
        format!(
            "Téléchargement du ZIP… {:.1} / {:.1} Mo ({:.0} %)",
            dl_mb, total_mb, pct
        )
    } else {
        format!("Téléchargement du ZIP… {:.1} Mo", dl_mb)
    }
}

/// Extracts a modpack ZIP into `dest` (`.minecraft/`). Auto-detects
/// the format:
///   - If the zip has `manifest.json` at the top + an `overrides/`
///     folder, treats it as a CurseForge fat-zip: strip `overrides/`
///     so its contents go straight into `.minecraft/`, and ignore
///     `manifest.json` itself.
///   - If every entry shares a single named top-level folder
///     (e.g. `MyPack 1.2.3/`), strip it so contents land flat.
///   - Otherwise extracts as-is.
/// Skips path components that try to escape the destination via `..`.
///
/// Pushes `(extracted_files_so_far, total_file_entries)` ticks into
/// `progress` every ~150 ms so the async caller can render a real
/// progress bar. When `progress` is dropped on return, the listener
/// task on the other end exits cleanly.
fn extract_pack_zip(
    zip_path: &Path,
    dest: &Path,
    progress: tokio::sync::mpsc::UnboundedSender<(u64, u64)>,
) -> Result<usize, String> {
    use std::fs::File;
    use std::io::BufReader;
    let file = File::open(zip_path).map_err(|e| format!("open zip failed: {}", e))?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("read zip failed: {}", e))?;

    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .filter(|n| !n.is_empty())
        .collect();
    // Total file entries (excluding directories) for the progress
    // denominator. Used purely for the UI; correctness doesn't depend
    // on it.
    let total_files: u64 = (0..archive.len())
        .filter(|i| {
            archive
                .by_index(*i)
                .ok()
                .map(|f| !f.is_dir())
                .unwrap_or(false)
        })
        .count() as u64;

    // Detect a single shared top-level wrapper folder (e.g. CF zips
    // sometimes get re-zipped with `MyPack 1.2/` around everything).
    let first_segment = names
        .first()
        .and_then(|n| n.split('/').next())
        .unwrap_or("");
    let wrapper_prefix: Option<String> = if !first_segment.is_empty()
        && first_segment != "manifest.json"
        && first_segment != "overrides"
        && names.iter().all(|n| {
            n == first_segment
                || n == &format!("{}/", first_segment)
                || n.starts_with(&format!("{}/", first_segment))
        }) {
        Some(format!("{}/", first_segment))
    } else {
        None
    };

    // Detect CurseForge fat-zip layout: presence of `manifest.json` +
    // an `overrides/` folder at the top (potentially nested under
    // `wrapper_prefix`).
    let probe = |suffix: &str| {
        let needle = match &wrapper_prefix {
            Some(p) => format!("{}{}", p, suffix),
            None => suffix.to_string(),
        };
        names.iter().any(|n| n == &needle || n.starts_with(&needle))
    };
    let is_curseforge = probe("manifest.json") && probe("overrides/");

    let mut extracted: usize = 0;
    let mut last_tick = Instant::now();
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {}: {}", i, e))?;
        let raw_name = entry.name().to_string();
        // Strip wrapper folder if present.
        let after_wrapper = match &wrapper_prefix {
            Some(p) if raw_name.starts_with(p) => &raw_name[p.len()..],
            Some(p) if raw_name.trim_end_matches('/') == p.trim_end_matches('/') => continue,
            _ => raw_name.as_str(),
        };
        if after_wrapper.is_empty() {
            continue;
        }
        // CurseForge: ignore the manifest, strip `overrides/` prefix.
        let final_rel = if is_curseforge {
            if after_wrapper == "manifest.json" {
                continue; // manifest is metadata, not for the .minecraft/
            }
            if after_wrapper == "overrides/" {
                continue;
            }
            if let Some(rest) = after_wrapper.strip_prefix("overrides/") {
                rest
            } else {
                // Stray top-level files in a CF zip (modlist.html, README.txt…)
                // — skip, they don't belong in `.minecraft/`.
                continue;
            }
        } else {
            after_wrapper
        };
        if final_rel.is_empty() {
            continue;
        }
        let safe_rel = sanitize_pack_path(final_rel);
        let out_path = dest.join(&safe_rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("mkdir failed: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir parent failed: {}", e))?;
            }
            let mut out_file = File::create(&out_path)
                .map_err(|e| format!("create {} failed: {}", out_path.display(), e))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("copy {} failed: {}", out_path.display(), e))?;
            extracted += 1;
            // Throttle to ~150 ms — sending on every entry would flood
            // the channel and the Tauri event bus for thousand-file
            // packs. send() returning Err just means the receiver hung
            // up; we keep extracting either way (best-effort progress).
            if last_tick.elapsed() >= Duration::from_millis(150) {
                let _ = progress.send((extracted as u64, total_files));
                last_tick = Instant::now();
            }
        }
    }
    // Final tick so the bar lands at 100 % before we close the channel.
    let _ = progress.send((extracted as u64, total_files));
    Ok(extracted)
}

fn sanitize_pack_path(raw: &str) -> PathBuf {
    let cleaned = raw.replace('\\', "/");
    let parts: Vec<&str> = cleaned
        .split('/')
        .filter(|p| !p.is_empty() && *p != "..")
        .collect();
    let mut out = PathBuf::new();
    for p in parts {
        out.push(p);
    }
    out
}

fn millis_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ─── CurseForge manifest parsing ──────────────────────────────────────

/// Parsed view of a CurseForge `manifest.json` — only the fields we
/// care about for auto-filling the admin form. Fields that aren't
/// present in the source JSON come back as `None` so the frontend can
/// keep the user's manual input.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurseforgeManifestSummary {
    pub mc_version: Option<String>,
    pub loader: Option<String>, // "fabric" | "forge" | "neoforge" | "quilt"
    pub loader_version: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    /// Number of `files[]` entries — purely informational ("X mods listés").
    pub file_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
struct RawCfManifest {
    minecraft: Option<RawCfMinecraft>,
    name: Option<String>,
    version: Option<String>,
    author: Option<String>,
    #[serde(default)]
    files: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawCfMinecraft {
    version: Option<String>,
    #[serde(default)]
    #[serde(rename = "modLoaders")]
    mod_loaders: Vec<RawCfLoader>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawCfLoader {
    id: Option<String>,
    #[serde(default)]
    primary: bool,
}

/// Splits a CurseForge loader id like `"fabric-0.15.7"`,
/// `"neoforge-21.5.34-beta"`, `"forge-47.2.0"` into `(loader, version)`.
/// Tolerant: unknown prefixes yield `(prefix, rest)` so the frontend
/// can still display whatever's there.
fn split_loader_id(id: &str) -> (String, String) {
    if let Some((kind, version)) = id.split_once('-') {
        (kind.to_string(), version.to_string())
    } else {
        (id.to_string(), String::new())
    }
}

/// Parses the `manifest.json` bytes from a CurseForge fat-zip into the
/// summary the frontend uses to auto-fill the admin form.
fn parse_cf_manifest_bytes(bytes: &[u8]) -> Result<CurseforgeManifestSummary, String> {
    let raw: RawCfManifest = serde_json::from_slice(bytes)
        .map_err(|e| format!("manifest.json invalide : {}", e))?;
    let primary = raw
        .minecraft
        .as_ref()
        .and_then(|m| m.mod_loaders.iter().find(|l| l.primary))
        .or_else(|| raw.minecraft.as_ref().and_then(|m| m.mod_loaders.first()));
    let (loader, loader_version) = primary
        .and_then(|l| l.id.as_deref())
        .map(split_loader_id)
        .map(|(k, v)| (Some(k), Some(v)))
        .unwrap_or((None, None));
    Ok(CurseforgeManifestSummary {
        mc_version: raw.minecraft.as_ref().and_then(|m| m.version.clone()),
        loader,
        loader_version,
        name: raw.name,
        version: raw.version,
        author: raw.author,
        file_count: raw.files.len() as u32,
    })
}

/// Downloads the ZIP at `url`, finds `manifest.json` inside, and
/// returns a parsed summary of the CurseForge metadata. Used by the
/// admin form to auto-populate MC version + loader after the user
/// pastes a URL or completes a file upload.
pub async fn read_cf_manifest_from_url(url: &str) -> Result<CurseforgeManifestSummary, String> {
    let client = http_client()?;
    let effective_url = resolve_share_url_for_dl(url).await;
    let same = effective_url == url;
    let url_trace = if same {
        format!("URL: {}", url)
    } else {
        format!("URL d'origine : {}\nURL résolue : {}", url, effective_url)
    };

    let res = client
        .get(&effective_url)
        .timeout(Duration::from_secs(300))
        .header("User-Agent", "SimpleLauncher (mc-zip)")
        .send()
        .await
        .map_err(|e| format!("DL manifest échoué : {}\n{}", e, url_trace))?;
    let status = res.status();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("?")
        .to_string();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(300).collect();
        return Err(format!(
            "HTTP {} (Content-Type: {}).\n{}\n\nDébut de la réponse :\n{}",
            status, content_type, url_trace, snippet
        ));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Lecture du body échouée : {}\n{}", e, url_trace))?
        .to_vec();

    // Sanity-check: a ZIP starts with PK\x03\x04 (or PK\x05\x06 for an
    // empty archive). If we got HTML, the share URL didn't really
    // return a file — surface that explicitly with the body snippet so
    // the user can spot a "this share requires sign-in" page.
    let looks_like_zip = bytes.len() >= 4
        && bytes[0] == b'P'
        && bytes[1] == b'K'
        && (bytes[2] == 3 || bytes[2] == 5)
        && (bytes[3] == 4 || bytes[3] == 6);
    if !looks_like_zip {
        let snippet: String = String::from_utf8_lossy(&bytes[..bytes.len().min(300)])
            .chars()
            .collect();
        return Err(format!(
            "La réponse n'est pas un ZIP (Content-Type: {}, {} octets reçus).\n{}\n\nDébut de la réponse :\n{}\n\nVérifie que le partage est bien public (Toute personne avec le lien) et que l'URL pointe vers le fichier directement.",
            content_type, bytes.len(), url_trace, snippet
        ));
    }

    // Open the bytes as a ZIP and pull `manifest.json` (handle
    // CurseForge's possible top-level wrapper folder).
    let url_trace_clone = url_trace.clone();
    let manifest_bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        use std::io::{Cursor, Read};
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|e| format!("Lecture du ZIP échouée : {}\n{}", e, url_trace_clone))?;
        // Find any entry whose tail name is `manifest.json`.
        let target_index = (0..archive.len()).find(|i| {
            archive
                .by_index(*i)
                .ok()
                .map(|e| {
                    let name = e.name();
                    name == "manifest.json" || name.ends_with("/manifest.json")
                })
                .unwrap_or(false)
        });
        let idx = target_index.ok_or_else(|| {
            format!(
                "Pas de manifest.json dans le ZIP. Liste des entrées (max 20) :\n{}\n\nCe n'est pas un export CurseForge — utilise le format export CF (Settings → Export → Profile dans CurseForge App), ou choisis « ZIP custom » avec un pack hand-built et remplis MC version + loader manuellement.",
                {
                    let mut lines: Vec<String> = (0..archive.len())
                        .take(20)
                        .filter_map(|i| archive.by_index(i).ok().map(|e| format!("  · {}", e.name())))
                        .collect();
                    if archive.len() > 20 {
                        lines.push(format!("  … ({} entrées de plus)", archive.len() - 20));
                    }
                    lines.join("\n")
                }
            )
        })?;
        let mut entry = archive
            .by_index(idx)
            .map_err(|e| format!("Lecture entrée manifest échouée : {}", e))?;
        let mut out = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut out)
            .map_err(|e| format!("Lecture body manifest échouée : {}", e))?;
        Ok(out)
    })
    .await
    .map_err(|e| format!("zip join failed: {}", e))??;
    parse_cf_manifest_bytes(&manifest_bytes)
        .map_err(|e| format!("{}\n{}", e, url_trace))
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_zip_install<R: Runtime>(
    app: AppHandle<R>,
    zip_url: String,
    instance_id: String,
) -> Result<(), String> {
    install_zip_pack(&app, &zip_url, &instance_id).await
}

/// Returns a parsed summary of the CurseForge `manifest.json` inside
/// the ZIP at the given URL. The admin form calls this to auto-fill MC
/// version + loader fields when the user uploads or pastes a CF
/// modpack URL.
#[tauri::command]
pub async fn mc_zip_read_manifest_url(url: String) -> Result<CurseforgeManifestSummary, String> {
    read_cf_manifest_from_url(&url).await
}
