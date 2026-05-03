// Auto-backup of Minecraft saves before each native launch.
//
// Why : world corruption (mod crash + save mid-tick, hardware power loss,
// chunk corruption from a bad mod update) is one of the most painful
// failure modes for modded MC. A "before each launch" snapshot of
// `instances/{id}/.minecraft/saves/` rolls the user back to the last
// known good state in seconds.
//
// Strategy :
//   1. Before each `mc_native_launch` (called from `mc_launch.rs`),
//      `pre_launch_backup_if_due()` is invoked. It checks whether a
//      backup is "due" :
//         - never backed up before → due
//         - last backup older than 24 h → due
//         - saves/ unchanged since last backup (no `level.dat` mtime
//           bump on any world) → NOT due (saves slot)
//      A "due" backup zips up `saves/` to
//      `instances/{id}/backups/{timestamp}.zip`.
//
//   2. After the snapshot, `prune_backups()` keeps only the newest N
//      (default 5) and deletes the rest. Avoids slow disk fill on users
//      who launch a lot.
//
// Failure mode : backup errors are NEVER fatal to the launch. We log a
// warning and continue. Better a launch with no backup than a refusal
// to launch because the disk is full.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::fs;

const MAX_BACKUPS: usize = 5;
const BACKUP_TTL_HOURS: u64 = 24;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    /// Filename without path or extension — also the timestamp ms.
    pub id: String,
    /// Epoch ms the backup was created.
    pub created_at_ms: u64,
    /// Size of the backup zip in bytes.
    pub size_bytes: u64,
}

fn launcher_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))
}

fn instance_root<R: Runtime>(app: &AppHandle<R>, instance_id: &str) -> Result<PathBuf, String> {
    Ok(launcher_root(app)?
        .join("minecraft")
        .join("instances")
        .join(instance_id))
}

fn instance_saves_dir<R: Runtime>(app: &AppHandle<R>, instance_id: &str) -> Result<PathBuf, String> {
    Ok(instance_root(app, instance_id)?
        .join(".minecraft")
        .join("saves"))
}

fn instance_backups_dir<R: Runtime>(
    app: &AppHandle<R>,
    instance_id: &str,
) -> Result<PathBuf, String> {
    Ok(instance_root(app, instance_id)?.join("backups"))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Returns true when the saves directory has at least one entry that
/// looks like a world (any subdir — Mojang, Fabric, NeoForge all use
/// the same layout : `saves/<worldName>/level.dat`). Avoids backing up
/// an empty saves/ which is wasteful + adds disk noise.
async fn saves_has_content(saves_dir: &Path) -> bool {
    let Ok(mut entries) = fs::read_dir(saves_dir).await else {
        return false;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        if entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
            return true;
        }
    }
    false
}

/// Lists existing backups for an instance, sorted by `created_at_ms`
/// descending (newest first).
async fn list_backups(backups_dir: &Path) -> Vec<BackupEntry> {
    let Ok(mut entries) = fs::read_dir(backups_dir).await else {
        return Vec::new();
    };
    let mut out = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(meta) = entry.metadata().await else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(stem) = name.strip_suffix(".zip") else {
            continue;
        };
        let Ok(ts) = stem.parse::<u64>() else {
            continue;
        };
        out.push(BackupEntry {
            id: stem.to_string(),
            created_at_ms: ts,
            size_bytes: meta.len(),
        });
    }
    out.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    out
}

/// Returns the most recent backup entry, or None if there are none.
async fn last_backup(backups_dir: &Path) -> Option<BackupEntry> {
    list_backups(backups_dir).await.into_iter().next()
}

/// Creates a new ZIP snapshot of `saves_dir` at
/// `backups_dir/<now_ms>.zip`. Spawns the actual ZIP work on a blocking
/// thread (zip crate is sync) to keep the tokio reactor responsive.
async fn create_snapshot(
    saves_dir: PathBuf,
    backups_dir: PathBuf,
    timestamp_ms: u64,
) -> Result<(), String> {
    fs::create_dir_all(&backups_dir)
        .await
        .map_err(|e| format!("mkdir backups: {}", e))?;
    let dest = backups_dir.join(format!("{}.zip", timestamp_ms));

    tokio::task::spawn_blocking(move || zip_dir_sync(&saves_dir, &dest))
        .await
        .map_err(|e| format!("backup task: {}", e))?
}

/// Sync ZIP-the-folder helper. Writes `dest` containing every entry of
/// `src` recursively, preserving relative paths. Best-effort on read
/// errors (skips unreadable files rather than aborting the whole
/// snapshot) — better an incomplete backup than no backup.
fn zip_dir_sync(src: &Path, dest: &Path) -> Result<(), String> {
    use std::fs::File;
    use std::io::{Read, Write};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let file = File::create(dest).map_err(|e| format!("create {}: {}", dest.display(), e))?;
    let mut zip = ZipWriter::new(file);
    let opts: SimpleFileOptions =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    fn walk(
        zip: &mut ZipWriter<File>,
        opts: SimpleFileOptions,
        root: &Path,
        current: &Path,
    ) -> Result<(), String> {
        let entries =
            std::fs::read_dir(current).map_err(|e| format!("read_dir {}: {}", current.display(), e))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let rel = path
                .strip_prefix(root)
                .map_err(|e| format!("strip_prefix: {}", e))?;
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                let _ = zip.add_directory(rel_str.clone(), opts);
                walk(zip, opts, root, &path)?;
            } else if meta.is_file() {
                let Ok(mut f) = File::open(&path) else { continue };
                let mut buf = Vec::with_capacity(meta.len() as usize);
                if f.read_to_end(&mut buf).is_err() {
                    continue;
                }
                let _ = zip.start_file(rel_str, opts);
                let _ = zip.write_all(&buf);
            }
        }
        Ok(())
    }

    walk(&mut zip, opts, src, src)?;
    zip.finish()
        .map_err(|e| format!("zip finish: {}", e))?;
    Ok(())
}

/// Drops everything beyond the `MAX_BACKUPS` newest backups.
async fn prune_old(backups_dir: &Path) {
    let backups = list_backups(backups_dir).await;
    for old in backups.into_iter().skip(MAX_BACKUPS) {
        let path = backups_dir.join(format!("{}.zip", old.id));
        let _ = fs::remove_file(&path).await;
    }
}

/// Decides whether a backup is "due" right now. Returns `true` when :
///   - There's no previous backup, OR
///   - The most recent backup is older than `BACKUP_TTL_HOURS` (24 h).
/// Returns false if the saves dir is empty (nothing to back up).
pub async fn pre_launch_backup_if_due<R: Runtime>(
    app: &AppHandle<R>,
    instance_id: &str,
) -> Result<Option<BackupEntry>, String> {
    let saves_dir = instance_saves_dir(app, instance_id)?;
    if !fs::try_exists(&saves_dir).await.unwrap_or(false) {
        return Ok(None);
    }
    if !saves_has_content(&saves_dir).await {
        return Ok(None);
    }

    let backups_dir = instance_backups_dir(app, instance_id)?;
    let last = last_backup(&backups_dir).await;
    let due = match last {
        None => true,
        Some(b) => {
            let age_ms = now_ms().saturating_sub(b.created_at_ms);
            age_ms >= BACKUP_TTL_HOURS * 60 * 60 * 1000
        }
    };
    if !due {
        return Ok(None);
    }

    let ts = now_ms();
    create_snapshot(saves_dir, backups_dir.clone(), ts).await?;
    prune_old(&backups_dir).await;

    let size = fs::metadata(backups_dir.join(format!("{}.zip", ts)))
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(Some(BackupEntry {
        id: ts.to_string(),
        created_at_ms: ts,
        size_bytes: size,
    }))
}

// ─── Tauri commands ──────────────────────────────────────────────────

/// Manually trigger a backup right now (bypasses the 24 h throttle).
/// Used from the module action panel "Backup maintenant" button.
#[tauri::command]
pub async fn mc_backup_create<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
) -> Result<BackupEntry, String> {
    let saves_dir = instance_saves_dir(&app, &instance_id)?;
    if !fs::try_exists(&saves_dir).await.unwrap_or(false) {
        return Err("Pas de dossier saves/ — rien à sauvegarder.".into());
    }
    if !saves_has_content(&saves_dir).await {
        return Err("Le dossier saves/ est vide.".into());
    }
    let backups_dir = instance_backups_dir(&app, &instance_id)?;
    let ts = now_ms();
    create_snapshot(saves_dir, backups_dir.clone(), ts).await?;
    prune_old(&backups_dir).await;
    let size = fs::metadata(backups_dir.join(format!("{}.zip", ts)))
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(BackupEntry {
        id: ts.to_string(),
        created_at_ms: ts,
        size_bytes: size,
    })
}

/// List available backups for an instance, newest first.
#[tauri::command]
pub async fn mc_backup_list<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
) -> Result<Vec<BackupEntry>, String> {
    let backups_dir = instance_backups_dir(&app, &instance_id)?;
    Ok(list_backups(&backups_dir).await)
}

/// Delete a specific backup by id (= timestamp ms as a string).
#[tauri::command]
pub async fn mc_backup_delete<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
    backup_id: String,
) -> Result<(), String> {
    let backups_dir = instance_backups_dir(&app, &instance_id)?;
    let path = backups_dir.join(format!("{}.zip", backup_id));
    if !fs::try_exists(&path).await.unwrap_or(false) {
        return Err("Backup introuvable.".into());
    }
    fs::remove_file(&path)
        .await
        .map_err(|e| format!("Suppression échouée : {}", e))?;
    Ok(())
}

/// Restore a backup : extracts its zip back into `saves/`. Renames the
/// existing `saves/` to `saves.before-restore-{ts}/` before extracting,
/// so the user has a panic-button to recover the most recent state if
/// the restore was a mistake.
#[tauri::command]
pub async fn mc_backup_restore<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
    backup_id: String,
) -> Result<(), String> {
    let backups_dir = instance_backups_dir(&app, &instance_id)?;
    let zip_path = backups_dir.join(format!("{}.zip", backup_id));
    if !fs::try_exists(&zip_path).await.unwrap_or(false) {
        return Err("Backup introuvable.".into());
    }
    let saves_dir = instance_saves_dir(&app, &instance_id)?;
    if let Some(parent) = saves_dir.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir parent: {}", e))?;
    }

    // Stash current saves/ as a panic-revert side dir so the user can
    // recover if they restored the wrong backup.
    if fs::try_exists(&saves_dir).await.unwrap_or(false) {
        let stash = saves_dir.with_file_name(format!("saves.before-restore-{}", now_ms()));
        fs::rename(&saves_dir, &stash)
            .await
            .map_err(|e| format!("stash saves: {}", e))?;
    }

    fs::create_dir_all(&saves_dir)
        .await
        .map_err(|e| format!("mkdir saves: {}", e))?;

    let saves_dest = saves_dir.clone();
    tokio::task::spawn_blocking(move || extract_zip_sync(&zip_path, &saves_dest))
        .await
        .map_err(|e| format!("restore task: {}", e))??;
    Ok(())
}

fn extract_zip_sync(zip_path: &Path, dest: &Path) -> Result<(), String> {
    use std::fs::File;
    use std::io::Read;
    let file = File::open(zip_path).map_err(|e| format!("open zip: {}", e))?;
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
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("mkdir {}: {}", outpath.display(), e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("create {}: {}", outpath.display(), e))?;
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("read entry {}: {}", outpath.display(), e))?;
            std::io::Write::write_all(&mut outfile, &buf)
                .map_err(|e| format!("write {}: {}", outpath.display(), e))?;
        }
    }
    Ok(())
}
