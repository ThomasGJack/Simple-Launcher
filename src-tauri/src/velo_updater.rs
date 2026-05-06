// Velopack auto-update bindings for the Tauri frontend.
//
// Replaces tauri-plugin-updater (NSIS-based) with Velopack which gives us :
//   - Delta updates (download only what changed between two versions)
//   - Atomic install/upgrade with rollback
//   - No more NSIS dialog at install time
//   - Single engine for first-install AND update (vs. NSIS + plugin-updater)
//
// The frontend talks to Velopack via three Tauri commands :
//   - `velo_check`       → asks if a remote update is available
//   - `velo_download`    → downloads the .nupkg(s) with progress events
//   - `velo_apply`       → applies + restarts the launcher
//
// Progress is surfaced to the frontend via a Tauri event (`velo:progress`)
// emitted from a worker thread that drains the mpsc channel velopack
// gives us.
//
// IMPORTANT : In dev (`cargo run` / `tauri dev`), the running exe is not
// a Velopack-installed app, so `UpdateManager::new` errors with
// "NotInstalled". The frontend treats that as "no updates available"
// silently — same UX as the previous tauri-plugin-updater behaviour.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use velopack::{sources::HttpSource, UpdateCheck, UpdateInfo, UpdateManager};

/// Update endpoint the launcher checks for new releases. Velopack
/// fetches `<UPDATE_URL>/releases.<channel>.json` from this base, plus
/// the .nupkg packages referenced by that feed. Channel "win" is the
/// default for Windows builds (matches the `--channel win` flag in
/// `scripts/release-launcher.mjs`).
const UPDATE_URL: &str = "https://simplelaunche.web.app/launcher/win";

/// State managed by Tauri so we can pass UpdateInfo (which is heavy
/// and not Serialize-friendly across IPC) between `velo_check` and
/// `velo_download` / `velo_apply` without re-fetching the feed.
pub struct VeloState {
    pending: Arc<Mutex<Option<UpdateInfo>>>,
}

impl VeloState {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(None)),
        }
    }
}

/// Serializable asset summary returned to the frontend on a successful
/// `velo_check`. Mirrors the fields the in-app HUD wants to display
/// (version, size, release notes) without leaking the full UpdateInfo.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VeloUpdateSummary {
    pub version: String,
    pub size: u64,
    pub notes: String,
    pub is_delta: bool,
}

fn build_manager() -> Result<UpdateManager, String> {
    let source = HttpSource::new(UPDATE_URL);
    UpdateManager::new(source, None, None).map_err(|e| format!("{}", e))
}

/// Check the remote feed for an available update. Returns `None` if
/// the launcher is up to date or running in a non-installed (dev)
/// context. The returned `UpdateInfo` is stashed in app state so a
/// subsequent `velo_download` call doesn't need to re-fetch.
#[tauri::command]
pub async fn velo_check(state: State<'_, VeloState>) -> Result<Option<VeloUpdateSummary>, String> {
    // Build manager + check on a blocking thread — velopack's API is
    // synchronous and uses ureq under the hood, so we don't want to
    // hold the async runtime.
    let result = tokio::task::spawn_blocking(|| {
        let manager = build_manager()?;
        manager.check_for_updates().map_err(|e| format!("{}", e))
    })
    .await
    .map_err(|e| format!("join error: {}", e))??;

    match result {
        UpdateCheck::UpdateAvailable(info) => {
            let asset = &info.TargetFullRelease;
            let summary = VeloUpdateSummary {
                version: asset.Version.clone(),
                size: asset.Size,
                notes: asset.NotesMarkdown.clone(),
                is_delta: !info.DeltasToTarget.is_empty(),
            };
            // Stash for download/apply to reuse.
            let mut pending = state.pending.lock().unwrap();
            *pending = Some(info);
            Ok(Some(summary))
        }
        UpdateCheck::NoUpdateAvailable | UpdateCheck::RemoteIsEmpty => {
            // Make sure we don't carry stale UpdateInfo over.
            let mut pending = state.pending.lock().unwrap();
            *pending = None;
            Ok(None)
        }
    }
}

/// Download the previously-checked update. Emits `velo:progress` events
/// with a 0-100 percent value as the download progresses, plus terminal
/// `velo:download-finished` / `velo:download-error` events.
///
/// Errors surface as the resolved Promise rejection on the JS side.
#[tauri::command]
pub async fn velo_download(app: AppHandle, state: State<'_, VeloState>) -> Result<(), String> {
    let info = {
        let pending = state.pending.lock().unwrap();
        pending
            .clone()
            .ok_or_else(|| "no pending update — call velo_check first".to_string())?
    };

    // Spawn a forwarder thread that drains the velopack mpsc channel
    // and forwards each tick as a Tauri event. Done via std::thread
    // so we don't pollute Tokio with a sync recv loop.
    let (tx, rx) = std::sync::mpsc::channel::<i16>();
    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        while let Ok(pct) = rx.recv() {
            // Best-effort emit — if no listener yet, the event is dropped.
            let _ = app_for_thread.emit("velo:progress", pct);
        }
    });

    // The actual download is blocking : do it on the spawn_blocking pool.
    let info_for_dl = info.clone();
    let download_result = tokio::task::spawn_blocking(move || {
        let manager = build_manager()?;
        manager
            .download_updates(&info_for_dl, Some(tx))
            .map_err(|e| format!("{}", e))
    })
    .await
    .map_err(|e| format!("join error: {}", e))?;

    match download_result {
        Ok(()) => {
            let _ = app.emit("velo:download-finished", &info.TargetFullRelease.Version);
            Ok(())
        }
        Err(e) => {
            let _ = app.emit("velo:download-error", &e);
            Err(e)
        }
    }
}

/// Apply the previously-downloaded update and restart the launcher.
/// This call does NOT return on success — the process exits and a new
/// one starts post-update.
#[tauri::command]
pub async fn velo_apply(state: State<'_, VeloState>) -> Result<(), String> {
    let info = {
        let pending = state.pending.lock().unwrap();
        pending
            .clone()
            .ok_or_else(|| "no pending update — call velo_check first".to_string())?
    };

    tokio::task::spawn_blocking(move || {
        let manager = build_manager()?;
        manager
            .apply_updates_and_restart(&info)
            .map_err(|e| format!("{}", e))
    })
    .await
    .map_err(|e| format!("join error: {}", e))?
}

/// Returns the currently-running launcher version reported by the
/// Velopack locator (the version baked into the manifest at install
/// time). In dev mode this returns the Cargo package version as a
/// fallback so the frontend never sees an empty string.
#[tauri::command]
pub fn velo_current_version() -> String {
    match build_manager() {
        Ok(m) => m.get_current_version_as_string(),
        Err(_) => env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Returns true if the launcher is running from a Velopack install
/// (i.e. update endpoints are wired up). False in dev / portable runs.
#[tauri::command]
pub fn velo_is_installed() -> bool {
    build_manager().is_ok()
}

