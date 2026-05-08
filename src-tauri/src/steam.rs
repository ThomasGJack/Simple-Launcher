// Steam library detection — scanne les paths d'install Steam
// usuels (C:\Program Files (x86)\Steam, C:\Program Files\Steam) et
// liste les jeux installés via les `appmanifest_*.acf` dans
// `steamapps/`.
//
// Pas de lecture registry pour MVP — les 2 paths default couvrent
// 99 % des installs Windows. Path custom = POSTMVP.
//
// Le frontend lance les jeux via `steam://run/{appid}` URL — Steam
// Client lui-même résout le chemin de l'exécutable. Pas besoin de
// parser le `appinfo.vdf` binaire.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tokio::fs;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamInstall {
    pub path: String,
    pub library_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamGame {
    pub app_id: String,
    pub name: String,
    pub install_dir: String,
}

const COMMON_PATHS: &[&str] = &[
    r"C:\Program Files (x86)\Steam",
    r"C:\Program Files\Steam",
];

#[tauri::command]
pub async fn steam_detect() -> Result<Option<SteamInstall>, String> {
    for p in COMMON_PATHS {
        let path = PathBuf::from(p);
        if fs::metadata(&path).await.is_ok() {
            let library_paths = read_library_folders(&path).await;
            return Ok(Some(SteamInstall {
                path: path.to_string_lossy().to_string(),
                library_paths,
            }));
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn steam_list_games() -> Result<Vec<SteamGame>, String> {
    let install = match steam_detect().await? {
        Some(i) => i,
        None => return Ok(Vec::new()),
    };
    let mut games = Vec::new();
    let mut paths_to_scan = vec![install.path.clone()];
    paths_to_scan.extend(install.library_paths);

    for lib_path in paths_to_scan {
        let steamapps = PathBuf::from(&lib_path).join("steamapps");
        if let Ok(mut dir) = fs::read_dir(&steamapps).await {
            while let Ok(Some(entry)) = dir.next_entry().await {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                        if let Some(game) = parse_acf(&path).await {
                            games.push(game);
                        }
                    }
                }
            }
        }
    }

    // Dedup par app_id (un jeu peut être listé dans plusieurs libraries
    // si l'user a déplacé un install). Premier wins.
    let mut seen = std::collections::HashSet::new();
    games.retain(|g| seen.insert(g.app_id.clone()));
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(games)
}

// ─── Helpers ─────────────────────────────────────────────────────────

/// Lit `steamapps/libraryfolders.vdf` pour récupérer les paths des
/// libraries Steam additionnelles (l'user peut avoir déplacé des
/// installs sur un autre disque). Format simple : on cherche les
/// occurrences de `"path"\s+"<path>"` via regex naïve (les VDF
/// imbriquées sont en accolades + quotes).
async fn read_library_folders(steam_root: &Path) -> Vec<String> {
    let path = steam_root.join("steamapps").join("libraryfolders.vdf");
    let content = match fs::read_to_string(&path).await {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let mut paths = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        // Match `"path"\t\t"<path>"`
        if let Some(rest) = trimmed.strip_prefix("\"path\"") {
            // rest is something like `\t\t"C:\\..."` — extract between quotes
            if let Some(start) = rest.find('"') {
                let after = &rest[start + 1..];
                if let Some(end) = after.find('"') {
                    let p = after[..end].replace("\\\\", "\\");
                    if !p.is_empty() {
                        paths.push(p);
                    }
                }
            }
        }
    }
    // Drop the root path (déjà dans `install.path`) si présent
    let root_str = steam_root.to_string_lossy();
    paths.retain(|p| !p.eq_ignore_ascii_case(&root_str));
    paths
}

/// Parse un fichier `.acf` (Application Cache Format — le format VDF
/// key-value plat de Steam). On extrait juste les champs `appid`,
/// `name`, `installdir`. Format type :
///
/// "AppState"
/// {
///   "appid"  "440"
///   "name"   "Team Fortress 2"
///   "installdir"  "Team Fortress 2"
///   ...
/// }
async fn parse_acf(path: &Path) -> Option<SteamGame> {
    let content = fs::read_to_string(path).await.ok()?;
    let mut app_id = String::new();
    let mut name = String::new();
    let mut install_dir = String::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(value) = extract_value(trimmed, "appid") {
            app_id = value;
        } else if let Some(value) = extract_value(trimmed, "name") {
            name = value;
        } else if let Some(value) = extract_value(trimmed, "installdir") {
            install_dir = value;
        }
    }
    if app_id.is_empty() || name.is_empty() {
        return None;
    }
    Some(SteamGame {
        app_id,
        name,
        install_dir,
    })
}

fn extract_value(line: &str, key: &str) -> Option<String> {
    let prefix = format!("\"{}\"", key);
    let stripped = line.strip_prefix(&prefix)?;
    let after = stripped.trim_start();
    let after = after.strip_prefix('"')?;
    let end = after.find('"')?;
    Some(after[..end].to_string())
}
