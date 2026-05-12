//! FiveM detection — trouve le path de FiveM.exe sur le PC pour pouvoir
//! le lancer depuis le launcher.
//!
//! FiveM = mod multijoueur de GTA V (Cfx.re). Le launcher Simple ne fait
//! QUE détecter + lancer. C'est FiveM lui-même qui gère :
//!   - Détection de GTA V (Steam / Epic / Rockstar Launcher) au premier launch
//!   - Auth Rockstar Social Club via le jeu
//!   - Anti-cheat + intégrité fichiers
//!
//! Détection en cascade :
//!   1. Registry `HKCU\Software\Cfx.re\FiveM` clé `Installed Path` (source
//!      de vérité officielle posée par l'installer FiveM).
//!   2. Fallback default install dir `%LOCALAPPDATA%\FiveM\FiveM.exe`
//!      (chemin par défaut quand l'user n'a pas changé).
//!
//! Returns `None` si rien trouvé — le frontend affichera "Installer FiveM"
//! avec un bouton vers https://fivem.net/. Au prochain focus de la fenêtre,
//! re-detect (catch le cas "l'user vient d'installer pendant qu'on tournait").

use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FivemInstall {
    /// Path absolu vers FiveM.exe (utilisable tel quel par `Command::new`).
    pub executable_path: String,
}

#[tauri::command]
pub async fn fivem_detect() -> Result<Option<FivemInstall>, String> {
    // 1. Registry Cfx.re — source de vérité officielle.
    #[cfg(windows)]
    {
        if let Some(install) = detect_via_registry() {
            return Ok(Some(install));
        }
    }

    // 2. Default install dir `%LOCALAPPDATA%\FiveM\FiveM.exe`.
    if let Some(local) = dirs::data_local_dir() {
        let candidate = local.join("FiveM").join("FiveM.exe");
        if candidate.exists() {
            return Ok(Some(FivemInstall {
                executable_path: candidate.to_string_lossy().into_owned(),
            }));
        }
    }

    Ok(None)
}

#[cfg(windows)]
fn detect_via_registry() -> Option<FivemInstall> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(r"Software\Cfx.re\FiveM").ok()?;
    let path_str: String = key.get_value("Installed Path").ok()?;
    let candidate = PathBuf::from(&path_str).join("FiveM.exe");
    if candidate.exists() {
        Some(FivemInstall {
            executable_path: candidate.to_string_lossy().into_owned(),
        })
    } else {
        None
    }
}
