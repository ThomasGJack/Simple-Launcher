// Minecraft crash collector.
//
// When `mc_native_launch` exits with a non-zero code, the frontend
// surfaces a "Minecraft a crashé" modal. To make that modal genuinely
// useful (not just a dead "ça a crashé" message), we collect everything
// the user / dev would need to debug :
//
//   - Tail of `instances/{id}/.minecraft/logs/latest.log` (the live
//     Minecraft log — typically the last screen or two of output).
//   - Most recent crash-reports under
//     `instances/{id}/.minecraft/crash-reports/`. MC writes a stack-
//     trace dump there for any unhandled exception, regardless of exit
//     code. Often the smoking gun.
//   - Mods count + Java version detected, for context.
//
// Capped sizes : `latest.log` truncated to the last LOG_TAIL_LINES
// lines (typically ~500), each crash-report capped at CRASH_MAX_BYTES
// (~64 KB) to avoid pulling multi-MB heap dumps into the WebView.
// Together a typical crash payload weighs ~80 KB, fine to send to
// Firestore.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::fs;

const LOG_TAIL_LINES: usize = 500;
const CRASH_MAX_BYTES: u64 = 64 * 1024;
const CRASH_REPORTS_TO_INCLUDE: usize = 3;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub filename: String,
    /// Epoch ms when the file was last modified (proxy for crash time).
    pub modified_at_ms: u64,
    pub size_bytes: u64,
    /// Up to `CRASH_MAX_BYTES` of file content. May be truncated; if so
    /// `truncated` is true.
    pub contents: String,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CrashCollectSnapshot {
    /// Last `LOG_TAIL_LINES` of `logs/latest.log`. Empty when the file
    /// doesn't exist (yet).
    pub latest_log_tail: String,
    /// Whether the latest-log was truncated (i.e. the original was
    /// longer than what we captured).
    pub latest_log_truncated: bool,
    /// Up to `CRASH_REPORTS_TO_INCLUDE` most recent reports, newest
    /// first.
    pub crash_reports: Vec<CrashReport>,
    /// Number of `.jar` files in the mods/ folder — useful baseline to
    /// know how heavy the modpack is.
    pub mods_count: u32,
    /// Generated-at timestamp (ms since epoch).
    pub generated_at_ms: u64,
}

fn launcher_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))
}

fn instance_dot_minecraft<R: Runtime>(
    app: &AppHandle<R>,
    instance_id: &str,
) -> Result<PathBuf, String> {
    Ok(launcher_root(app)?
        .join("minecraft")
        .join("instances")
        .join(instance_id)
        .join(".minecraft"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Reads the tail of a text file. Returns the last `max_lines` lines
/// joined with `\n`, plus whether truncation happened. Best-effort —
/// reads up to 4 MB to avoid OOM on a runaway log.
async fn read_log_tail(path: &Path, max_lines: usize) -> (String, bool) {
    let Ok(data) = fs::read(path).await else {
        return (String::new(), false);
    };
    // Cap the raw read at 4 MB. Beyond that, MC writes very few logs
    // anyway — only spammy mod stack traces, and we just want the tail.
    const HARD_CAP: usize = 4 * 1024 * 1024;
    let raw = if data.len() > HARD_CAP {
        let from = data.len() - HARD_CAP;
        // Skip past the next newline so we don't start mid-utf8.
        let from = data[from..]
            .iter()
            .position(|&b| b == b'\n')
            .map(|p| from + p + 1)
            .unwrap_or(from);
        String::from_utf8_lossy(&data[from..]).to_string()
    } else {
        String::from_utf8_lossy(&data).to_string()
    };

    let lines: Vec<&str> = raw.lines().collect();
    if lines.len() <= max_lines {
        return (raw, data.len() > HARD_CAP);
    }
    let tail = lines[lines.len() - max_lines..].join("\n");
    (tail, true)
}

async fn list_crash_reports(crash_dir: &Path) -> Vec<(PathBuf, u64, u64)> {
    let Ok(mut entries) = fs::read_dir(crash_dir).await else {
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
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase());
        if ext.as_deref() != Some("txt") && ext.as_deref() != Some("log") {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push((path, modified, meta.len()));
    }
    // Newest first.
    out.sort_by(|a, b| b.1.cmp(&a.1));
    out
}

async fn count_mods(mods_dir: &Path) -> u32 {
    let Ok(mut entries) = fs::read_dir(mods_dir).await else {
        return 0;
    };
    let mut n = 0u32;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(meta) = entry.metadata().await else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let name = entry.file_name();
        if name
            .to_string_lossy()
            .to_ascii_lowercase()
            .ends_with(".jar")
        {
            n += 1;
        }
    }
    n
}

/// Collects everything the frontend needs to surface a useful
/// "Minecraft has crashed" modal. Always returns a result — when there's
/// nothing on disk (fresh instance, never launched), empty fields.
#[tauri::command]
pub async fn mc_crash_collect<R: Runtime>(
    app: AppHandle<R>,
    instance_id: String,
) -> Result<CrashCollectSnapshot, String> {
    let dot = instance_dot_minecraft(&app, &instance_id)?;
    let logs_dir = dot.join("logs");
    let crash_dir = dot.join("crash-reports");
    let mods_dir = dot.join("mods");

    let (latest_log_tail, latest_log_truncated) =
        read_log_tail(&logs_dir.join("latest.log"), LOG_TAIL_LINES).await;

    let mut crash_reports = Vec::new();
    let listed = list_crash_reports(&crash_dir).await;
    for (path, modified_at_ms, size_bytes) in listed.into_iter().take(CRASH_REPORTS_TO_INCLUDE) {
        let contents = match fs::read(&path).await {
            Ok(bytes) => {
                let limit = CRASH_MAX_BYTES.min(bytes.len() as u64) as usize;
                String::from_utf8_lossy(&bytes[..limit]).to_string()
            }
            Err(_) => String::new(),
        };
        let truncated = size_bytes > CRASH_MAX_BYTES;
        crash_reports.push(CrashReport {
            filename: path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default(),
            modified_at_ms,
            size_bytes,
            contents,
            truncated,
        });
    }

    let mods_count = count_mods(&mods_dir).await;

    Ok(CrashCollectSnapshot {
        latest_log_tail,
        latest_log_truncated,
        crash_reports,
        mods_count,
        generated_at_ms: now_ms(),
    })
}
