// Local-file logger. Each launcher session writes a plain-text `.sl_logs`
// file under `<APPDATA>/Simple Launcher/logs/`. The frontend appends lines
// via `logs_append`, periodically reads the current file via `logs_read`
// to upload it to Firebase Storage, and rotates orphaned previous-session
// files via `logs_take_orphans` at startup.
//
// Files are named `session-<id>-<startedAt>.log` so the upload path on
// Storage stays unique per launcher session.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use tokio::fs::{self, File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

/// In-memory state tracking which session-file is currently being written
/// to. Behind a Mutex because multiple async tasks may try to append in
/// parallel.
pub struct LogFileState {
    /// Filesystem path of the active session's log file. Lazy-initialized
    /// on the first append from the frontend.
    inner: Mutex<Option<ActiveFile>>,
}

struct ActiveFile {
    /// Absolute path of the active log file. Currently informational —
    /// the open `File` handle is what we actually write to — but kept
    /// so a future "rotate" command can rename in place.
    #[allow(dead_code)]
    path: PathBuf,
    file_name: String,
}

impl LogFileState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanFile {
    /// File name without the directory prefix — used as the Storage key.
    pub file_name: String,
    /// Full content of the orphaned log file (UTF-8 text). Frontend uploads
    /// this then asks us to delete it via `logs_delete`.
    pub content: String,
}

fn logs_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {}", e))?;
    let dir = base.join("logs");
    Ok(dir)
}

async fn ensure_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("create logs dir failed: {}", e))
}

/// Initializes (if needed) the active session log file and appends a line
/// to it. The file name is provided by the frontend so it can match the
/// logger's session id, keeping client/server timestamps consistent.
#[tauri::command]
pub async fn logs_append<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, LogFileState>,
    file_name: String,
    line: String,
) -> Result<(), String> {
    let dir = logs_dir(&app)?;
    ensure_dir(&dir).await?;
    let path = dir.join(&file_name);

    let mut active = state.inner.lock().await;
    let needs_init = match active.as_ref() {
        Some(a) => a.file_name != file_name,
        None => true,
    };
    if needs_init {
        *active = Some(ActiveFile {
            path: path.clone(),
            file_name: file_name.clone(),
        });
    }
    drop(active);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
        .map_err(|e| format!("open logs file failed: {}", e))?;
    let mut data = line.into_bytes();
    if !data.ends_with(b"\n") {
        data.push(b'\n');
    }
    file.write_all(&data)
        .await
        .map_err(|e| format!("write logs file failed: {}", e))?;
    file.flush()
        .await
        .map_err(|e| format!("flush logs file failed: {}", e))?;
    Ok(())
}

/// Returns the current session's log file content as a UTF-8 string.
/// Used by the periodic uploader and the manual "send my logs now" button.
#[tauri::command]
pub async fn logs_read<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
) -> Result<String, String> {
    let dir = logs_dir(&app)?;
    let path = dir.join(&file_name);
    if !path.exists() {
        return Ok(String::new());
    }
    let bytes = fs::read(&path)
        .await
        .map_err(|e| format!("read logs file failed: {}", e))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

/// Lists every log file in the directory that DOESN'T match the supplied
/// "current session" file name — these are orphans from previous launches
/// that never got uploaded (crash, no internet, etc.). Returns name +
/// content for each. Frontend uploads them then calls `logs_delete`.
#[tauri::command]
pub async fn logs_take_orphans<R: Runtime>(
    app: AppHandle<R>,
    current_file_name: String,
) -> Result<Vec<OrphanFile>, String> {
    let dir = logs_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = fs::read_dir(&dir)
        .await
        .map_err(|e| format!("read_dir failed: {}", e))?;
    let mut out = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("read_dir entry failed: {}", e))?
    {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == current_file_name {
            continue;
        }
        if !name.ends_with(".log") {
            continue;
        }
        match fs::read(entry.path()).await {
            Ok(bytes) => {
                out.push(OrphanFile {
                    file_name: name,
                    content: String::from_utf8_lossy(&bytes).to_string(),
                });
            }
            Err(e) => eprintln!("[log_file] failed to read orphan {}: {}", name, e),
        }
    }
    Ok(out)
}

/// Deletes a single log file by name from the local logs directory.
/// Called by the frontend after a successful Storage upload of an orphan
/// (or when truncating the current file post-upload).
#[tauri::command]
pub async fn logs_delete<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
) -> Result<(), String> {
    let dir = logs_dir(&app)?;
    let path = dir.join(&file_name);
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path)
        .await
        .map_err(|e| format!("remove failed: {}", e))?;
    Ok(())
}

/// Returns the absolute path of the logs directory. Useful for showing a
/// "Reveal in Explorer" link in the settings page.
#[tauri::command]
pub async fn logs_dir_path<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let dir = logs_dir(&app)?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Fetches a remote URL (typically a Firebase Storage download URL) and
/// returns the body as UTF-8 text. Done in Rust because Tauri 2's webview
/// blocks cross-origin `fetch()` calls to external hosts even when the URL
/// embeds a signed token — CORS preflight fails with "Failed to fetch".
/// Routing through `reqwest` here side-steps the webview entirely.
///
/// Used by the admin Logs viewer to download `.log` text files for
/// display. We cap the response size at 8 MiB to avoid OOM if a runaway
/// log file ever blows past that — admin sees a truncation marker.
#[tauri::command]
pub async fn logs_fetch_text(url: String) -> Result<String, String> {
    const MAX_BYTES: usize = 8 * 1024 * 1024;
    let res = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("read body failed: {}", e))?;
    let truncated = bytes.len() > MAX_BYTES;
    let slice = if truncated { &bytes[..MAX_BYTES] } else { &bytes };
    let mut text = String::from_utf8_lossy(slice).into_owned();
    if truncated {
        text.push_str("\n\n--- [tronqué à 8 MiB] ---");
    }
    Ok(text)
}

// `File` is referenced via OpenOptions — the unused import warning is
// silenced by re-export when run-time compiles in some Rust versions.
#[allow(dead_code)]
fn _ensure_imports(_: File) {}
