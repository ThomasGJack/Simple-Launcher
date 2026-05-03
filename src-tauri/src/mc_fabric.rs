// Fabric loader installer.
//
// Fabric's `meta.fabricmc.net` API hands back a "profile JSON" that's
// designed to be merged with the vanilla `client.json`. The merge rule:
//   - Fabric's `mainClass` overrides vanilla's (`KnotClient` vs `Main`)
//   - Fabric's `libraries` are appended to the vanilla list
//   - Fabric's `arguments.{jvm,game}` are appended
//   - `inheritsFrom: "1.20.1"` tells consumers which vanilla bits to use
//
// We resolve the merge ourselves at *launch time* (Phase 7) by reading
// the two JSONs and combining them. This module just downloads:
//   1. The profile JSON for the requested Fabric loader version
//   2. Every additional library it lists (Maven-style, no sha1)
//
// Fabric reuses the vanilla client JAR + asset index, so we make sure
// vanilla is installed first as a prerequisite.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::{FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use crate::mc_vanilla::{
    http_client, install_vanilla, libraries_dir, maven_path, versions_dir, InstallProgress,
};

const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
const MAX_CONCURRENT_DLS: usize = 8;

// ─── Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricGameVersion {
    pub version: String,
    pub stable: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricLoaderVersion {
    pub separator: String,
    pub build: u32,
    pub maven: String,
    pub version: String,
    pub stable: bool,
}

/// The merged profile JSON Fabric returns. We read it both at install
/// time (to know which libs to DL) and at launch time (to merge with
/// vanilla). Stored verbatim on disk so the launch path can re-parse
/// without another network round-trip.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricProfile {
    pub id: String,
    pub inherits_from: String,
    #[serde(default)]
    pub main_class: String,
    #[serde(default)]
    pub libraries: Vec<FabricLibrary>,
    /// `arguments` is optional in the schema — older Fabric responses
    /// sometimes omit it.
    #[serde(default)]
    pub arguments: Option<FabricArguments>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FabricArguments {
    #[serde(default)]
    pub game: Vec<serde_json::Value>,
    #[serde(default)]
    pub jvm: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FabricLibrary {
    /// Maven-style coordinates: `group:artifact:version`.
    pub name: String,
    /// Base Maven repo URL, e.g. `https://maven.fabricmc.net/`. The
    /// actual JAR lives at `{url}{group_path}/{artifact}/{version}/...`.
    pub url: String,
}

// ─── Public install pipeline ──────────────────────────────────────────

/// Lists every Minecraft version that has at least one Fabric loader
/// available. Returned in the order Fabric publishes (newest first).
pub async fn list_game_versions() -> Result<Vec<FabricGameVersion>, String> {
    let client = http_client()?;
    let url = format!("{}/versions/game", FABRIC_META);
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fabric game versions GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Fabric game versions HTTP {}", res.status()));
    }
    res.json::<Vec<FabricGameVersion>>()
        .await
        .map_err(|e| format!("Fabric game versions parse failed: {}", e))
}

/// Lists every Fabric loader version compatible with the given MC version.
pub async fn list_loader_versions(mc_version: &str) -> Result<Vec<FabricLoaderVersion>, String> {
    let client = http_client()?;
    let url = format!("{}/versions/loader/{}", FABRIC_META, mc_version);
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fabric loader versions GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Fabric loader versions HTTP {}", res.status()));
    }
    // The full response wraps each loader in `{ loader: {...}, intermediary: {...} }`.
    // We only need the `loader` field.
    #[derive(Deserialize)]
    struct Wrapper {
        loader: FabricLoaderVersion,
    }
    let wrapped: Vec<Wrapper> = res
        .json()
        .await
        .map_err(|e| format!("Fabric loader versions parse failed: {}", e))?;
    Ok(wrapped.into_iter().map(|w| w.loader).collect())
}

/// Fetches the profile JSON for a given (mc, loader) pair. This is the
/// "patch JSON" that merges with vanilla at launch time.
pub async fn fetch_profile(
    mc_version: &str,
    loader_version: &str,
) -> Result<(FabricProfile, Vec<u8>), String> {
    let client = http_client()?;
    let url = format!(
        "{}/versions/loader/{}/{}/profile/json",
        FABRIC_META, mc_version, loader_version
    );
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fabric profile GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!(
            "Fabric profile HTTP {} for {}/{}",
            res.status(),
            mc_version,
            loader_version
        ));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Fabric profile body failed: {}", e))?
        .to_vec();
    let parsed: FabricProfile = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Fabric profile parse failed: {} (body: {})", e, String::from_utf8_lossy(&bytes)))?;
    Ok((parsed, bytes))
}

fn emit<R: Runtime>(app: &AppHandle<R>, p: &InstallProgress) {
    let _ = app.emit("mc-vanilla-progress", p);
}

/// Top-level install: makes sure vanilla bits are present, fetches the
/// Fabric profile, downloads its extra libraries. After this completes
/// the launch path (Phase 7) can read the profile JSON + the vanilla
/// JSON, merge them, and spawn `java`.
pub async fn install_fabric<R: Runtime>(
    app: &AppHandle<R>,
    mc_version: &str,
    loader_version: &str,
    instance_id: &str,
) -> Result<(), String> {
    // 1. Vanilla prerequisite ─ Fabric reuses the vanilla client.jar +
    //    asset index. install_vanilla is idempotent so repeating this
    //    on a fresh install is cheap on the second run.
    install_vanilla(app, mc_version, instance_id).await?;

    let composite_id = format!("fabric-loader-{}-{}", loader_version, mc_version);

    // 2. Fetch + persist profile JSON
    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "fabric-profile".to_string(),
            current: 0,
            total: 1,
            message: format!("Profil Fabric {}…", loader_version),
        },
    );
    let (profile, profile_bytes) = fetch_profile(mc_version, loader_version).await?;
    let profile_dir = versions_dir(app)?.join(&composite_id);
    fs::create_dir_all(&profile_dir)
        .await
        .map_err(|e| format!("mkdir fabric profile dir failed: {}", e))?;
    let profile_dest = profile_dir.join(format!("{}.json", composite_id));
    fs::write(&profile_dest, &profile_bytes)
        .await
        .map_err(|e| format!("écriture profil Fabric échouée : {}", e))?;

    // 3. DL libraries (parallel). Fabric libs don't carry a sha1 in
    //    their meta — we just GET the file. If the install ever reports
    //    "broken JAR" downstream, the user can re-run install to retry.
    let libs_dir = libraries_dir(app)?;
    let total_libs = profile.libraries.len() as u64;
    let client = http_client()?;
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_DLS));
    let mut futs = FuturesUnordered::new();
    for lib in profile.libraries.iter().cloned() {
        let sem = sem.clone();
        let client = client.clone();
        let libs_dir = libs_dir.clone();
        futs.push(async move {
            let _permit = sem.acquire_owned().await.ok();
            install_one_fabric_library(&client, &lib, &libs_dir).await
        });
    }
    let mut done: u64 = 0;
    while let Some(res) = futs.next().await {
        res?;
        done += 1;
        emit(
            app,
            &InstallProgress {
                mc_version: mc_version.to_string(),
                phase: "fabric-libraries".to_string(),
                current: done,
                total: total_libs,
                message: format!("Bibliothèques Fabric ({}/{})", done, total_libs),
            },
        );
    }

    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "done".to_string(),
            current: 1,
            total: 1,
            message: format!("Fabric {} prêt.", loader_version),
        },
    );
    Ok(())
}

/// Downloads one Fabric library by Maven coords. URL is built as
/// `{lib.url}{maven_path(lib.name)}` and we skip the DL if the JAR is
/// already present.
async fn install_one_fabric_library(
    client: &reqwest::Client,
    lib: &FabricLibrary,
    libs_dir: &Path,
) -> Result<(), String> {
    let rel = maven_path(&lib.name);
    let dest = libs_dir.join(&rel);
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir lib parent failed: {}", e))?;
    }
    let full_url = format!(
        "{}{}",
        lib.url.trim_end_matches('/'),
        format!("/{}", rel.trim_start_matches('/'))
    );
    let res = client
        .get(&full_url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("DL Fabric lib {} failed: {}", lib.name, e))?;
    if !res.status().is_success() {
        return Err(format!(
            "Fabric lib {} HTTP {} ({})",
            lib.name,
            res.status(),
            full_url
        ));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("read Fabric lib {} body failed: {}", lib.name, e))?;
    let mut f = fs::File::create(&dest)
        .await
        .map_err(|e| format!("create lib {} failed: {}", dest.display(), e))?;
    f.write_all(&bytes)
        .await
        .map_err(|e| format!("write lib {} failed: {}", dest.display(), e))?;
    f.flush()
        .await
        .map_err(|e| format!("flush lib {} failed: {}", dest.display(), e))?;
    Ok(())
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_fabric_list_game_versions() -> Result<Vec<FabricGameVersion>, String> {
    list_game_versions().await
}

#[tauri::command]
pub async fn mc_fabric_list_loader_versions(
    mc_version: String,
) -> Result<Vec<FabricLoaderVersion>, String> {
    list_loader_versions(&mc_version).await
}

#[tauri::command]
pub async fn mc_fabric_install<R: Runtime>(
    app: AppHandle<R>,
    mc_version: String,
    loader_version: String,
    instance_id: String,
) -> Result<(), String> {
    install_fabric(&app, &mc_version, &loader_version, &instance_id).await
}
