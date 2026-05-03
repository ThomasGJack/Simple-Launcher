// Native Windows runtime dependency installer.
//
// Why this exists: LWJGL 3.x and various Minecraft mod-bundled native
// libraries are compiled against multiple generations of the Microsoft
// Visual C++ runtime. On a fresh Windows install (especially recent
// laptops that haven't run any older C++ apps), the older redists
// (2012, 2013) are NOT pre-installed by default — only 2015-2022 is
// shipped via Windows Update. Without the missing DLLs (`msvcr110.dll`,
// `msvcr120.dll`), some native libs load partially: `LoadLibrary`
// succeeds but unresolved imports leave function pointers null, and
// the resulting OpenGL calls produce garbage output instead of
// crashing — symptom we observed: Minecraft renders the world as
// random colored noise while the HUD stays correct (HUD doesn't go
// through the broken pipeline).
//
// Strategy:
//   1. `mc_runtime_deps_check` probes `C:\Windows\System32` for each
//      sentinel DLL and returns the list of missing redistributables.
//   2. `mc_runtime_deps_install` downloads each missing redist into
//      `%TEMP%\simple-launcher-vcredist\` from the official Microsoft
//      URLs and spawns it with `/quiet /norestart` flags. Windows
//      pops the standard UAC prompt (admin required to write to
//      `System32`); the installers themselves run silently afterwards.
//   3. Progress events are emitted via `vcredist-progress` so the UI
//      can render a clean modal.
//
// Exit codes interpreted as success:
//   - 0    : installed
//   - 1638 : a newer version of this redist is already present
//   - 3010 : install succeeded, reboot recommended
//   - 1641 : install succeeded, reboot initiated
// Anything else surfaces the code in an error string with the manual
// download URL so the user can recover.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDep {
    /// Stable id used by the frontend for keying / progress correlation.
    pub id: String,
    /// Human-friendly name displayed in the modal.
    pub display_name: String,
    /// Sentinel DLL that, if present in `C:\Windows\System32`, means
    /// the redist is already installed.
    pub dll: String,
    /// Official Microsoft download URL. We never proxy these — DL
    /// directly from MS so the bytes are always the latest signed
    /// installer.
    pub url: String,
}

/// Returns the list of redistributables this launcher cares about.
/// Order matters for the install sequence — we install older first so
/// any rare dep chain among them resolves cleanly.
fn known_deps() -> Vec<RuntimeDep> {
    vec![
        RuntimeDep {
            id: "vc2012".into(),
            display_name: "Visual C++ 2012 (x64)".into(),
            dll: "msvcr110.dll".into(),
            // VS 2012 Update 4 redistributable — the latest 2012-line
            // release. URL has been stable since 2014.
            url: "https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x64.exe".into(),
        },
        RuntimeDep {
            id: "vc2013".into(),
            display_name: "Visual C++ 2013 (x64)".into(),
            dll: "msvcr120.dll".into(),
            // aka.ms shortlink → MS download mirror, follows redirects.
            url: "https://aka.ms/highdpimfc2013x64enu".into(),
        },
        RuntimeDep {
            id: "vc2015".into(),
            display_name: "Visual C++ 2015-2022 (x64)".into(),
            dll: "vcruntime140.dll".into(),
            url: "https://aka.ms/vs/17/release/vc_redist.x64.exe".into(),
        },
    ]
}

fn system32_path() -> PathBuf {
    std::env::var("WINDIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("C:\\Windows"))
        .join("System32")
}

fn dll_present(name: &str) -> bool {
    system32_path().join(name).exists()
}

/// Returns the list of redists that are NOT currently installed on
/// this machine. Empty vec = nothing to do.
#[tauri::command]
pub async fn mc_runtime_deps_check() -> Result<Vec<RuntimeDep>, String> {
    let missing: Vec<RuntimeDep> = known_deps()
        .into_iter()
        .filter(|d| !dll_present(&d.dll))
        .collect();
    eprintln!(
        "[runtime-deps] check: {} missing of {} known",
        missing.len(),
        known_deps().len()
    );
    Ok(missing)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    /// Stable id of the dep currently being processed (or "" on `done`).
    pub current_id: String,
    /// Friendly label of the dep currently being processed.
    pub current_label: String,
    /// "downloading" | "installing" | "done".
    pub phase: String,
    /// 1-based index of the dep in the install queue.
    pub current_index: u32,
    /// Total number of deps to install in this run.
    pub total: u32,
    /// Bytes downloaded for the current dep — only meaningful in the
    /// "downloading" phase. 0 in other phases.
    pub bytes_downloaded: u64,
    /// Total expected bytes for the current dep (from Content-Length),
    /// 0 if unknown.
    pub bytes_total: u64,
}

fn emit<R: Runtime>(app: &AppHandle<R>, p: &InstallProgress) {
    let _ = app.emit("vcredist-progress", p);
}

/// Downloads + installs every missing redistributable. UAC will prompt
/// once per redist (Windows can't batch them — each `vcredist_x64.exe`
/// is its own elevated install). Returns the list of redist ids that
/// were successfully installed in this run.
#[tauri::command]
pub async fn mc_runtime_deps_install<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<String>, String> {
    let missing: Vec<RuntimeDep> = known_deps()
        .into_iter()
        .filter(|d| !dll_present(&d.dll))
        .collect();
    if missing.is_empty() {
        return Ok(Vec::new());
    }
    let total = missing.len() as u32;

    let temp_dir = std::env::temp_dir().join("simple-launcher-vcredist");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Création du dossier temp échouée : {}", e))?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .timeout(Duration::from_secs(300))
        .user_agent("SimpleLauncher (runtime-deps)")
        .build()
        .map_err(|e| format!("HTTP client init échoué : {}", e))?;

    let mut installed: Vec<String> = Vec::new();
    for (idx, dep) in missing.iter().enumerate() {
        let index_1based = idx as u32 + 1;

        // ─── Download phase ───
        emit(
            &app,
            &InstallProgress {
                current_id: dep.id.clone(),
                current_label: dep.display_name.clone(),
                phase: "downloading".into(),
                current_index: index_1based,
                total,
                bytes_downloaded: 0,
                bytes_total: 0,
            },
        );
        let exe_path = temp_dir.join(format!("{}_x64.exe", dep.id));
        let res = client
            .get(&dep.url)
            .send()
            .await
            .map_err(|e| format!("DL {} échoué : {}", dep.display_name, e))?;
        let status = res.status();
        if !status.is_success() {
            return Err(format!(
                "Téléchargement de {} échoué (HTTP {}). Installe-le manuellement : {}",
                dep.display_name, status, dep.url
            ));
        }
        let bytes_total = res.content_length().unwrap_or(0);
        let bytes = res
            .bytes()
            .await
            .map_err(|e| format!("Lecture body {} échouée : {}", dep.display_name, e))?;
        let bytes_downloaded = bytes.len() as u64;
        emit(
            &app,
            &InstallProgress {
                current_id: dep.id.clone(),
                current_label: dep.display_name.clone(),
                phase: "downloading".into(),
                current_index: index_1based,
                total,
                bytes_downloaded,
                bytes_total: if bytes_total > 0 {
                    bytes_total
                } else {
                    bytes_downloaded
                },
            },
        );
        std::fs::write(&exe_path, &bytes).map_err(|e| {
            format!(
                "Écriture de {} échouée : {}",
                exe_path.display(),
                e
            )
        })?;

        // ─── Install phase (triggers UAC prompt) ───
        emit(
            &app,
            &InstallProgress {
                current_id: dep.id.clone(),
                current_label: dep.display_name.clone(),
                phase: "installing".into(),
                current_index: index_1based,
                total,
                bytes_downloaded: 0,
                bytes_total: 0,
            },
        );
        eprintln!(
            "[runtime-deps] spawning installer: {} (admin elevation prompt expected)",
            exe_path.display()
        );
        let child_status = Command::new(&exe_path)
            .args(["/quiet", "/norestart"])
            .status()
            .await
            .map_err(|e| {
                format!(
                    "Lancement de l'installer {} échoué : {}",
                    dep.display_name, e
                )
            })?;
        let code = child_status.code().unwrap_or(-1);
        // 0     : succeeded
        // 1638  : a newer version is already installed (counts as OK)
        // 3010  : succeeded, reboot recommended
        // 1641  : succeeded, reboot initiated
        // 1602/1603 : user cancelled or generic install error
        if !matches!(code, 0 | 1638 | 3010 | 1641) {
            return Err(format!(
                "Installation de {} échouée (code {}). \
                 Si c'est 1602 / 1603 → tu as refusé l'invite UAC ou l'installer a foiré. \
                 Tu peux installer manuellement depuis : {}",
                dep.display_name, code, dep.url
            ));
        }
        eprintln!(
            "[runtime-deps] {} installed (exit code {})",
            dep.id, code
        );
        installed.push(dep.id.clone());
    }

    // Final tick on the "done" phase.
    emit(
        &app,
        &InstallProgress {
            current_id: String::new(),
            current_label: "Toutes les dépendances sont installées.".into(),
            phase: "done".into(),
            current_index: total,
            total,
            bytes_downloaded: 0,
            bytes_total: 0,
        },
    );

    // Best-effort cleanup of the temp installers.
    let _ = std::fs::remove_dir_all(&temp_dir);

    Ok(installed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_deps_lists_three_redists_in_dependency_order() {
        let deps = known_deps();
        assert_eq!(deps.len(), 3, "Expected exactly 3 redists");
        assert_eq!(deps[0].id, "vc2012", "VC++ 2012 must be first (oldest)");
        assert_eq!(deps[1].id, "vc2013");
        assert_eq!(deps[2].id, "vc2015");
    }

    #[test]
    fn known_deps_have_sentinel_dlls_pointing_to_msvcrt_versions() {
        let deps = known_deps();
        // The sentinels are well-known DLLs shipped by each redist —
        // pointing at the wrong one would break the detection silently.
        assert_eq!(deps[0].dll, "msvcr110.dll", "VC++ 2012 sentinel");
        assert_eq!(deps[1].dll, "msvcr120.dll", "VC++ 2013 sentinel");
        assert_eq!(deps[2].dll, "vcruntime140.dll", "VC++ 2015-2022 sentinel");
    }

    #[test]
    fn known_deps_urls_use_microsoft_domains() {
        let deps = known_deps();
        for dep in &deps {
            assert!(
                dep.url.contains("microsoft.com") || dep.url.contains("aka.ms"),
                "Redist URL should be on a Microsoft domain (got {}): {}",
                dep.id,
                dep.url,
            );
        }
    }

    #[test]
    fn system32_path_uses_windir_or_default() {
        // The function reads $WINDIR. We can't reliably stub env vars
        // in tests without breaking parallel test execution, so just
        // assert the path ends in "System32" (regardless of WINDIR
        // value).
        let path = system32_path();
        let s = path.to_string_lossy();
        assert!(
            s.ends_with("System32"),
            "Expected System32 suffix, got: {}",
            s
        );
    }
}
