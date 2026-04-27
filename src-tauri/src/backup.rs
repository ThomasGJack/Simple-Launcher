//! Minecraft instance backup / restore — zips the user-data subset of a
//! Prism instance (worlds, configs, screenshots, resourcepacks, shaderpacks)
//! and uploads it to Firebase Storage via the REST API. The mod jars and
//! mmc-pack.json are excluded — they're re-creatable from the modpack zip,
//! and including them would balloon the backup to hundreds of MB unnecessarily.
//!
//! Two commands exposed to the frontend:
//!   - `mc_backup_save`    : zip + upload, returns {url, size, ts}
//!   - `mc_restore_backup` : download + extract over the existing instance

use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::fs;

/// Sub-directories we include in a backup. Anything else (mods, libraries,
/// natives) is reproducible from the modpack source so we skip it.
const BACKED_UP_SUBDIRS: &[&str] = &[
    "saves",
    "config",
    "screenshots",
    "resourcepacks",
    "shaderpacks",
    "mods/config", // some mods stash configs here
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupMetadata {
    pub url: String,
    #[serde(rename = "downloadToken")]
    pub download_token: Option<String>,
    pub size: u64,
    pub ts: u128,
    #[serde(rename = "moduleId")]
    pub module_id: String,
    /// Server-assigned name in storage (e.g. `users/uid/minecraftBackups/abc/123.zip`)
    #[serde(rename = "storagePath")]
    pub storage_path: String,
}

/// Zips the user-data subset of a Prism instance, uploads it to Firebase
/// Storage at `users/{uid}/minecraftBackups/{moduleId}/{ts}.zip` via the
/// REST API (auth header = `Firebase {idToken}` provided by the frontend),
/// and returns metadata for storing in Firestore.
#[tauri::command]
pub async fn mc_backup_save(
    app: AppHandle,
    module_id: String,
    instance_name: String,
    bucket: String,
    id_token: String,
    uid: String,
) -> Result<BackupMetadata, String> {
    if bucket.trim().is_empty() {
        return Err("Bucket Firebase Storage manquant".into());
    }
    if id_token.trim().is_empty() {
        return Err("Token d'authentification manquant".into());
    }

    // 1. Locate the Prism instance dir
    let prism_exe = crate::minecraft::find_prism_path_pub(&app)
        .await
        .ok_or_else(|| "Prism Launcher introuvable. Installe le modpack d'abord.".to_string())?;
    let data_dir = crate::minecraft::prism_data_dir_pub(&prism_exe).await?;
    let instance_dir = data_dir
        .join("instances")
        .join(crate::minecraft::sanitize_instance_name_pub(&instance_name));
    let mc_dir = instance_dir.join("minecraft");
    if !fs::try_exists(&mc_dir).await.unwrap_or(false) {
        return Err(format!(
            "Instance Prism introuvable : {} (le modpack n'est peut-être pas installé)",
            mc_dir.display()
        ));
    }

    // 2. Zip the backup subdirs to a temp file
    let ts: u128 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_zip = std::env::temp_dir().join(format!("simple-launcher-backup-{}-{}.zip", sanitize(&module_id), ts));
    let mc_dir_owned = mc_dir.clone();
    let temp_zip_owned = temp_zip.clone();
    let zipped_size = tokio::task::spawn_blocking(move || zip_instance_dirs(&mc_dir_owned, &temp_zip_owned))
        .await
        .map_err(|e| format!("zip task: {}", e))??;

    // 3. Upload to Firebase Storage via REST
    //    Endpoint: https://firebasestorage.googleapis.com/v0/b/{bucket}/o?uploadType=media&name={url-encoded-path}
    //    Header: Authorization: Firebase {idToken}
    let storage_path = format!("users/{}/minecraftBackups/{}/{}.zip", uid, module_id, ts);
    let url_encoded = url_encode(&storage_path);
    let upload_url = format!(
        "https://firebasestorage.googleapis.com/v0/b/{}/o?uploadType=media&name={}",
        bucket, url_encoded
    );
    let bytes = fs::read(&temp_zip).await.map_err(|e| format!("read zip: {}", e))?;
    let resp = reqwest::Client::new()
        .post(&upload_url)
        .header("Authorization", format!("Firebase {}", id_token))
        .header("Content-Type", "application/zip")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("upload: {}", e))?;
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        let snippet = body.chars().take(400).collect::<String>();
        let _ = fs::remove_file(&temp_zip).await;
        return Err(format!("Firebase upload HTTP error : {}", snippet));
    }
    // Response JSON contains `downloadTokens` — needed to construct the
    // public download URL the same way Firebase Storage SDK does it.
    let payload: serde_json::Value = resp.json().await.map_err(|e| format!("parse upload resp: {}", e))?;
    let download_token = payload
        .get("downloadTokens")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let public_url = if let Some(token) = &download_token {
        format!(
            "https://firebasestorage.googleapis.com/v0/b/{}/o/{}?alt=media&token={}",
            bucket, url_encoded, token
        )
    } else {
        format!(
            "https://firebasestorage.googleapis.com/v0/b/{}/o/{}?alt=media",
            bucket, url_encoded
        )
    };

    // 4. Cleanup temp file
    let _ = fs::remove_file(&temp_zip).await;

    Ok(BackupMetadata {
        url: public_url,
        download_token,
        size: zipped_size,
        ts,
        module_id,
        storage_path,
    })
}

/// Downloads a backup zip from a Firebase Storage URL and extracts the
/// content over the existing Prism instance's `minecraft/` directory. Wipes
/// the existing `saves/` first so dangling worlds from after the backup
/// don't survive (the user explicitly chose to restore — destructive intent).
#[tauri::command]
pub async fn mc_restore_backup(
    app: AppHandle,
    instance_name: String,
    download_url: String,
) -> Result<(), String> {
    if download_url.trim().is_empty() {
        return Err("URL de backup manquante".into());
    }
    let prism_exe = crate::minecraft::find_prism_path_pub(&app)
        .await
        .ok_or_else(|| "Prism Launcher introuvable.".to_string())?;
    let data_dir = crate::minecraft::prism_data_dir_pub(&prism_exe).await?;
    let instance_dir = data_dir
        .join("instances")
        .join(crate::minecraft::sanitize_instance_name_pub(&instance_name));
    let mc_dir = instance_dir.join("minecraft");
    if !fs::try_exists(&mc_dir).await.unwrap_or(false) {
        return Err(format!(
            "Instance Prism introuvable : {} (installe le modpack d'abord)",
            mc_dir.display()
        ));
    }

    // Download to temp
    let temp_zip = std::env::temp_dir().join(format!("simple-launcher-restore-{}.zip", now_ms()));
    let resp = reqwest::get(&download_url)
        .await
        .map_err(|e| format!("download backup: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("download HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("download body: {}", e))?;
    fs::write(&temp_zip, &bytes)
        .await
        .map_err(|e| format!("write temp: {}", e))?;

    // Wipe the saves dir + extract over
    let saves_dir = mc_dir.join("saves");
    if fs::try_exists(&saves_dir).await.unwrap_or(false) {
        fs::remove_dir_all(&saves_dir)
            .await
            .map_err(|e| format!("wipe saves: {}", e))?;
    }

    let mc_dir_owned = mc_dir.clone();
    let temp_zip_owned = temp_zip.clone();
    tokio::task::spawn_blocking(move || extract_backup_zip(&temp_zip_owned, &mc_dir_owned))
        .await
        .map_err(|e| format!("extract task: {}", e))??;

    let _ = fs::remove_file(&temp_zip).await;
    Ok(())
}

// ---------------------------------------------------------------------------
//                              IMPLEMENTATION
// ---------------------------------------------------------------------------

fn zip_instance_dirs(mc_dir: &Path, output: &Path) -> Result<u64, String> {
    use std::fs::File;
    let file = File::create(output).map_err(|e| format!("create zip: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));

    for sub in BACKED_UP_SUBDIRS {
        let dir = mc_dir.join(sub);
        if !dir.is_dir() {
            continue;
        }
        recursively_add_to_zip(&mut zip, &dir, &dir, sub, &opts)?;
    }
    zip.finish().map_err(|e| format!("finalize zip: {}", e))?;
    let size = std::fs::metadata(output)
        .map(|m| m.len())
        .map_err(|e| format!("stat zip: {}", e))?;
    Ok(size)
}

fn recursively_add_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base: &Path,
    dir: &Path,
    prefix: &str,
    opts: &zip::write::SimpleFileOptions,
) -> Result<(), String> {
    use std::io::Read;
    for entry in std::fs::read_dir(dir).map_err(|e| format!("readdir {}: {}", dir.display(), e))? {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let path = entry.path();
        let name = path
            .strip_prefix(base)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| entry.file_name().to_string_lossy().into_owned());
        let zip_entry_name = format!("{}/{}", prefix, name);
        if path.is_dir() {
            recursively_add_to_zip(zip, base, &path, prefix, opts)?;
        } else {
            zip.start_file(&zip_entry_name, *opts)
                .map_err(|e| format!("zip start: {}", e))?;
            let mut f = std::fs::File::open(&path)
                .map_err(|e| format!("open {}: {}", path.display(), e))?;
            let mut buf = Vec::with_capacity(8192);
            f.read_to_end(&mut buf)
                .map_err(|e| format!("read {}: {}", path.display(), e))?;
            zip.write_all(&buf)
                .map_err(|e| format!("zip write: {}", e))?;
        }
    }
    Ok(())
}

fn extract_backup_zip(zip_path: &Path, mc_dir: &Path) -> Result<(), String> {
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
        let out_path = mc_dir.join(&raw_path);
        if !out_path.starts_with(mc_dir) {
            // path traversal guard
            continue;
        }
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("mkdir {}: {}", out_path.display(), e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("create {}: {}", out_path.display(), e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("write {}: {}", out_path.display(), e))?;
        }
    }
    Ok(())
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn url_encode(s: &str) -> String {
    // Manual percent-encoding for the path portion of a Firebase Storage URL.
    // `name` parameter must encode `/` as `%2F`.
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        let c = byte as char;
        if c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-') {
            out.push(c);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", byte));
        }
    }
    out
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Convenience helpers to expose private functions of the minecraft module
/// without making them all `pub` directly (keeps the surface narrow).
pub mod glue {
    // Re-exports defined in minecraft.rs via wrapper functions
}
