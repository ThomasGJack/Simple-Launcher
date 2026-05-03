// Disk cache management — powers Settings → Téléchargements.
//
// The launcher accumulates several disk caches over time :
//
//   - `<APPDATA>/com.simplelauncher.app/minecraft/libraries/`
//     LWJGL natives, Forge / Fabric / NeoForge libs, ASM, all the
//     deps Mojang ships in the version manifest. Re-downloaded by
//     `mc_vanilla::install` on the next launch if missing.
//
//   - `<APPDATA>/com.simplelauncher.app/minecraft/assets/`
//     Vanilla MC assets — textures, sounds, lang files. ~500 MB per
//     MC version. Re-fetched by `mc_vanilla::install_assets` on demand.
//
//   - `<APPDATA>/com.simplelauncher.app/minecraft/runtimes/`
//     Adoptium Temurin JREs auto-installed by `mc_java`. The launcher
//     re-installs the right major version when a module needs it.
//
//   - `<APPDATA>/Local/Temp/simple-launcher-*` (and similar tmp dirs)
//     Modpack staging zips, VC++ redist installers, intermediate ZIPs.
//     These should clean themselves up but a crash mid-flight can
//     leave them orphan.
//
// `cache_calculate_size` walks each of these and returns a snapshot.
// `cache_purge` deletes a specific category. Saves and instances are
// NEVER touched — only shared / re-downloadable artifacts.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheSnapshot {
    /// Size in bytes of `minecraft/libraries/`.
    #[serde(rename = "mc-libraries")]
    pub mc_libraries: u64,
    /// Size in bytes of `minecraft/assets/`.
    #[serde(rename = "mc-assets")]
    pub mc_assets: u64,
    /// Size in bytes of `minecraft/runtimes/`.
    #[serde(rename = "mc-runtimes")]
    pub mc_runtimes: u64,
    /// Size in bytes of all stale temp dirs (`%TEMP%/simple-launcher-*`,
    /// `%TEMP%/simple-launcher-vcredist`, etc.).
    #[serde(rename = "mc-temp")]
    pub mc_temp: u64,
    pub total: u64,
    /// Wall-clock ms it took to compute. Surface in UI so the admin
    /// knows roughly how long to wait on next refresh.
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

fn launcher_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))
}

/// Recursively sums file sizes under `path`. Returns 0 if the path
/// doesn't exist or isn't readable. Intentionally swallows errors so a
/// corrupted single sub-tree doesn't kill the whole calculation.
fn dir_size_sync(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    let mut total: u64 = 0;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            total = total.saturating_add(dir_size_sync(&entry.path()));
        } else if meta.is_file() {
            total = total.saturating_add(meta.len());
        }
    }
    total
}

/// Lists all the launcher-related temp dirs in `%TEMP%`. We use a
/// prefix scan rather than hardcoding paths because the runtime-deps
/// installer + future code paths might create more.
fn list_temp_dirs() -> Vec<PathBuf> {
    let temp = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&temp) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let s = name.to_string_lossy();
        if s.starts_with("simple-launcher") {
            out.push(entry.path());
        }
    }
    out
}

#[tauri::command]
pub async fn cache_calculate_size<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CacheSnapshot, String> {
    let t0 = std::time::Instant::now();
    let root = launcher_root(&app)?;

    // Heavy disk I/O — punt to a blocking task to keep the tokio
    // reactor + the WebView's frame loop responsive while we walk
    // potentially several gigs of files.
    let snapshot = tokio::task::spawn_blocking(move || {
        let libs = dir_size_sync(&root.join("minecraft").join("libraries"));
        let assets = dir_size_sync(&root.join("minecraft").join("assets"));
        let runtimes = dir_size_sync(&root.join("minecraft").join("runtimes"));
        let temp_total: u64 = list_temp_dirs()
            .iter()
            .map(|p| dir_size_sync(p))
            .sum();
        CacheSnapshot {
            mc_libraries: libs,
            mc_assets: assets,
            mc_runtimes: runtimes,
            mc_temp: temp_total,
            total: libs
                .saturating_add(assets)
                .saturating_add(runtimes)
                .saturating_add(temp_total),
            duration_ms: 0,
        }
    })
    .await
    .map_err(|e| format!("calc task: {}", e))?;

    Ok(CacheSnapshot {
        duration_ms: t0.elapsed().as_millis() as u64,
        ..snapshot
    })
}

#[tauri::command]
pub async fn cache_purge<R: Runtime>(
    app: AppHandle<R>,
    category: String,
) -> Result<(), String> {
    let root = launcher_root(&app)?;

    let target: Option<PathBuf> = match category.as_str() {
        "mc-libraries" => Some(root.join("minecraft").join("libraries")),
        "mc-assets" => Some(root.join("minecraft").join("assets")),
        "mc-runtimes" => Some(root.join("minecraft").join("runtimes")),
        "mc-temp" => None, // handled below — multiple paths
        other => return Err(format!("Catégorie inconnue : {}", other)),
    };

    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        match target {
            Some(path) => {
                if path.exists() {
                    std::fs::remove_dir_all(&path)
                        .map_err(|e| format!("rm {}: {}", path.display(), e))?;
                }
            }
            None => {
                // mc-temp branch : enumerate + remove each launcher temp
                // dir individually. Best-effort — any single failure is
                // logged but doesn't abort the whole purge.
                for path in list_temp_dirs() {
                    if let Err(err) = std::fs::remove_dir_all(&path) {
                        eprintln!(
                            "[cache] failed to remove {}: {}",
                            path.display(),
                            err
                        );
                    }
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("purge task: {}", e))?;

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn dir_size_returns_zero_for_missing_path() {
        let path = std::env::temp_dir().join("simple-launcher-test-nonexistent-xyz");
        assert_eq!(dir_size_sync(&path), 0);
    }

    #[test]
    fn dir_size_sums_files_recursively() {
        let dir = std::env::temp_dir().join(format!(
            "simple-launcher-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_micros())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).unwrap();
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(dir.join("a.txt"), b"0123456789").unwrap(); // 10 B
        fs::write(sub.join("b.txt"), b"abcde").unwrap(); // 5 B
        assert_eq!(dir_size_sync(&dir), 15);
        let _ = fs::remove_dir_all(&dir);
    }
}
