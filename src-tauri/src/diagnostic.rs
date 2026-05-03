// System diagnostic snapshot.
//
// Powers the "Diagnostic système" modal in Settings. Surfaces the
// information users typically need to self-debug "ça marche pas chez
// moi" issues without having to dig through Windows panels :
//
//   - OS name + version (so we know what we're targeting)
//   - Total RAM / available RAM (low memory is a frequent root cause
//     of MC crashes)
//   - Disk free space on the launcher's app-data drive (Storage
//     bottleneck when downloading multi-GB modpacks)
//   - CPU name + core count
//   - GPU name(s) — pulled via `wmic` for now, no extra crate
//   - Detected Java installations (delegates to `mc_java::list_installations`)
//   - Missing VC++ redistributables (delegates to `mc_runtime_deps`)
//
// Output is structured (serialized to JSON for the frontend) — the
// frontend renders it as a checklist with green/amber/red statuses
// based on simple thresholds (e.g. < 4 GB free RAM is amber, < 2 GB is
// red).

use serde::Serialize;
use sysinfo::{Disks, System};
use tauri::{AppHandle, Manager, Runtime};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSnapshot {
    pub os: String,
    pub kernel: String,
    pub cpu_name: String,
    pub cpu_cores: usize,
    /// Total physical RAM in bytes.
    pub total_memory_bytes: u64,
    /// Currently free / available physical RAM in bytes.
    pub available_memory_bytes: u64,
    pub gpus: Vec<String>,
    /// Free space on the drive that hosts `app_data_dir()`. Bytes.
    pub launcher_disk_free_bytes: u64,
    /// Total size of that same drive. Bytes.
    pub launcher_disk_total_bytes: u64,
    pub launcher_disk_path: String,
    /// Detected Java installations (mirrors `mc_java::JavaInstallation`).
    pub javas: Vec<JavaSummary>,
    /// Missing VC++ redistributables (mirrors `mc_runtime_deps::RuntimeDep`).
    pub missing_vcredists: Vec<VcRedistSummary>,
    /// Diagnostic generation timestamp (ms since epoch).
    pub generated_at_ms: u128,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JavaSummary {
    pub major_version: u32,
    pub version_string: String,
    pub path: String,
    pub source: String,
    pub managed: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VcRedistSummary {
    pub id: String,
    pub display_name: String,
    pub url: String,
}

/// Returns names of installed video controllers via `wmic`. Falls back
/// to an empty list when `wmic` isn't available (it's deprecated in
/// recent Windows but still ships up to Win 11 23H2). For a future
/// migration to PowerShell `Get-CimInstance Win32_VideoController`,
/// keep the same fallback semantics.
async fn detect_gpus() -> Vec<String> {
    let result = Command::new("wmic")
        .args(["path", "win32_VideoController", "get", "Name", "/value"])
        .output()
        .await;
    let Ok(output) = result else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            line.strip_prefix("Name=").map(|s| s.trim().to_string())
        })
        .filter(|s| !s.is_empty())
        .collect()
}

#[tauri::command]
pub async fn diagnostic_run<R: Runtime>(
    app: AppHandle<R>,
) -> Result<DiagnosticSnapshot, String> {
    // 1. Sysinfo for CPU + RAM.
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_cores = sys.cpus().len();

    // 2. Disks — find the one containing app_data_dir.
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {}", e))?;
    let app_data_str = app_data.to_string_lossy().to_string();

    let disks = Disks::new_with_refreshed_list();
    let mut launcher_disk_free: u64 = 0;
    let mut launcher_disk_total: u64 = 0;
    let mut best_match_len: usize = 0;
    for disk in &disks {
        let mount = disk.mount_point().to_string_lossy();
        if app_data_str.starts_with(&*mount) && mount.len() > best_match_len {
            launcher_disk_free = disk.available_space();
            launcher_disk_total = disk.total_space();
            best_match_len = mount.len();
        }
    }

    // 3. OS info via static helpers (sysinfo's instance methods were
    //    promoted to associated functions in 0.32).
    let os = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let kernel = System::kernel_version().unwrap_or_else(|| "?".to_string());

    // 4. GPUs via wmic (best-effort).
    let gpus = detect_gpus().await;

    // 5. Detected Java installations.
    let javas = match crate::mc_java::list_installations(&app).await {
        Ok(list) => list
            .into_iter()
            .map(|j| JavaSummary {
                major_version: j.major_version,
                version_string: j.version_string,
                path: j.path,
                source: j.source,
                managed: j.managed,
            })
            .collect(),
        Err(_) => Vec::new(),
    };

    // 6. Missing VC++ redistributables (only meaningful on Windows).
    let missing_vcredists =
        match crate::mc_runtime_deps::mc_runtime_deps_check().await {
            Ok(list) => list
                .into_iter()
                .map(|d| VcRedistSummary {
                    id: d.id,
                    display_name: d.display_name,
                    url: d.url,
                })
                .collect(),
            Err(_) => Vec::new(),
        };

    Ok(DiagnosticSnapshot {
        os,
        kernel,
        cpu_name,
        cpu_cores,
        total_memory_bytes: sys.total_memory(),
        available_memory_bytes: sys.available_memory(),
        gpus,
        launcher_disk_free_bytes: launcher_disk_free,
        launcher_disk_total_bytes: launcher_disk_total,
        launcher_disk_path: app_data_str,
        javas,
        missing_vcredists,
        generated_at_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
    })
}
