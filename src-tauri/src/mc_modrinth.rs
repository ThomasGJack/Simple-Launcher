// Modrinth modpack installer.
//
// Modrinth packs ship as `.mrpack` files (just a ZIP with a different
// extension). Inside:
//   - `modrinth.index.json` — manifest (mod URLs, MC version, loader)
//   - `overrides/`           — files copied verbatim into `.minecraft/`
//   - `client-overrides/`    — client-only overrides (we treat same as
//                              `overrides/` for desktop launching)
//
// Install flow:
//   1. GET the .mrpack URL → save to scratch dir
//   2. Open as ZIP, read `modrinth.index.json`
//   3. From `dependencies`, install vanilla + loader (delegate to
//      `mc_vanilla` / `mc_fabric` / `mc_forge`)
//   4. For each `files[]` entry with `env.client != "unsupported"`:
//      DL `downloads[0]` → write to `.minecraft/{path}` + verify SHA-1
//   5. Extract every entry under `overrides/` (and `client-overrides/`)
//      into `.minecraft/`
//   6. Drop scratch dir
//
// Fully native — no Prism, no curseforge_user_token, no API key.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::stream::{FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use sha1::{Digest as _, Sha1};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use crate::mc_fabric::install_fabric;
use crate::mc_forge::{install_forge_like, ForgeKind};
use crate::mc_vanilla::{http_client, mc_root, InstallProgress};

const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const MAX_CONCURRENT_DLS: usize = 6; // Modrinth CDN doesn't love bursts

// ─── Search / version listing types ───────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthProject {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u64,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthSearchResponse {
    hits: Vec<ModrinthProject>,
    #[allow(dead_code)]
    total_hits: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub version_number: String,
    pub name: String,
    pub version_type: String, // "release" | "beta" | "alpha"
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthVersionFile>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthVersionFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: ModrinthHashes,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModrinthHashes {
    pub sha1: String,
    #[serde(default)]
    pub sha512: Option<String>,
}

// ─── .mrpack manifest types ──────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
struct MrpackIndex {
    #[allow(dead_code)]
    format_version: u32,
    name: String,
    #[allow(dead_code)]
    version_id: String,
    files: Vec<MrpackFile>,
    dependencies: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct MrpackFile {
    path: String,
    downloads: Vec<String>,
    hashes: ModrinthHashes,
    #[serde(default)]
    env: Option<MrpackEnv>,
    #[allow(dead_code)]
    file_size: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct MrpackEnv {
    client: String, // "required" | "unsupported" | "optional"
    #[allow(dead_code)]
    server: String,
}

// ─── Progress events ──────────────────────────────────────────────────

fn emit<R: Runtime>(app: &AppHandle<R>, p: &InstallProgress) {
    let _ = app.emit("mc-vanilla-progress", p);
}

// ─── Public API: search / version listing ─────────────────────────────

/// Searches Modrinth for modpacks matching `query`. Limited to 30
/// results — the UI surfaces the top picks; deeper browsing can fetch
/// pages via `offset` later if needed.
pub async fn search_modpacks(query: &str) -> Result<Vec<ModrinthProject>, String> {
    let client = http_client()?;
    let q = if query.trim().is_empty() {
        "".to_string()
    } else {
        format!("&query={}", urlencoding(query))
    };
    let url = format!(
        "{}/search?facets=%5B%5B%22project_type%3Amodpack%22%5D%5D&limit=30&index=relevance{}",
        MODRINTH_API, q
    );
    let res = client
        .get(&url)
        .header("User-Agent", "SimpleLauncher/native (mc-modrinth)")
        .send()
        .await
        .map_err(|e| format!("Modrinth search GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Modrinth search HTTP {}", res.status()));
    }
    let body: ModrinthSearchResponse = res
        .json()
        .await
        .map_err(|e| format!("Modrinth search parse failed: {}", e))?;
    Ok(body.hits)
}

/// Returns the version list for a Modrinth project (newest first).
/// Filtered to project types where the primary file is a `.mrpack`.
pub async fn list_versions(project_id: &str) -> Result<Vec<ModrinthVersion>, String> {
    let client = http_client()?;
    let url = format!("{}/project/{}/version", MODRINTH_API, project_id);
    let res = client
        .get(&url)
        .header("User-Agent", "SimpleLauncher/native (mc-modrinth)")
        .send()
        .await
        .map_err(|e| format!("Modrinth versions GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Modrinth versions HTTP {}", res.status()));
    }
    let versions: Vec<ModrinthVersion> = res
        .json()
        .await
        .map_err(|e| format!("Modrinth versions parse failed: {}", e))?;
    Ok(versions)
}

// ─── Public API: install ──────────────────────────────────────────────

/// Installs a Modrinth modpack into the given instance. `mrpack_url`
/// must point to a `.mrpack` file (typically `version.files[0].url`
/// where `primary == true`). On completion the instance has:
///   - The right vanilla version installed (shared layout)
///   - The right loader installed (Fabric / Forge / NeoForge)
///   - All required mods + override files in `instances/{id}/.minecraft/`
///
/// Emits the same `mc-vanilla-progress` events the rest of the chain
/// uses, with `phase` ∈ { modrinth-dl, modrinth-deps, modrinth-mods,
/// modrinth-overrides, done }.
pub async fn install_modrinth_pack<R: Runtime>(
    app: &AppHandle<R>,
    mrpack_url: &str,
    instance_id: &str,
) -> Result<(), String> {
    let client = http_client()?;

    // 1. DL the .mrpack file ─────────────────────────────────────────
    //
    // Same chunk-streamed approach as `mc_zip::install_zip_pack`: emit
    // a progress tick every ~150 ms so the UI bar moves while the
    // download runs. Tiny manifest packs (~50 KB) finish in one tick;
    // large ones (Modrinth modpacks can hit a few MB if they ship
    // resourcepacks in `overrides/`) get a real progress bar instead
    // of "0 % until done".
    emit(
        app,
        &InstallProgress {
            mc_version: "?".into(),
            phase: "modrinth-dl".into(),
            current: 0,
            total: 1,
            message: "Téléchargement du pack Modrinth…".into(),
        },
    );
    let scratch = mc_root(app)?
        .join("scratch")
        .join(format!("modrinth-{}", chrono_millis_now()));
    fs::create_dir_all(&scratch)
        .await
        .map_err(|e| format!("mkdir scratch failed: {}", e))?;
    let mrpack_path = scratch.join("pack.mrpack");
    let effective_url = crate::mc_zip::resolve_share_url_for_dl(mrpack_url).await;
    let res = client
        .get(&effective_url)
        .timeout(Duration::from_secs(60 * 30)) // 30 min cap — large mrpacks on slow links
        .header("User-Agent", "SimpleLauncher/native (mc-modrinth)")
        .send()
        .await
        .map_err(|e| format!("DL .mrpack failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!(".mrpack HTTP {}", res.status()));
    }
    let total_bytes = res.content_length().unwrap_or(0);
    let mut f = fs::File::create(&mrpack_path)
        .await
        .map_err(|e| format!("create .mrpack temp failed: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("DL .mrpack chunk failed: {}", e))?;
        f.write_all(&chunk)
            .await
            .map_err(|e| format!("write .mrpack temp failed: {}", e))?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            emit(
                app,
                &InstallProgress {
                    mc_version: "?".into(),
                    phase: "modrinth-dl".into(),
                    current: downloaded,
                    total: if total_bytes > 0 {
                        total_bytes
                    } else {
                        downloaded
                    },
                    message: if total_bytes > 0 {
                        format!(
                            "Téléchargement du .mrpack… {:.1} / {:.1} Mo",
                            downloaded as f64 / 1_048_576.0,
                            total_bytes as f64 / 1_048_576.0
                        )
                    } else {
                        format!(
                            "Téléchargement du .mrpack… {:.1} Mo",
                            downloaded as f64 / 1_048_576.0
                        )
                    },
                },
            );
            last_emit = Instant::now();
        }
    }
    f.flush().await.ok();
    drop(f);

    // 2. Open the ZIP, read manifest ─────────────────────────────────
    let (index, override_blobs) =
        tokio::task::spawn_blocking({
            let mrpack_path = mrpack_path.clone();
            move || read_mrpack(&mrpack_path)
        })
        .await
        .map_err(|e| format!("mrpack join failed: {}", e))??;

    let mc_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| "Le pack n'indique pas de version Minecraft.".to_string())?;

    // 3. Install vanilla + loader from the manifest's `dependencies` ─
    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.clone(),
            phase: "modrinth-deps".into(),
            current: 0,
            total: 3,
            message: format!("Installation de {} pour {}…", index.name, mc_version),
        },
    );
    if let Some(fabric_v) = index.dependencies.get("fabric-loader") {
        install_fabric(app, &mc_version, fabric_v, instance_id).await?;
    } else if let Some(forge_v) = index.dependencies.get("forge") {
        install_forge_like(app, ForgeKind::Forge, &mc_version, forge_v, instance_id).await?;
    } else if let Some(neoforge_v) = index.dependencies.get("neoforge") {
        install_forge_like(app, ForgeKind::Neoforge, &mc_version, neoforge_v, instance_id).await?;
    } else if index.dependencies.contains_key("quilt-loader") {
        return Err(
            "Les packs Quilt ne sont pas encore supportés (utilise un pack Fabric pour l'instant)."
                .into(),
        );
    } else {
        // Vanilla-only modpack? Just install vanilla.
        crate::mc_vanilla::install_vanilla(app, &mc_version, instance_id).await?;
    }

    // 4. DL each required file from `index.files[]` (parallel) ───────
    let game_dir = mc_root(app)?
        .join("instances")
        .join(instance_id)
        .join(".minecraft");
    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("mkdir game_dir failed: {}", e))?;

    let required_files: Vec<MrpackFile> = index
        .files
        .into_iter()
        .filter(|f| match f.env.as_ref().map(|e| e.client.as_str()) {
            Some("unsupported") => false,
            _ => true, // "required" | "optional" | None → DL
        })
        .collect();

    let total_mods = required_files.len() as u64;
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_DLS));
    let mut futs = FuturesUnordered::new();
    for (i, file) in required_files.into_iter().enumerate() {
        let sem = sem.clone();
        let client = client.clone();
        let dest = game_dir.join(sanitize_pack_path(&file.path));
        futs.push(async move {
            let _permit = sem.acquire_owned().await.ok();
            install_one_pack_file(&client, &file, &dest).await?;
            Ok::<usize, String>(i)
        });
    }
    let mut done: u64 = 0;
    while let Some(res) = futs.next().await {
        res?;
        done += 1;
        if done % 5 == 0 || done == total_mods {
            emit(
                app,
                &InstallProgress {
                    mc_version: mc_version.clone(),
                    phase: "modrinth-mods".into(),
                    current: done,
                    total: total_mods,
                    message: format!("Mods Modrinth ({}/{})", done, total_mods),
                },
            );
        }
    }

    // 5. Extract overrides into .minecraft/ ──────────────────────────
    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.clone(),
            phase: "modrinth-overrides".into(),
            current: 0,
            total: override_blobs.len() as u64,
            message: "Extraction des overrides…".into(),
        },
    );
    let total_overrides = override_blobs.len() as u64;
    {
        let game_dir_clone = game_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            for (rel, bytes) in override_blobs {
                let dest = game_dir_clone.join(sanitize_pack_path(&rel));
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("mkdir override parent failed: {}", e))?;
                }
                std::fs::write(&dest, &bytes)
                    .map_err(|e| format!("write override {} failed: {}", dest.display(), e))?;
            }
            Ok(())
        })
        .await
        .map_err(|e| format!("override extract join failed: {}", e))??;
    }

    // 6. Cleanup scratch ─────────────────────────────────────────────
    let _ = fs::remove_dir_all(&scratch).await;

    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.clone(),
            phase: "done".into(),
            current: 1,
            total: 1,
            message: format!(
                "Pack Modrinth « {} » prêt ({} fichiers, {} overrides).",
                index.name, total_mods, total_overrides
            ),
        },
    );
    Ok(())
}

/// Reads a `.mrpack` ZIP, extracting the manifest + the `overrides/`
/// (and `client-overrides/`) blobs into memory. The mod files are NOT
/// inside the .mrpack — only the manifest pointing to their CDN URLs —
/// so we don't have to extract those here. Synchronous because the
/// `zip` crate is sync.
fn read_mrpack(zip_path: &Path) -> Result<(MrpackIndex, Vec<(String, Vec<u8>)>), String> {
    use std::fs::File;
    use std::io::{BufReader, Read};
    let file = File::open(zip_path).map_err(|e| format!("open .mrpack failed: {}", e))?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("read .mrpack failed: {}", e))?;

    // First pass: pull the manifest.
    let mut index_bytes: Vec<u8> = Vec::new();
    {
        let mut entry = archive
            .by_name("modrinth.index.json")
            .map_err(|_| "modrinth.index.json introuvable dans le pack".to_string())?;
        entry
            .read_to_end(&mut index_bytes)
            .map_err(|e| format!("read modrinth.index.json failed: {}", e))?;
    }
    let index: MrpackIndex = serde_json::from_slice(&index_bytes)
        .map_err(|e| format!("modrinth.index.json parse failed: {}", e))?;

    // Second pass: every entry under `overrides/` and `client-overrides/`.
    // We collect into memory because the `zip` crate's borrow rules make
    // streaming-while-also-iterating awkward. .mrpack overrides are
    // typically small (configs + resourcepacks) so this is fine.
    let mut overrides: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("read .mrpack entry {}: {}", i, e))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let rel = if let Some(rest) = name.strip_prefix("overrides/") {
            rest.to_string()
        } else if let Some(rest) = name.strip_prefix("client-overrides/") {
            rest.to_string()
        } else {
            continue;
        };
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| format!("read override {} failed: {}", name, e))?;
        overrides.push((rel, bytes));
    }
    Ok((index, overrides))
}

/// Downloads one pack file (mod, resourcepack, etc.) into `dest`,
/// verifying SHA-1. Tries each `downloads[]` URL in order until one
/// succeeds — Modrinth packs sometimes list multiple mirrors.
async fn install_one_pack_file(
    client: &reqwest::Client,
    file: &MrpackFile,
    dest: &Path,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir mod parent failed: {}", e))?;
    }
    // Skip if already on disk + hash matches.
    if dest.exists() {
        if let Ok(bytes) = fs::read(dest).await {
            let mut hasher = Sha1::new();
            hasher.update(&bytes);
            if hex::encode(hasher.finalize()) == file.hashes.sha1.to_lowercase() {
                return Ok(());
            }
        }
    }
    let mut last_err = String::new();
    for url in &file.downloads {
        match client
            .get(url)
            .timeout(Duration::from_secs(120))
            .header("User-Agent", "SimpleLauncher/native (mc-modrinth)")
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => {
                let bytes = match res.bytes().await {
                    Ok(b) => b,
                    Err(e) => {
                        last_err = format!("body read {}: {}", url, e);
                        continue;
                    }
                };
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                let actual = hex::encode(hasher.finalize());
                if actual != file.hashes.sha1.to_lowercase() {
                    last_err = format!(
                        "SHA-1 mismatch on {}: expected {}, got {}",
                        url, file.hashes.sha1, actual
                    );
                    continue;
                }
                let mut f = fs::File::create(dest)
                    .await
                    .map_err(|e| format!("create {} failed: {}", dest.display(), e))?;
                f.write_all(&bytes)
                    .await
                    .map_err(|e| format!("write {} failed: {}", dest.display(), e))?;
                f.flush()
                    .await
                    .map_err(|e| format!("flush {} failed: {}", dest.display(), e))?;
                return Ok(());
            }
            Ok(res) => {
                last_err = format!("HTTP {} for {}", res.status(), url);
            }
            Err(e) => {
                last_err = format!("GET {} failed: {}", url, e);
            }
        }
    }
    Err(format!(
        "Aucun mirror n'a fonctionné pour {} : {}",
        file.path, last_err
    ))
}

/// Strips path components that try to escape the install dir (`..`),
/// rewrites Windows-incompatible chars, and normalizes `\` → `/`.
/// Defense in depth — Modrinth packs are usually well-formed but never
/// trust user content.
fn sanitize_pack_path(raw: &str) -> String {
    let cleaned = raw.replace('\\', "/");
    let parts: Vec<&str> = cleaned
        .split('/')
        .filter(|p| !p.is_empty() && *p != "..")
        .collect();
    parts.join("/")
}

fn urlencoding(s: &str) -> String {
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

fn chrono_millis_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_modrinth_search(query: String) -> Result<Vec<ModrinthProject>, String> {
    search_modpacks(&query).await
}

#[tauri::command]
pub async fn mc_modrinth_list_versions(project_id: String) -> Result<Vec<ModrinthVersion>, String> {
    list_versions(&project_id).await
}

#[tauri::command]
pub async fn mc_modrinth_install<R: Runtime>(
    app: AppHandle<R>,
    mrpack_url: String,
    instance_id: String,
) -> Result<(), String> {
    install_modrinth_pack(&app, &mrpack_url, &instance_id).await
}
