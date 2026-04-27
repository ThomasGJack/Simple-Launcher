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
    /// Major Java version inferred from the modpack's MC version (8/17/21).
    /// `None` when unparseable. Stored locally and exposed to the UI so the
    /// detail page can show "Java 21 requis — Prism le téléchargera auto si
    /// pas trouvé" without re-parsing the manifest.
    #[serde(rename = "javaVersion", skip_serializing_if = "Option::is_none")]
    pub java_version: Option<u32>,
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

/// Public re-export of `find_prism_path` for use by the `backup` module —
/// keeps the rest of `find_prism_path` private to this file.
pub async fn find_prism_path_pub(app: &AppHandle) -> Option<PathBuf> {
    find_prism_path(app).await
}

/// Public re-export of `prism_data_dir`.
pub async fn prism_data_dir_pub(prism_exe: &Path) -> Result<PathBuf, String> {
    prism_data_dir(prism_exe).await
}

/// Public re-export of `sanitize_instance_name`.
pub fn sanitize_instance_name_pub(s: &str) -> String {
    sanitize_instance_name(s)
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

    // Make sure portable.txt exists so Prism stores its data next to the exe
    // (rather than in %APPDATA%) — this is critical so we know where to write
    // the instance dir in `setup_prism_instance_manually`.
    let portable_marker = prism_dir.join("portable.txt");
    if !fs::try_exists(&portable_marker).await.unwrap_or(false) {
        let _ = fs::write(&portable_marker, b"").await;
    }

    // Write a global Prism config that minimizes the launcher UI: hide the
    // console window during launch, only show it on error, minimize Prism
    // when MC starts, and quit after game stop. This makes our managed Prism
    // feel as native as possible (the user clicks JOUER → MC opens, no UI flash).
    write_managed_prism_config(&prism_dir).await;

    Ok(prism_exe)
}

/// Writes a `prismlauncher.cfg` file inside our managed portable install with
/// settings that make Prism's UI as discreet as possible. We only do this for
/// our managed copy — never touch a user's existing Prism install.
async fn write_managed_prism_config(prism_dir: &Path) {
    let cfg_path = prism_dir.join("prismlauncher.cfg");
    // If the user already tweaked the file, don't overwrite it.
    if fs::try_exists(&cfg_path).await.unwrap_or(false) {
        return;
    }
    let body = "[General]\n\
        ApplicationTheme=dark\n\
        ShowConsole=false\n\
        ShowConsoleOnError=true\n\
        AutoCloseConsole=true\n\
        MinimizeOnLaunch=true\n\
        CloseAfterLaunch=true\n\
        QuitAfterGameStop=false\n\
        InstSortMode=Name\n\
        Language=fr_FR\n";
    let _ = fs::write(&cfg_path, body).await;
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
    project_id: Option<u64>,
    file_id: u64,
    api_key: String,
    custom_zip_url: Option<String>,
    max_ram_mb: Option<u32>,
) -> Result<MinecraftState, String> {
    // 0. Make sure Prism Launcher is available (auto-install our managed copy if missing)
    let prism_exe = ensure_prism_installed(&app, &module_id).await?;

    let client = reqwest::Client::new();

    // Two paths:
    //  - "custom": customZipUrl provided → skip CurseForge API entirely
    //  - "curseforge": resolve the download URL via the CF API using project_id + file_id + api_key
    let download_url = if let Some(url) = custom_zip_url.as_deref().filter(|s| !s.is_empty()) {
        emit_progress(&app, &module_id, "resolving", 0, 0);
        url.to_string()
    } else {
        if api_key.trim().is_empty() {
            return Err("Clé API CurseForge manquante. Configure VITE_CURSEFORGE_API_KEY dans .env.local, ou héberge directement le .zip via le panel admin.".into());
        }
        let project_id = project_id.ok_or_else(|| "Project ID CurseForge manquant.".to_string())?;
        emit_progress(&app, &module_id, "resolving", 0, 0);
        resolve_curseforge_download_url(&client, project_id, file_id, &api_key).await?
    };

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

    // 3. Read manifest.json from the zip to get the modpack metadata
    //    (instance name + MC version + modloader for manual setup)
    emit_progress(&app, &module_id, "reading-manifest", 0, 0);
    let temp_zip_owned = temp_zip.clone();
    let manifest = tokio::task::spawn_blocking(move || read_modpack_manifest(&temp_zip_owned))
        .await
        .map_err(|e| format!("manifest task: {}", e))??;
    let instance_name = manifest.name.clone();

    // 4. Provision the Prism instance:
    //    - Manual mode: write instance.cfg + mmc-pack.json ourselves and copy
    //      the bundled mods/overrides directly. Prism never opens a window, no
    //      browser popup, no per-mod CurseForge fetch. The fat zip is the
    //      source of truth — any .jar that's in `overrides/mods/` (or `mods/`
    //      at the zip root) just gets copied into the Prism instance.
    //    - CurseForge mode: keep the existing `prismlauncher --import` flow,
    //      which lets Prism handle the per-mod CF download (with browser
    //      popups for opt-out mods). This path requires an internet roundtrip
    //      via Prism's UI — kept as a fallback.
    let is_manual = custom_zip_url.as_deref().filter(|s| !s.is_empty()).is_some();
    if is_manual {
        emit_progress(&app, &module_id, "extracting", 0, 0);
        let actual_name = setup_prism_instance_manually(
            &app,
            &module_id,
            &prism_exe,
            &temp_zip,
            &manifest,
            max_ram_mb,
        )
        .await?;
        // Prefer the on-disk instance name if it differs (sanitization).
        let _ = actual_name; // currently same as manifest.name — kept for future use
    } else {
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
        java_version: required_java_version(&manifest.minecraft_version),
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
    max_ram_mb: Option<u32>,
) -> Result<(), String> {
    let prism_exe = find_prism_path(&app)
        .await
        .ok_or_else(|| "Prism Launcher introuvable. Lance d'abord 'Installer le modpack'.".to_string())?;

    // Apply RAM override before launching — the admin may have bumped maxRamMb
    // since install time, in which case we silently rewrite the memory keys
    // in the instance.cfg so the next JVM start uses the new heap size.
    if let Err(err) = patch_instance_memory(&prism_exe, &instance_name, max_ram_mb).await {
        // Non-fatal: log it but still try to launch with whatever's in cfg.
        eprintln!("[mc_launch] RAM patch failed: {}", err);
    }

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

/// Parsed CurseForge modpack manifest. We only need a small subset for the
/// manual Prism instance setup, but we keep the full struct here so future
/// enhancements (e.g. version bookkeeping) can use it.
#[derive(Debug, Clone)]
struct ModpackManifest {
    /// `name` field from manifest.json — used as the Prism instance name.
    name: String,
    /// `minecraft.version` — feeds the `net.minecraft` component in mmc-pack.
    minecraft_version: String,
    /// `minecraft.modLoaders[primary].id` like `forge-47.2.0` — split into
    /// the Prism component UID + version when generating mmc-pack.
    modloader_id: String,
}

fn read_modpack_manifest(zip_path: &Path) -> Result<ModpackManifest, String> {
    use std::io::Read;
    let file = std::fs::File::open(zip_path).map_err(|e| format!("open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {}", e))?;
    let mut entry = archive
        .by_name("manifest.json")
        .map_err(|_| "manifest.json absent du zip — il faut un export CurseForge (File → Export Profile dans CurseForge desktop) à la racine du zip.".to_string())?;
    let mut buf = String::new();
    entry.read_to_string(&mut buf).map_err(|e| format!("read manifest: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&buf).map_err(|e| format!("parse manifest: {}", e))?;

    let name = json
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "Champ `name` manquant dans manifest.json".to_string())?
        .to_string();

    let mc = json
        .get("minecraft")
        .ok_or_else(|| "Section `minecraft` manquante dans manifest.json".to_string())?;

    let minecraft_version = mc
        .get("version")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "Version Minecraft manquante dans manifest.json (champ `minecraft.version`)".to_string())?
        .to_string();

    let loaders = mc
        .get("modLoaders")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Champ `minecraft.modLoaders` manquant dans manifest.json".to_string())?;
    let primary = loaders
        .iter()
        .find(|l| l.get("primary").and_then(|v| v.as_bool()).unwrap_or(false))
        .or_else(|| loaders.first())
        .ok_or_else(|| "Aucun mod loader trouvé dans manifest.json".to_string())?;
    let modloader_id = primary
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "ID du mod loader manquant dans manifest.json".to_string())?
        .to_string();

    Ok(ModpackManifest {
        name,
        minecraft_version,
        modloader_id,
    })
}

/// Maps a CurseForge modloader id (e.g. `forge-47.2.0`) to the corresponding
/// Prism `mmc-pack.json` component UID + the bare version string Prism wants.
///
/// Prism component UIDs (as of Prism 8.x, from their meta repository):
///   - net.minecraftforge          (Forge)
///   - net.fabricmc.fabric-loader  (Fabric)
///   - net.neoforged               (NeoForge)
///   - org.quiltmc.quilt-loader    (Quilt)
fn parse_modloader_id(id: &str) -> Result<(&'static str, String), String> {
    let (loader, version) = id
        .split_once('-')
        .ok_or_else(|| format!("Format de mod loader invalide dans manifest.json : « {} »", id))?;
    let uid = match loader.to_lowercase().as_str() {
        "forge" => "net.minecraftforge",
        "fabric" => "net.fabricmc.fabric-loader",
        "neoforge" => "net.neoforged",
        "quilt" => "org.quiltmc.quilt-loader",
        other => {
            return Err(format!(
                "Mod loader inconnu dans manifest.json : « {} » — supportés : forge, fabric, neoforge, quilt",
                other
            ))
        }
    };
    Ok((uid, version.to_string()))
}

/// Maps a Minecraft version string ("1.21.1", "1.18.2", …) to the major
/// Java version required to run it. Source: Mojang's official requirements
/// per release. Anything > 1.20.4 needs Java 21, 1.17–1.20.4 needs Java 17,
/// 1.16 and older accept Java 8. Returns `None` for unparseable versions
/// (in which case Prism's auto-Java picker takes over with safe defaults).
pub fn required_java_version(mc_version: &str) -> Option<u32> {
    let parts: Vec<&str> = mc_version.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let major: u32 = parts[0].parse().ok()?;
    let minor: u32 = parts[1].parse().ok()?;
    let patch: u32 = if parts.len() >= 3 {
        parts[2].split('-').next()?.parse().unwrap_or(0)
    } else {
        0
    };
    if major != 1 {
        return None; // Snapshot or future format
    }
    if minor >= 21 {
        return Some(21);
    }
    if minor == 20 && patch >= 5 {
        return Some(21);
    }
    if minor >= 17 {
        return Some(17);
    }
    Some(8)
}

/// Builds the contents of `instance.cfg` for a Prism instance. The flags here
/// keep Prism quasi-invisible during launch: console hidden, only popped on
/// error, auto-closed when the game exits cleanly.
///
/// When `max_ram_mb` is provided, also writes `OverrideMemory=true` along with
/// `MaxMemAlloc` (= the requested heap) and `MinMemAlloc` (= half the heap,
/// floored to 512 MiB minimum) so the modpack runs with the configured RAM.
fn build_instance_cfg(name: &str, max_ram_mb: Option<u32>) -> String {
    let memory_block = match max_ram_mb {
        Some(max) if max >= 512 => {
            // Minimum heap = half the max but at least 512 MiB. Avoids GC
            // thrashing on small allocations while keeping startup fast.
            let min = std::cmp::max(512u32, max / 2);
            format!(
                "OverrideMemory=true\n\
                MaxMemAlloc={}\n\
                MinMemAlloc={}\n\
                PermGen=256\n",
                max, min
            )
        }
        _ => "OverrideMemory=false\n".to_string(),
    };
    format!(
        "[General]\n\
        ConfigVersion=1.2\n\
        InstanceType=OneSix\n\
        iconKey=default\n\
        name={}\n\
        notes=Provisioned by Simple Launcher\n\
        totalTimePlayed=0\n\
        lastLaunchTime=0\n\
        OverrideConsole=true\n\
        ShowConsole=false\n\
        ShowConsoleOnError=true\n\
        AutoCloseConsole=true\n\
        OverrideJavaArgs=false\n\
        {}\
        OverrideWindow=false\n",
        name, memory_block
    )
}

/// Builds the JSON contents of `mmc-pack.json` for a Prism instance with the
/// Minecraft + modloader components inferred from the modpack manifest.
fn build_mmc_pack(manifest: &ModpackManifest) -> Result<serde_json::Value, String> {
    let (loader_uid, loader_version) = parse_modloader_id(&manifest.modloader_id)?;

    let mc_component = serde_json::json!({
        "important": true,
        "uid": "net.minecraft",
        "version": manifest.minecraft_version,
    });
    let loader_component = serde_json::json!({
        "uid": loader_uid,
        "version": loader_version,
    });

    Ok(serde_json::json!({
        "components": [mc_component, loader_component],
        "formatVersion": 1,
    }))
}

/// Rewrites the memory keys (`OverrideMemory`, `MaxMemAlloc`, `MinMemAlloc`,
/// `PermGen`) of an existing instance.cfg in place so a RAM change made by
/// the admin takes effect on the next launch — without forcing a full
/// reinstall of the modpack. If the cfg doesn't exist yet (e.g. instance was
/// never created), this is a no-op.
async fn patch_instance_memory(
    prism_exe: &Path,
    instance_name: &str,
    max_ram_mb: Option<u32>,
) -> Result<(), String> {
    let data_dir = prism_data_dir(prism_exe).await?;
    let cfg_path = data_dir
        .join("instances")
        .join(sanitize_instance_name(instance_name))
        .join("instance.cfg");
    if !fs::try_exists(&cfg_path).await.unwrap_or(false) {
        return Ok(()); // Nothing to patch, instance not yet created.
    }
    let original = fs::read_to_string(&cfg_path)
        .await
        .map_err(|e| format!("read instance.cfg: {}", e))?;

    // Strip any existing memory-related lines, then append the new block.
    let mut kept: Vec<&str> = Vec::with_capacity(original.lines().count());
    for line in original.lines() {
        let trim = line.trim_start();
        if trim.starts_with("OverrideMemory=")
            || trim.starts_with("MaxMemAlloc=")
            || trim.starts_with("MinMemAlloc=")
            || trim.starts_with("PermGen=")
        {
            continue;
        }
        kept.push(line);
    }
    let mut rebuilt = kept.join("\n");
    if !rebuilt.ends_with('\n') {
        rebuilt.push('\n');
    }
    match max_ram_mb {
        Some(max) if max >= 512 => {
            let min = std::cmp::max(512u32, max / 2);
            rebuilt.push_str(&format!(
                "OverrideMemory=true\nMaxMemAlloc={}\nMinMemAlloc={}\nPermGen=256\n",
                max, min
            ));
        }
        _ => {
            rebuilt.push_str("OverrideMemory=false\n");
        }
    }

    if rebuilt == original {
        return Ok(()); // No change → don't touch the file (preserves mtime).
    }
    fs::write(&cfg_path, rebuilt)
        .await
        .map_err(|e| format!("write instance.cfg: {}", e))?;
    Ok(())
}

/// Locates the Prism data directory (where `instances/` lives) for a given
/// `prismlauncher.exe` path. Detects portable mode by looking for `portable.txt`
/// next to the exe; otherwise falls back to the default Windows location at
/// `%APPDATA%\PrismLauncher`.
async fn prism_data_dir(prism_exe: &Path) -> Result<PathBuf, String> {
    let exe_dir = prism_exe
        .parent()
        .ok_or_else(|| "prismlauncher.exe sans dossier parent".to_string())?;
    let portable_marker = exe_dir.join("portable.txt");
    if fs::try_exists(&portable_marker).await.unwrap_or(false) {
        return Ok(exe_dir.to_path_buf());
    }
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "%APPDATA% indisponible — impossible de localiser le dossier Prism".to_string())?;
    Ok(PathBuf::from(appdata).join("PrismLauncher"))
}

/// Manually provisions a Prism instance from a CurseForge-format zip without
/// invoking `prismlauncher --import`. This bypasses Prism's UI entirely (no
/// progress dialog, no browser popups for opt-out mods) — the trade-off is
/// that the zip must be a "fat zip" with the actual mod `.jar` files bundled
/// inside `overrides/mods/` (or `mods/` at the zip root). Anything listed in
/// `manifest.files[]` is **ignored** since we have no way to fetch it without
/// the CurseForge API.
///
/// Steps:
///  1. Compute the Prism instances dir (handles portable + standard installs).
///  2. Wipe any previous instance with the same name (idempotent updates).
///  3. Write `instance.cfg` (with hidden console flags) and `mmc-pack.json`
///     (with Minecraft + modloader components from the manifest).
///  4. Extract everything in the zip (except `manifest.json` / `modlist.html`)
///     into `<instance>/minecraft/`, stripping the `overrides/` prefix when
///     present. So `overrides/mods/foo.jar` → `minecraft/mods/foo.jar`.
async fn setup_prism_instance_manually(
    app: &AppHandle,
    module_id: &str,
    prism_exe: &Path,
    zip_path: &Path,
    manifest: &ModpackManifest,
    max_ram_mb: Option<u32>,
) -> Result<String, String> {
    let instance_name = manifest.name.clone();

    // 1. Locate instances/<instance_name>/
    let data_dir = prism_data_dir(prism_exe).await?;
    let instances_dir = data_dir.join("instances");
    fs::create_dir_all(&instances_dir)
        .await
        .map_err(|e| format!("mkdir instances: {}", e))?;
    let instance_dir = instances_dir.join(sanitize_instance_name(&instance_name));
    let mc_dir = instance_dir.join("minecraft");

    // 2. Wipe any previous instance so an "update" overwrites cleanly. We
    // intentionally remove the whole instance dir (including the user's
    // custom configs) — the modpack zip is the source of truth.
    if fs::try_exists(&instance_dir).await.unwrap_or(false) {
        fs::remove_dir_all(&instance_dir)
            .await
            .map_err(|e| format!("clean instance dir: {}", e))?;
    }
    fs::create_dir_all(&mc_dir)
        .await
        .map_err(|e| format!("mkdir instance/minecraft: {}", e))?;

    // 3. Write instance.cfg + mmc-pack.json
    fs::write(
        instance_dir.join("instance.cfg"),
        build_instance_cfg(&instance_name, max_ram_mb),
    )
    .await
    .map_err(|e| format!("write instance.cfg: {}", e))?;
    let mmc = build_mmc_pack(manifest)?;
    fs::write(
        instance_dir.join("mmc-pack.json"),
        serde_json::to_string_pretty(&mmc).unwrap(),
    )
    .await
    .map_err(|e| format!("write mmc-pack.json: {}", e))?;

    // 4. Extract zip → <instance>/minecraft/
    emit_progress(app, module_id, "extracting", 0, 0);
    let zip_path_owned = zip_path.to_path_buf();
    let mc_dir_owned = mc_dir.clone();
    tokio::task::spawn_blocking(move || extract_modpack_into(&zip_path_owned, &mc_dir_owned))
        .await
        .map_err(|e| format!("extract task: {}", e))??;

    Ok(instance_name)
}

/// Extracts a CurseForge-format modpack zip into the Prism instance's
/// `minecraft/` directory. Skips CF metadata (`manifest.json`, `modlist.html`)
/// and strips the `overrides/` prefix so the instance ends up with the
/// expected layout (mods/, config/, resourcepacks/, …).
fn extract_modpack_into(zip_path: &Path, mc_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {}", e))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {}: {}", i, e))?;
        let raw_path = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };
        let raw_str = raw_path.to_string_lossy().replace('\\', "/");

        // Skip CurseForge metadata files at the zip root
        if raw_str == "manifest.json" || raw_str == "modlist.html" {
            continue;
        }

        // Strip `overrides/` prefix so contents land directly under minecraft/
        let rel = if let Some(stripped) = raw_str.strip_prefix("overrides/") {
            stripped.to_string()
        } else if raw_str == "overrides" || raw_str == "overrides/" {
            // Bare directory marker, nothing to do
            continue;
        } else {
            raw_str.clone()
        };
        if rel.is_empty() {
            continue;
        }

        let outpath = mc_dir.join(&rel);
        // Path traversal guard
        if !outpath.starts_with(mc_dir) {
            continue;
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("mkdir {}: {}", outpath.display(), e))?;
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

/// Sanitizes a modpack name into a filesystem-safe Prism instance directory
/// name. Prism itself accepts most characters, but Windows filesystems don't —
/// strip the usual reserved set.
fn sanitize_instance_name(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => out.push('_'),
            c if (c as u32) < 0x20 => out.push('_'),
            c => out.push(c),
        }
    }
    out.trim().trim_matches('.').to_string()
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}

/// Hits the CurseForge file-info endpoint and returns the direct downloadUrl.
/// Surfaces friendly errors for 401 / 403 / 404 plus the response body for
/// debugging.
async fn resolve_curseforge_download_url(
    client: &reqwest::Client,
    project_id: u64,
    file_id: u64,
    api_key: &str,
) -> Result<String, String> {
    let info_url = format!(
        "https://api.curseforge.com/v1/mods/{}/files/{}",
        project_id, file_id
    );
    let resp = client
        .get(&info_url)
        .header("Accept", "application/json")
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge API: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        let snippet = body_text.chars().take(500).collect::<String>();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(format!(
                "CurseForge HTTP 404 sur /mods/{}/files/{} — Project ID ou File ID introuvable. Réponse CF : {}",
                project_id, file_id, snippet
            ));
        }
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(format!("CurseForge HTTP 401 — clé API invalide. Réponse : {}", snippet));
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(format!(
                "CurseForge HTTP 403 sur /mods/{}/files/{} — l'API refuse la metadata. Cause typique : « Distribute on third-party launchers » désactivé au niveau projet, OU un mod inclus dans le modpack bloque la distribution. Solution alternative : exporte le modpack depuis CurseForge et upload-le directement via l'admin (option « Upload manuel »). Réponse CF : {}",
                project_id, file_id, snippet
            ));
        }
        return Err(format!(
            "CurseForge API HTTP {} sur /mods/{}/files/{} — Réponse : {}",
            status, project_id, file_id, snippet
        ));
    }

    let info: serde_json::Value = resp.json().await.map_err(|e| format!("parse file info: {}", e))?;
    let data = info.get("data");
    let display_name = data
        .and_then(|d| d.get("displayName"))
        .and_then(|v| v.as_str())
        .unwrap_or("(nom inconnu)")
        .to_string();
    let allow = data
        .and_then(|d| d.get("allowModDistribution"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let file_status = data
        .and_then(|d| d.get("fileStatus"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let status_label = match file_status {
        1 => "En traitement",
        2 => "Changements requis",
        3 => "En cours de revue",
        4 | 10 => "Approuvé",
        5 => "Rejeté",
        6 => "Malware détecté",
        7 => "Supprimé",
        11 => "Prêt pour revue",
        14 => "En attente de publication",
        _ => "?",
    };
    let url = data
        .and_then(|d| d.get("downloadUrl"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    match url {
        Some(u) if !u.is_empty() => Ok(u),
        _ => {
            if !allow {
                Err(format!(
                    "Le fichier « {} » (File ID {}) a `allowModDistribution: false` côté CurseForge. Status: {}. Solution alternative : exporte le modpack depuis CurseForge et upload-le via l'admin (option « Upload manuel »).",
                    display_name, file_id, status_label
                ))
            } else {
                Err(format!(
                    "Le fichier « {} » (File ID {}) autorise la distribution mais CurseForge n'a pas renvoyé d'URL. Status: {} (code {}). Attends la validation CF, ou utilise l'option « Upload manuel ».",
                    display_name, file_id, status_label, file_status
                ))
            }
        }
    }
}
