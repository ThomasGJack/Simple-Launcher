// Native vanilla Minecraft installer.
//
// Handles everything between "user picked a Minecraft version" and "we
// have all the bits on disk needed to launch it":
//
//   1. Fetch + cache `version_manifest_v2.json` from Mojang's piston-meta
//   2. Fetch + cache the per-version `client.json`
//   3. Download `client.jar` (with SHA-1 verification)
//   4. Download every library from `version.json` (apply OS rules, verify
//      SHA-1, extract native `.dll`s into `instances/{id}/natives/`)
//   5. Download the asset index JSON
//   6. Download every asset object (~1500 files, parallel batches of 8)
//
// The actual *launch* (constructing the `java -jar …` command) lives in
// Phase 7. This module only puts the bytes in the right places.
//
// Storage layout (under `<APPDATA>/Simple Launcher/minecraft/`):
//
//   versions/{mcv}/{mcv}.json     ← per-version client.json
//   versions/{mcv}/{mcv}.jar      ← client JAR
//   libraries/{path}/{name}.jar   ← shared between instances
//   assets/indexes/{N}.json       ← per-asset-index hash list
//   assets/objects/{aa}/{aaXX…}   ← actual asset bytes (textures, sounds)
//   instances/{id}/natives/       ← per-instance extracted natives

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::{FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

// ─── Endpoints ────────────────────────────────────────────────────────

const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

/// Max concurrent downloads. Mojang's CDN is OK with this; pushing
/// higher (16+) starts hitting connection-reset territory.
const MAX_CONCURRENT_DLS: usize = 8;

// ─── Path helpers ─────────────────────────────────────────────────────

pub fn mc_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {}", e))?;
    Ok(base.join("minecraft"))
}

pub fn versions_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(mc_root(app)?.join("versions"))
}
pub fn libraries_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(mc_root(app)?.join("libraries"))
}
pub fn assets_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(mc_root(app)?.join("assets"))
}
pub fn instance_natives_dir<R: Runtime>(
    app: &AppHandle<R>,
    instance_id: &str,
) -> Result<PathBuf, String> {
    Ok(mc_root(app)?
        .join("instances")
        .join(instance_id)
        .join("natives"))
}

// ─── Manifest types (the Mojang JSON schema, partial) ────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<ManifestVersion>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestVersion {
    pub id: String,
    /// Mojang's manifest names this `type` (a JS-reserved-word in the
    /// frontend), so we deserialize from `type` but serialize as `kind`
    /// — gives the frontend a clean property name without the keyword
    /// clash. Plain `#[serde(rename = "type")]` would also rewrite the
    /// outgoing JSON to `type`, which broke the version filter.
    #[serde(rename(deserialize = "type"))]
    pub kind: String, // "release" | "snapshot" | "old_alpha" | "old_beta"
    pub url: String,
    pub sha1: String,
    pub release_time: String,
}

/// Per-version `client.json`. We only deserialize the fields we need to
/// drive the install — the actual launch path (Phase 7) will need a
/// few more (`mainClass`, `arguments`).
#[derive(Debug, Clone, Deserialize)]
struct VersionJson {
    #[allow(dead_code)]
    id: String,
    libraries: Vec<Library>,
    downloads: VersionDownloads,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexRef,
}

#[derive(Debug, Clone, Deserialize)]
struct VersionDownloads {
    client: HashedDownload,
}

#[derive(Debug, Clone, Deserialize)]
struct AssetIndexRef {
    id: String,
    url: String,
    sha1: String,
    #[allow(dead_code)]
    size: u64,
    #[serde(rename = "totalSize")]
    #[allow(dead_code)]
    total_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct HashedDownload {
    sha1: String,
    #[allow(dead_code)]
    size: u64,
    url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct Library {
    /// Maven coordinate (`group:artifact:version`). Captured only so
    /// that future debug logging / dedup logic can reference it; the
    /// current install path operates on the resolved Artifact, not on
    /// this string.
    #[allow(dead_code)]
    name: String,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<LibraryRule>>,
    natives: Option<std::collections::HashMap<String, String>>,
    extract: Option<ExtractRule>,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryDownloads {
    artifact: Option<Artifact>,
    classifiers: Option<std::collections::HashMap<String, Artifact>>,
}

#[derive(Debug, Clone, Deserialize)]
struct Artifact {
    path: Option<String>,
    sha1: String,
    #[allow(dead_code)]
    size: u64,
    url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryRule {
    action: String, // "allow" | "disallow"
    os: Option<RuleOs>,
}

#[derive(Debug, Clone, Deserialize)]
struct RuleOs {
    name: Option<String>, // "windows" | "osx" | "linux"
    #[allow(dead_code)]
    version: Option<String>,
    #[allow(dead_code)]
    arch: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ExtractRule {
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AssetIndexJson {
    objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Debug, Clone, Deserialize)]
struct AssetObject {
    hash: String,
    #[allow(dead_code)]
    size: u64,
}

// ─── Progress events ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub mc_version: String,
    pub phase: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
}

fn emit<R: Runtime>(app: &AppHandle<R>, p: &InstallProgress) {
    let _ = app.emit("mc-vanilla-progress", p);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("SimpleLauncher (mc-vanilla)")
        .build()
        .map_err(|e| format!("HTTP client build failed: {}", e))
}

/// Downloads a URL into `dest`, then verifies its SHA-1 matches
/// `expected_sha1`. Skips the download entirely if `dest` already exists
/// AND its hash already matches — makes installs idempotent and
/// resumable. Creates parent directories as needed.
async fn download_with_sha1(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha1: &str,
) -> Result<(), String> {
    if dest.exists() {
        if file_sha1(dest).await? == expected_sha1.to_lowercase() {
            return Ok(());
        }
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir {} failed: {}", parent.display(), e))?;
    }
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("GET {} failed: {}", url, e))?;
    if !res.status().is_success() {
        return Err(format!("GET {} HTTP {}", url, res.status()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("read {} body failed: {}", url, e))?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    let actual = hex::encode(hasher.finalize());
    if actual != expected_sha1.to_lowercase() {
        return Err(format!(
            "SHA-1 mismatch on {}: expected {}, got {}",
            url, expected_sha1, actual
        ));
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
    Ok(())
}

async fn file_sha1(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .await
        .map_err(|e| format!("read {} failed: {}", path.display(), e))?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

// ─── Library rule evaluation ──────────────────────────────────────────

/// A library is included on Windows when:
///   - it has no rules (allowed by default), OR
///   - the *last* matching rule has `action: "allow"`
/// Mojang's evaluation order is "rules apply top-to-bottom, last match
/// wins". An empty `os` clause means "applies to all OSes".
fn library_applies_on_windows(lib: &Library) -> bool {
    let Some(rules) = &lib.rules else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        let matches = match &rule.os {
            None => true,
            Some(os) => match os.name.as_deref() {
                None => true,
                Some("windows") => true,
                _ => false,
            },
        };
        if matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

/// Returns the natives classifier for Windows (e.g. `natives-windows`)
/// if this library has one. Pre-1.18 versions ship native `.dll`s in a
/// separate JAR per OS that we extract into the instance's `natives/`.
fn windows_natives_classifier(lib: &Library) -> Option<String> {
    let natives = lib.natives.as_ref()?;
    Some(natives.get("windows").cloned()?)
}

/// Given a Maven-style `name` (`groupId:artifactId:version[:classifier]`),
/// returns the relative path inside `libraries/`. Used for vanilla libs
/// (rarely — most have explicit `path`) AND for Fabric libs (always —
/// the Fabric meta only gives Maven coords + a base URL).
pub fn maven_path(name: &str) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    let group = parts.first().copied().unwrap_or("").replace('.', "/");
    let artifact = parts.get(1).copied().unwrap_or("");
    let version = parts.get(2).copied().unwrap_or("");
    let classifier = parts.get(3).map(|c| format!("-{}", c)).unwrap_or_default();
    format!(
        "{}/{}/{}/{}-{}{}.jar",
        group, artifact, version, artifact, version, classifier
    )
}

// ─── Public install pipeline ──────────────────────────────────────────

/// Fetches Mojang's master version manifest. Cached for 1 day in
/// `<root>/versions/_manifest.json` so opening the version picker
/// repeatedly doesn't hammer their CDN.
pub async fn fetch_version_manifest<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<VersionManifest, String> {
    let cache_path = versions_dir(app)?.join("_manifest.json");
    if cache_path.exists() {
        if let Ok(meta) = fs::metadata(&cache_path).await {
            if let Ok(modified) = meta.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    if elapsed.as_secs() < 86_400 {
                        if let Ok(bytes) = fs::read(&cache_path).await {
                            if let Ok(parsed) = serde_json::from_slice::<VersionManifest>(&bytes) {
                                return Ok(parsed);
                            }
                        }
                    }
                }
            }
        }
    }
    let client = http_client()?;
    let res = client
        .get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("manifest GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("manifest HTTP {}", res.status()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("manifest body failed: {}", e))?;
    let parsed: VersionManifest = serde_json::from_slice(&bytes)
        .map_err(|e| format!("manifest parse failed: {}", e))?;
    // Best-effort cache write — failures are non-fatal.
    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let _ = fs::write(&cache_path, &bytes).await;
    Ok(parsed)
}

/// Fetches and caches the per-version `client.json`. Stored at
/// `versions/{mcv}/{mcv}.json` so the launch path (Phase 7) can read
/// it without a network round-trip.
async fn fetch_version_json<R: Runtime>(
    app: &AppHandle<R>,
    client: &reqwest::Client,
    mc_version: &str,
) -> Result<VersionJson, String> {
    let manifest = fetch_version_manifest(app).await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("Version Minecraft `{}` introuvable", mc_version))?;
    let dest = versions_dir(app)?
        .join(mc_version)
        .join(format!("{}.json", mc_version));
    download_with_sha1(client, &entry.url, &dest, &entry.sha1).await?;
    let bytes = fs::read(&dest)
        .await
        .map_err(|e| format!("read version.json failed: {}", e))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("version.json parse failed: {}", e))
}

/// Top-level: install everything needed for the given MC version into
/// the shared layout, plus extract natives into the per-instance dir
/// `instances/{instance_id}/natives/`. Idempotent — re-running just
/// re-verifies hashes and skips already-correct files.
pub async fn install_vanilla<R: Runtime>(
    app: &AppHandle<R>,
    mc_version: &str,
    instance_id: &str,
) -> Result<(), String> {
    let client = http_client()?;
    let mc_root = mc_root(app)?;
    fs::create_dir_all(&mc_root)
        .await
        .map_err(|e| format!("mkdir mc root failed: {}", e))?;

    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "version-json".to_string(),
            current: 0,
            total: 1,
            message: format!("Récupération de la version {}…", mc_version),
        },
    );
    let version = fetch_version_json(app, &client, mc_version).await?;

    // 1. Client JAR ────────────────────────────────────────────────
    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "client".to_string(),
            current: 0,
            total: 1,
            message: "Téléchargement du client Minecraft…".to_string(),
        },
    );
    let client_jar = versions_dir(app)?
        .join(mc_version)
        .join(format!("{}.jar", mc_version));
    download_with_sha1(
        &client,
        &version.downloads.client.url,
        &client_jar,
        &version.downloads.client.sha1,
    )
    .await?;

    // 2. Libraries (parallel) ──────────────────────────────────────
    let libs_dir = libraries_dir(app)?;
    let natives_dir = instance_natives_dir(app, instance_id)?;
    fs::create_dir_all(&natives_dir)
        .await
        .map_err(|e| format!("mkdir natives failed: {}", e))?;

    let applicable_libs: Vec<&Library> = version
        .libraries
        .iter()
        .filter(|l| library_applies_on_windows(l))
        .collect();
    let total_libs = applicable_libs.len() as u64;
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_DLS));
    let mut futs = FuturesUnordered::new();
    for (i, lib) in applicable_libs.iter().enumerate() {
        let sem = sem.clone();
        let client = client.clone();
        let libs_dir = libs_dir.clone();
        let natives_dir = natives_dir.clone();
        let lib = (*lib).clone();
        futs.push(async move {
            let _permit = sem.acquire_owned().await.ok();
            install_one_library(&client, &lib, &libs_dir, &natives_dir).await?;
            Ok::<usize, String>(i)
        });
    }
    let mut done_libs: u64 = 0;
    while let Some(res) = futs.next().await {
        res?;
        done_libs += 1;
        emit(
            app,
            &InstallProgress {
                mc_version: mc_version.to_string(),
                phase: "libraries".to_string(),
                current: done_libs,
                total: total_libs,
                message: format!("Bibliothèques ({}/{})", done_libs, total_libs),
            },
        );
    }

    // 3. Asset index ──────────────────────────────────────────────
    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "asset-index".to_string(),
            current: 0,
            total: 1,
            message: "Index des assets…".to_string(),
        },
    );
    let asset_index_path = assets_dir(app)?
        .join("indexes")
        .join(format!("{}.json", version.asset_index.id));
    download_with_sha1(
        &client,
        &version.asset_index.url,
        &asset_index_path,
        &version.asset_index.sha1,
    )
    .await?;
    let asset_index_bytes = fs::read(&asset_index_path)
        .await
        .map_err(|e| format!("read asset index failed: {}", e))?;
    let asset_index: AssetIndexJson = serde_json::from_slice(&asset_index_bytes)
        .map_err(|e| format!("asset index parse failed: {}", e))?;

    // 4. Asset objects (heavily parallel) ─────────────────────────
    let objects_dir = assets_dir(app)?.join("objects");
    let total_assets = asset_index.objects.len() as u64;
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_DLS));
    let mut futs = FuturesUnordered::new();
    for (_name, obj) in asset_index.objects.iter() {
        let sem = sem.clone();
        let client = client.clone();
        let objects_dir = objects_dir.clone();
        let hash = obj.hash.clone();
        futs.push(async move {
            let _permit = sem.acquire_owned().await.ok();
            let prefix = &hash[..2];
            let url = format!("{}/{}/{}", RESOURCES_BASE_URL, prefix, hash);
            let dest = objects_dir.join(prefix).join(&hash);
            download_with_sha1(&client, &url, &dest, &hash).await
        });
    }
    let mut done_assets: u64 = 0;
    while let Some(res) = futs.next().await {
        // One asset failing is logged but doesn't abort the install —
        // missing assets only break specific resources (a sound, a
        // texture). The user can re-run install to retry.
        if let Err(err) = res {
            eprintln!("[mc-vanilla] asset DL warning: {}", err);
        }
        done_assets += 1;
        if done_assets % 25 == 0 || done_assets == total_assets {
            emit(
                app,
                &InstallProgress {
                    mc_version: mc_version.to_string(),
                    phase: "assets".to_string(),
                    current: done_assets,
                    total: total_assets,
                    message: format!("Assets ({}/{})", done_assets, total_assets),
                },
            );
        }
    }

    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "done".to_string(),
            current: 1,
            total: 1,
            message: "Installation vanilla terminée.".to_string(),
        },
    );
    Ok(())
}

/// Downloads one library + (if applicable) extracts its native `.dll`s
/// into the per-instance `natives/` dir. Returns when the file is on
/// disk and SHA-1 verified.
async fn install_one_library(
    client: &reqwest::Client,
    lib: &Library,
    libs_dir: &Path,
    natives_dir: &Path,
) -> Result<(), String> {
    let downloads = match &lib.downloads {
        Some(d) => d,
        None => return Ok(()), // some libs (e.g. Forge stubs) have no downloads
    };

    // Main artifact (if present).
    if let Some(art) = &downloads.artifact {
        if let Some(rel) = &art.path {
            let dest = libs_dir.join(rel);
            download_with_sha1(client, &art.url, &dest, &art.sha1).await?;
        }
    }

    // Windows natives — for legacy versions (≤ 1.18) shipped via
    // `classifiers["natives-windows"]`. We DL the JAR + extract its
    // `.dll` content into the instance's `natives/` dir, which the
    // launcher will then point `-Djava.library.path=` at.
    if let (Some(classifier), Some(classifiers)) = (
        windows_natives_classifier(lib),
        downloads.classifiers.as_ref(),
    ) {
        if let Some(art) = classifiers.get(&classifier) {
            if let Some(rel) = &art.path {
                let dest = libs_dir.join(rel);
                download_with_sha1(client, &art.url, &dest, &art.sha1).await?;
                extract_natives_jar(&dest, natives_dir, lib.extract.as_ref())?;
            }
        }
    }
    Ok(())
}

/// Extracts every `.dll` (and `.so`/`.dylib` for completeness) from a
/// natives JAR into `dest`, honoring the `extract.exclude` list (Mojang
/// uses this to skip `META-INF/` etc.).
fn extract_natives_jar(
    jar_path: &Path,
    dest: &Path,
    extract: Option<&ExtractRule>,
) -> Result<(), String> {
    use std::fs::File;
    use std::io::BufReader;
    std::fs::create_dir_all(dest).map_err(|e| format!("mkdir natives failed: {}", e))?;
    let file = File::open(jar_path).map_err(|e| format!("open natives jar failed: {}", e))?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("read natives jar failed: {}", e))?;

    let exclude = extract.map(|e| e.exclude.clone()).unwrap_or_default();
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {}: {}", i, e))?;
        let name = entry.name().to_string();
        if entry.is_dir() {
            continue;
        }
        if exclude.iter().any(|ex| name.starts_with(ex)) {
            continue;
        }
        // Only extract real native libs.
        let lower = name.to_lowercase();
        if !lower.ends_with(".dll") && !lower.ends_with(".so") && !lower.ends_with(".dylib") {
            continue;
        }
        let final_name = Path::new(&name)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or(name.clone());
        let out_path = dest.join(final_name);
        let mut out_file =
            File::create(&out_path).map_err(|e| format!("create native failed: {}", e))?;
        std::io::copy(&mut entry, &mut out_file)
            .map_err(|e| format!("extract native failed: {}", e))?;
    }
    Ok(())
}

// ─── Tauri commands ──────────────────────────────────────────────────

/// Returns the master version manifest, lightly transformed for the UI:
/// just the list of versions with their type, with the latest release
/// + snapshot ids surfaced separately.
#[tauri::command]
pub async fn mc_vanilla_list_versions<R: Runtime>(
    app: AppHandle<R>,
) -> Result<VersionManifest, String> {
    fetch_version_manifest(&app).await
}

/// Installs a vanilla MC version into the shared launcher layout, plus
/// extracts native libs into `instances/{instance_id}/natives/`. Emits
/// `mc-vanilla-progress` events with `phase` ∈ {version-json, client,
/// libraries, asset-index, assets, done}.
#[tauri::command]
pub async fn mc_vanilla_install<R: Runtime>(
    app: AppHandle<R>,
    mc_version: String,
    instance_id: String,
) -> Result<(), String> {
    install_vanilla(&app, &mc_version, &instance_id).await
}

/// Cheap check: does `versions/{mcv}/{mcv}.jar` exist and parse-OK ?
/// Used by the UI to flip between "Install" and "Launch" buttons.
#[tauri::command]
pub async fn mc_vanilla_is_installed<R: Runtime>(
    app: AppHandle<R>,
    mc_version: String,
) -> Result<bool, String> {
    let jar = versions_dir(&app)?
        .join(&mc_version)
        .join(format!("{}.jar", mc_version));
    let json = versions_dir(&app)?
        .join(&mc_version)
        .join(format!("{}.json", mc_version));
    Ok(jar.exists() && json.exists())
}

/// Wipes everything in `instances/{instance_id}/` — used when an admin
/// deletes a Minecraft module so the orphan `.minecraft/` + natives +
/// any logs don't sit on disk forever. Doesn't touch the shared
/// `versions/`, `libraries/` or `assets/` dirs since those are reused
/// across instances.
#[tauri::command]
pub async fn mc_native_uninstall_instance<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
) -> Result<(), String> {
    let dir = mc_root(&app)?.join("instances").join(&instance_id);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .await
            .map_err(|e| format!("remove {} failed: {}", dir.display(), e))?;
    }
    Ok(())
}

/// Opens the instance's `.minecraft/` directory in the OS file
/// explorer. Lets users drop in resourcepacks / shaderpacks / configs
/// without having to dig through %APPDATA% manually. Creates the dir if
/// it doesn't exist yet (otherwise Explorer would just refuse).
#[tauri::command]
pub async fn mc_native_open_instance_dir<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
) -> Result<String, String> {
    let dir = mc_root(&app)?
        .join("instances")
        .join(&instance_id)
        .join(".minecraft");
    fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("mkdir {} failed: {}", dir.display(), e))?;
    let path_str = dir.to_string_lossy().into_owned();
    // Use the OS shell to open the folder. `explorer.exe {path}` on
    // Windows pops a new window even if Explorer is already running.
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&path_str).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path_str).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path_str).spawn();
    }
    Ok(path_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_libs_passthrough() {
        let lib = Library {
            name: "x:y:1".into(),
            downloads: None,
            rules: None,
            natives: None,
            extract: None,
        };
        assert!(library_applies_on_windows(&lib));
    }

    #[test]
    fn linux_only_lib_skipped_on_windows() {
        let lib = Library {
            name: "x:y:1".into(),
            downloads: None,
            rules: Some(vec![
                LibraryRule {
                    action: "disallow".into(),
                    os: None,
                },
                LibraryRule {
                    action: "allow".into(),
                    os: Some(RuleOs {
                        name: Some("linux".into()),
                        version: None,
                        arch: None,
                    }),
                },
            ]),
            natives: None,
            extract: None,
        };
        assert!(!library_applies_on_windows(&lib));
    }

    #[test]
    fn maven_path_basic() {
        assert_eq!(
            maven_path("net.minecraft:client:1.20.1"),
            "net/minecraft/client/1.20.1/client-1.20.1.jar"
        );
        assert_eq!(
            maven_path("net.minecraft:client:1.20.1:natives-windows"),
            "net/minecraft/client/1.20.1/client-1.20.1-natives-windows.jar"
        );
    }
}
