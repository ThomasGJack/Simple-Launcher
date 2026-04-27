use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex as TokioMutex;

use crate::discord_rpc::DiscordRpc;

/// State of a locally-installed Minecraft modpack (per module).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MinecraftState {
    #[serde(rename = "instanceName")]
    pub instance_name: String,
    #[serde(rename = "fileId")]
    pub file_id: u64,
    #[serde(rename = "importedAt")]
    pub imported_at: u128,
}

#[derive(Debug, Serialize, Clone)]
struct McProgress {
    #[serde(rename = "moduleId")]
    module_id: String,
    phase: &'static str,
    #[serde(rename = "bytesDownloaded")]
    bytes_downloaded: u64,
    #[serde(rename = "bytesTotal")]
    bytes_total: u64,
}

#[derive(Debug, Serialize, Clone)]
struct LaunchEvent<'a> {
    #[serde(rename = "moduleId")]
    module_id: &'a str,
    #[serde(rename = "moduleName")]
    module_name: &'a str,
    #[serde(rename = "startedAt")]
    started_at: u128,
}

#[derive(Debug, Serialize, Clone)]
struct ExitEvent {
    #[serde(rename = "moduleId")]
    module_id: String,
    #[serde(rename = "moduleName")]
    module_name: String,
    #[serde(rename = "startedAt")]
    started_at: u128,
    #[serde(rename = "exitedAt")]
    exited_at: u128,
    #[serde(rename = "durationMs")]
    duration_ms: u128,
}

// Reuse the same launch tracker as regular modules for Discord RPC + playtime.
pub struct McLaunchTracker {
    inner: Arc<TrackerInner>,
}
struct TrackerInner {
    running: TokioMutex<HashSet<String>>,
}
impl McLaunchTracker {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(TrackerInner {
                running: TokioMutex::new(HashSet::new()),
            }),
        }
    }
    fn arc(&self) -> Arc<TrackerInner> {
        self.inner.clone()
    }
}

fn launcher_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| format!("app_data_dir: {}", e))
}

fn mc_state_path(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root(app)?
        .join("minecraft")
        .join(format!("{}.json", module_id)))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[tauri::command]
pub async fn mc_find_prism(app: AppHandle) -> Result<Option<String>, String> {
    if let Some(p) = find_prism_path(&app).await {
        return Ok(Some(p.to_string_lossy().into_owned()));
    }
    Ok(None)
}

async fn find_prism_path(app: &AppHandle) -> Option<PathBuf> {
    let candidates = collect_prism_candidates(app);
    for path in candidates {
        if fs::try_exists(&path).await.unwrap_or(false) {
            return Some(path);
        }
    }
    None
}

fn collect_prism_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    // 1. Our managed install (auto-downloaded)
    if let Ok(root) = launcher_root(app) {
        out.push(root.join("prism").join("prismlauncher.exe"));
    }
    // 2. User's existing standard installs
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        out.push(PathBuf::from(&local).join("Programs\\PrismLauncher\\prismlauncher.exe"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        out.push(PathBuf::from(&pf).join("PrismLauncher\\prismlauncher.exe"));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        out.push(PathBuf::from(&pf86).join("PrismLauncher\\prismlauncher.exe"));
    }
    out
}

async fn ensure_prism_installed(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    if let Some(p) = find_prism_path(app).await {
        return Ok(p);
    }
    install_prism_portable(app, module_id).await
}

async fn install_prism_portable(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    emit_progress(app, module_id, "fetching-prism-info", 0, 0);

    // 1. Get latest release info from GitHub
    let resp = reqwest::Client::new()
        .get("https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest")
        .header("User-Agent", "Simple-Launcher/1.0")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API HTTP {}", resp.status()));
    }
    let release: serde_json::Value = resp.json().await.map_err(|e| format!("parse release: {}", e))?;
    let assets = release
        .get("assets")
        .and_then(|a| a.as_array())
        .ok_or("Release JSON sans champ 'assets'")?;

    // Pick Windows MSVC Portable (most compatible portable build)
    let asset_url = assets
        .iter()
        .find(|a| {
            let name = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
            name.contains("Windows-MSVC-Portable") && name.ends_with(".zip")
        })
        .and_then(|a| a.get("browser_download_url").and_then(|u| u.as_str()))
        .ok_or("Aucun build Windows MSVC Portable trouvé sur la dernière release Prism")?
        .to_string();

    // 2. Download with progress
    emit_progress(app, module_id, "downloading-prism", 0, 0);
    let temp_zip = std::env::temp_dir().join("simple-launcher-prism-portable.zip");

    let response = reqwest::get(&asset_url)
        .await
        .map_err(|e| format!("download Prism: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("download Prism HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);

    let mut file = fs::File::create(&temp_zip).await.map_err(|e| format!("create temp: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("chunk: {}", e))?;
        file.write_all(&chunk).await.map_err(|e| format!("write: {}", e))?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(100) {
            emit_progress(app, module_id, "downloading-prism", downloaded, total);
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    emit_progress(app, module_id, "downloading-prism", downloaded, total);

    // 3. Extract to %APPDATA%\com.simplelaunche.app\prism\
    emit_progress(app, module_id, "extracting-prism", 0, 0);
    let prism_dir = launcher_root(app)?.join("prism");
    if fs::try_exists(&prism_dir).await.unwrap_or(false) {
        fs::remove_dir_all(&prism_dir).await.map_err(|e| format!("clean prism dir: {}", e))?;
    }
    fs::create_dir_all(&prism_dir).await.map_err(|e| format!("mkdir prism: {}", e))?;

    let prism_dir_owned = prism_dir.clone();
    let temp_zip_owned = temp_zip.clone();
    tokio::task::spawn_blocking(move || extract_zip(&temp_zip_owned, &prism_dir_owned))
        .await
        .map_err(|e| format!("extract task: {}", e))??;

    let _ = fs::remove_file(&temp_zip).await;

    let prism_exe = prism_dir.join("prismlauncher.exe");
    if !fs::try_exists(&prism_exe).await.unwrap_or(false) {
        return Err(format!(
            "prismlauncher.exe introuvable après extraction dans {} — l'archive Prism a peut-être changé de structure",
            prism_dir.display()
        ));
    }

    Ok(prism_exe)
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {}", e))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {}: {}", i, e))?;
        let outpath = match entry.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue,
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| format!("mkdir {}: {}", outpath.display(), e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("create {}: {}", outpath.display(), e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("write {}: {}", outpath.display(), e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn mc_get_state(app: AppHandle, module_id: String) -> Result<Option<MinecraftState>, String> {
    let path = mc_state_path(&app, &module_id)?;
    if !fs::try_exists(&path).await.unwrap_or(false) {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).await.map_err(|e| e.to_string())?;
    let state: MinecraftState = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(state))
}

#[tauri::command]
pub async fn mc_install_modpack(
    app: AppHandle,
    module_id: String,
    project_id: u64,
    file_id: u64,
    api_key: String,
) -> Result<MinecraftState, String> {
    if api_key.trim().is_empty() {
        return Err("Clé API CurseForge manquante. Configure VITE_CURSEFORGE_API_KEY dans .env.local.".into());
    }

    // 0. Make sure Prism Launcher is available (auto-install our managed copy if missing)
    let prism_exe = ensure_prism_installed(&app, &module_id).await?;

    emit_progress(&app, &module_id, "resolving", 0, 0);

    let client = reqwest::Client::new();

    // 1a. Pre-check: fetch the file metadata to give a precise error if
    // distribution is disabled for THIS file (per-file flag, not per-project).
    let info_url = format!(
        "https://api.curseforge.com/v1/mods/{}/files/{}",
        project_id, file_id
    );
    let info_resp = client
        .get(&info_url)
        .header("Accept", "application/json")
        .header("x-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge API (file info): {}", e))?;
    if info_resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!(
            "CurseForge HTTP 404 — Project ID {} ou File ID {} introuvables. Re-vérifie dans le panel admin.",
            project_id, file_id
        ));
    }
    if info_resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Clé API CurseForge invalide. Régénère-la sur console.curseforge.com.".to_string());
    }
    if info_resp.status().is_success() {
        let info: serde_json::Value = info_resp
            .json()
            .await
            .map_err(|e| format!("parse file info: {}", e))?;
        let data = info.get("data");
        let allow = data
            .and_then(|d| d.get("allowModDistribution"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let display_name = data
            .and_then(|d| d.get("displayName"))
            .and_then(|v| v.as_str())
            .unwrap_or("(nom inconnu)");
        let release_type = data
            .and_then(|d| d.get("releaseType"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let release_label = match release_type {
            1 => "Release",
            2 => "Beta",
            3 => "Alpha",
            _ => "Inconnu",
        };
        if !allow {
            return Err(format!(
                "Le fichier `{}` (File ID {}) a `allowModDistribution: false` côté CurseForge — son auteur a désactivé la distribution par tiers pour CE fichier spécifique. Le réglage est par fichier, pas par projet : tu dois (1) activer Distribution dans Settings du projet sur curseforge.com, PUIS (2) uploader une NOUVELLE version, et enfin (3) mettre à jour le File ID dans le panel admin pour pointer sur la nouvelle version. Type de release actuel : {}.",
                display_name, file_id, release_label
            ));
        }
    }

    // 1b. Resolve download URL via CurseForge API
    let url = format!(
        "https://api.curseforge.com/v1/mods/{}/files/{}/download-url",
        project_id, file_id
    );
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .header("x-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge API: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(format!(
                "CurseForge a refusé le téléchargement (HTTP 403). C'est presque toujours parce que ce modpack a « Allow third-party distribution » désactivé sur CurseForge. Si c'est ton projet, va dans Settings → Distribution sur curseforge.com pour l'activer puis re-upload une nouvelle version du fichier (le réglage ne s'applique qu'aux uploads suivants)."
            ));
        }
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(format!(
                "CurseForge a renvoyé HTTP 404 — le Project ID ({}) ou le File ID ({}) sont introuvables. Re-vérifie dans le panel admin.",
                project_id, file_id
            ));
        }
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err("CurseForge HTTP 401 — la clé API est invalide ou révoquée. Régénère-la sur console.curseforge.com puis met-la à jour dans .env.local.".to_string());
        }
        return Err(format!("CurseForge API HTTP {}", status));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("parse JSON: {}", e))?;
    let download_url = body
        .get("data")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            "L'auteur du modpack a désactivé le téléchargement par tiers (champ `data` null dans la réponse CurseForge). Si c'est ton projet, active « Allow third-party distribution » sur curseforge.com et re-upload une version.".to_string()
        })?
        .to_string();

    // 2. Download zip with progress
    emit_progress(&app, &module_id, "downloading", 0, 0);
    let temp_zip = std::env::temp_dir().join(format!("simple-launcher-mc-{}-{}.zip", sanitize(&module_id), file_id));

    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| format!("download: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("download HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);

    let mut file = fs::File::create(&temp_zip).await.map_err(|e| format!("create temp: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("chunk: {}", e))?;
        file.write_all(&chunk).await.map_err(|e| format!("write: {}", e))?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(100) {
            emit_progress(&app, &module_id, "downloading", downloaded, total);
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    emit_progress(&app, &module_id, "downloading", downloaded, total);

    // 3. Read manifest.json from the zip to get the modpack name (= Prism instance name)
    emit_progress(&app, &module_id, "reading-manifest", 0, 0);
    let temp_zip_owned = temp_zip.clone();
    let instance_name = tokio::task::spawn_blocking(move || read_modpack_name(&temp_zip_owned))
        .await
        .map_err(|e| format!("manifest task: {}", e))??;

    // 4. Import into Prism Launcher (fire and forget — Prism shows its own progress UI)
    emit_progress(&app, &module_id, "importing", 0, 0);
    let import_status = Command::new(&prism_exe)
        .arg("--import")
        .arg(&temp_zip)
        .status()
        .await
        .map_err(|e| format!("prism --import: {}", e))?;
    if !import_status.success() {
        return Err(format!("Prism import code {:?}", import_status.code()));
    }

    let _ = fs::remove_file(&temp_zip).await;

    // 5. Save state
    let state_path = mc_state_path(&app, &module_id)?;
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let state = MinecraftState {
        instance_name: instance_name.clone(),
        file_id,
        imported_at: now_ms(),
    };
    fs::write(&state_path, serde_json::to_string_pretty(&state).unwrap())
        .await
        .map_err(|e| format!("write state: {}", e))?;

    emit_progress(&app, &module_id, "ready", 0, 0);
    Ok(state)
}

#[tauri::command]
pub async fn mc_launch(
    app: AppHandle,
    tracker: State<'_, McLaunchTracker>,
    discord: State<'_, DiscordRpc>,
    module_id: String,
    module_name: String,
    instance_name: String,
    server_address: Option<String>,
) -> Result<(), String> {
    let prism_exe = find_prism_path(&app)
        .await
        .ok_or_else(|| "Prism Launcher introuvable. Lance d'abord 'Installer le modpack'.".to_string())?;

    let mut cmd = Command::new(&prism_exe);
    cmd.arg("--launch").arg(&instance_name);
    if let Some(server) = server_address.as_deref().filter(|s| !s.is_empty()) {
        cmd.arg("--server").arg(server);
    }
    let mut child = cmd
        .kill_on_drop(false)
        .spawn()
        .map_err(|e| format!("spawn prism: {}", e))?;

    let started_at = now_ms();
    {
        let mut running = tracker.inner.running.lock().await;
        running.insert(module_id.clone());
    }
    let _ = app.emit(
        "module-launched",
        LaunchEvent {
            module_id: &module_id,
            module_name: &module_name,
            started_at,
        },
    );
    discord.arc().set_playing(&module_name).await;

    let tracker_arc = tracker.arc();
    let discord_arc = discord.arc();
    let module_id_owned = module_id.clone();
    let module_name_owned = module_name.clone();
    let app_owned = app.clone();
    tokio::spawn(async move {
        let _ = child.wait().await;
        let exited_at = now_ms();
        {
            let mut running = tracker_arc.running.lock().await;
            running.remove(&module_id_owned);
        }
        let _ = app_owned.emit(
            "module-exited",
            ExitEvent {
                module_id: module_id_owned.clone(),
                module_name: module_name_owned.clone(),
                started_at,
                exited_at,
                duration_ms: exited_at.saturating_sub(started_at),
            },
        );
        discord_arc.set_idle().await;
    });

    Ok(())
}

#[tauri::command]
pub async fn mc_uninstall(app: AppHandle, module_id: String) -> Result<(), String> {
    let state_path = mc_state_path(&app, &module_id)?;
    if fs::try_exists(&state_path).await.unwrap_or(false) {
        fs::remove_file(&state_path).await.map_err(|e| e.to_string())?;
    }
    // We don't touch the actual Prism instance — that stays under user control.
    Ok(())
}

fn emit_progress(app: &AppHandle, module_id: &str, phase: &'static str, downloaded: u64, total: u64) {
    let _ = app.emit(
        "module-progress",
        McProgress {
            module_id: module_id.to_string(),
            phase,
            bytes_downloaded: downloaded,
            bytes_total: total,
        },
    );
}

fn read_modpack_name(zip_path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(zip_path).map_err(|e| format!("open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {}", e))?;
    let mut entry = archive
        .by_name("manifest.json")
        .map_err(|_| "manifest.json absent du zip CurseForge".to_string())?;
    let mut buf = String::new();
    entry.read_to_string(&mut buf).map_err(|e| format!("read manifest: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&buf).map_err(|e| format!("parse manifest: {}", e))?;
    let name = json
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "Champ name manquant dans manifest.json".to_string())?
        .to_string();
    Ok(name)
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}
