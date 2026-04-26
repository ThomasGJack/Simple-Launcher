use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModuleState {
    pub version: String,
    #[serde(rename = "installedAt")]
    pub installed_at: u128,
}

#[derive(Debug, Serialize, Clone)]
struct DownloadProgress {
    #[serde(rename = "moduleId")]
    module_id: String,
    phase: &'static str,
    #[serde(rename = "bytesDownloaded")]
    bytes_downloaded: u64,
    #[serde(rename = "bytesTotal")]
    bytes_total: u64,
}

fn launcher_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| format!("app_data_dir: {}", e))
}

fn module_install_dir(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root(app)?.join("games").join(module_id))
}

fn module_state_path(app: &AppHandle, module_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root(app)?
        .join("state")
        .join(format!("{}.json", module_id)))
}

#[tauri::command]
pub async fn module_get_state(app: AppHandle, module_id: String) -> Result<Option<ModuleState>, String> {
    let path = module_state_path(&app, &module_id)?;
    if !fs::try_exists(&path).await.unwrap_or(false) {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).await.map_err(|e| e.to_string())?;
    let state: ModuleState = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(state))
}

#[tauri::command]
pub async fn module_install_or_update(
    app: AppHandle,
    module_id: String,
    version: String,
    download_url: String,
    sha256_expected: String,
) -> Result<(), String> {
    let install_dir = module_install_dir(&app, &module_id)?;
    let state_path = module_state_path(&app, &module_id)?;

    let temp_zip = std::env::temp_dir().join(format!(
        "simple-launcher-{}-{}.zip",
        sanitize(&module_id),
        sanitize(&version)
    ));

    emit_progress(&app, &module_id, "downloading", 0, 0);

    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| format!("download init failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("download HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);

    let mut file = fs::File::create(&temp_zip)
        .await
        .map_err(|e| format!("create temp zip: {}", e))?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download chunk: {}", e))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| format!("write chunk: {}", e))?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(100) {
            emit_progress(&app, &module_id, "downloading", downloaded, total);
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    emit_progress(&app, &module_id, "downloading", downloaded, total);

    let actual_hash = hex::encode(hasher.finalize());
    if !actual_hash.eq_ignore_ascii_case(&sha256_expected) {
        let _ = fs::remove_file(&temp_zip).await;
        return Err(format!(
            "SHA-256 mismatch — expected {}, got {}",
            sha256_expected, actual_hash
        ));
    }

    emit_progress(&app, &module_id, "extracting", 0, 0);

    if fs::try_exists(&install_dir).await.unwrap_or(false) {
        fs::remove_dir_all(&install_dir).await.map_err(|e| format!("clear install dir: {}", e))?;
    }
    fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| format!("create install dir: {}", e))?;

    let install_dir_owned = install_dir.clone();
    let temp_zip_owned = temp_zip.clone();
    tokio::task::spawn_blocking(move || extract_zip(&temp_zip_owned, &install_dir_owned))
        .await
        .map_err(|e| format!("extract task: {}", e))??;

    let _ = fs::remove_file(&temp_zip).await;

    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let installed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let state = ModuleState {
        version: version.clone(),
        installed_at,
    };
    fs::write(&state_path, serde_json::to_string_pretty(&state).unwrap())
        .await
        .map_err(|e| format!("write state: {}", e))?;

    emit_progress(&app, &module_id, "ready", 0, 0);
    Ok(())
}

#[tauri::command]
pub fn module_launch_hosted(
    app: AppHandle,
    module_id: String,
    executable: String,
) -> Result<(), String> {
    let install_dir = module_install_dir(&app, &module_id)?;
    let exe_path = install_dir.join(&executable);
    if !exe_path.exists() {
        return Err(format!("Exécutable introuvable : {}", exe_path.display()));
    }
    Command::new(&exe_path)
        .current_dir(&install_dir)
        .spawn()
        .map_err(|e| format!("spawn: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn module_launch_shortcut(
    executable_path: String,
    args: Option<Vec<String>>,
) -> Result<(), String> {
    let path = std::path::Path::new(&executable_path);
    if !path.exists() {
        return Err(format!("Chemin introuvable : {}", executable_path));
    }
    let mut cmd = Command::new(path);
    if let Some(args) = args {
        cmd.args(args);
    }
    if let Some(parent) = path.parent() {
        cmd.current_dir(parent);
    }
    cmd.spawn().map_err(|e| format!("spawn: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn module_uninstall(app: AppHandle, module_id: String) -> Result<(), String> {
    let install_dir = module_install_dir(&app, &module_id)?;
    let state_path = module_state_path(&app, &module_id)?;
    if fs::try_exists(&install_dir).await.unwrap_or(false) {
        fs::remove_dir_all(&install_dir).await.map_err(|e| e.to_string())?;
    }
    if fs::try_exists(&state_path).await.unwrap_or(false) {
        fs::remove_file(&state_path).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, module_id: &str, phase: &'static str, downloaded: u64, total: u64) {
    let _ = app.emit(
        "module-progress",
        DownloadProgress {
            module_id: module_id.to_string(),
            phase,
            bytes_downloaded: downloaded,
            bytes_total: total,
        },
    );
}

fn extract_zip(zip_path: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {}: {}", i, e))?;
        let outpath = match entry.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue, // path traversal — skip
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

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}
