//! Windows AUMID setup — fixe l'affichage source des toast notifications.
//!
//! Sans ça, sur Windows :
//!   - En dev (`tauri:dev`), le toast affiche "Windows PowerShell" comme
//!     source (le parent process qui a lancé l'app).
//!   - En prod sans installer Velopack, fallback sur "App" générique.
//!
//! Solution : on déclare un AUMID explicite (`com.simplelauncher.app`,
//! même que `tauri.conf.json::identifier`), on le registre dans le registry
//! HKCU avec son DisplayName + IconUri pour que Windows sache comment
//! l'afficher, puis on `SetCurrentProcessExplicitAppUserModelID` pour
//! que toutes les toasts émises par notre process utilisent cet AUMID.
//!
//! C'est ce que fait Velopack (et tous les installers Squirrel-likes)
//! au moment de l'installation. On le reproduit côté code pour que ça
//! marche même en dev sans installer.

#![cfg(windows)]

use std::iter;
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use winreg::enums::*;
use winreg::RegKey;

/// AUMID = bundle identifier de l'app (cf. tauri.conf.json).
const AUMID: &str = "com.simplelauncher.app";
const DISPLAY_NAME: &str = "Simple Launcher";

/// Fait les 2 étapes nécessaires :
///   1. Registry write HKCU pour que Windows connaisse l'AUMID et son
///      affichage.
///   2. SetCurrentProcessExplicitAppUserModelID pour que les toasts
///      émises par ce process utilisent cet AUMID.
///
/// Idempotent : appel répété no-op (le registry write overwrite, le
/// SetCurrentProcess... est mono-call par process).
pub fn install_aumid() {
    if let Err(err) = register_aumid_in_registry() {
        eprintln!("[aumid] registry write failed: {} — toasts will fall back to default branding", err);
    }
    set_process_aumid();
}

fn register_aumid_in_registry() -> std::io::Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!(r"Software\Classes\AppUserModelId\{}", AUMID);
    let (key, _disposition) = hkcu.create_subkey(&path)?;
    // DisplayName : ce que le toast affiche en haut ("Simple Launcher" au
    // lieu de "Windows PowerShell").
    key.set_value("DisplayName", &DISPLAY_NAME)?;
    // IconUri optionnel : path absolu vers l'icone à afficher dans le
    // toast. Si on trouve l'icone à côté de l'exe, on la set ; sinon
    // Windows affichera un placeholder neutre.
    if let Some(icon_path) = find_icon_path() {
        let _ = key.set_value("IconUri", &icon_path);
    }
    Ok(())
}

fn set_process_aumid() {
    let wide: Vec<u16> = AUMID.encode_utf16().chain(iter::once(0)).collect();
    unsafe {
        // Returns HRESULT — non-zero = error, mais on log + continue
        // car ce n'est pas critique (les toasts marcheront, juste avec
        // un branding par défaut).
        let result = SetCurrentProcessExplicitAppUserModelID(PCWSTR::from_raw(wide.as_ptr()));
        if let Err(err) = result {
            eprintln!("[aumid] SetCurrentProcessExplicitAppUserModelID failed: {:?}", err);
        }
    }
}

/// Cherche un fichier icon.ico à côté de l'exe ou dans des paths
/// classiques (icons/ subfolder, ../icons/, etc.).
///
/// En dev, l'exe est `target/debug/simple-launcher.exe` et les icones
/// sont à `src-tauri/icons/`. En prod, c'est packagé différemment.
/// On essaie plusieurs candidats — le premier qui existe gagne.
fn find_icon_path() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;
    let candidates = [
        exe_dir.join("icons").join("icon.ico"),
        exe_dir.join("icon.ico"),
        // Dev path : exe est dans target/debug/, icons dans src-tauri/icons/
        exe_dir.join("..").join("..").join("icons").join("icon.ico"),
        exe_dir.join("..").join("icons").join("icon.ico"),
    ];
    for c in &candidates {
        if c.exists() {
            // Convert to absolute string path for the registry value.
            if let Ok(abs) = c.canonicalize() {
                // Strip the Windows \\?\ UNC prefix if present.
                let path_str = abs.to_string_lossy().to_string();
                let cleaned = path_str
                    .strip_prefix(r"\\?\")
                    .unwrap_or(&path_str)
                    .to_string();
                return Some(cleaned);
            }
        }
    }
    None
}
