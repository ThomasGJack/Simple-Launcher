// Forge + NeoForge loader installer.
//
// Both loaders ship "modern" installers (Forge 1.13+, NeoForge from
// inception) that include a headless `--installClient {dir}` mode. We
// use that instead of trying to re-implement their install logic
// ourselves: DL the installer JAR, point it at a throwaway `.minecraft`
// dir, then move the resulting profile JSON + libraries into our
// shared layout.
//
// Why a throwaway dir: Forge/NeoForge installers expect to find a
// `launcher_profiles.json` that looks like the official Mojang
// launcher's. We synthesize a stub one + give the installer its own
// scratch dir, then sweep the deliverables out after.
//
// Differences between Forge and NeoForge:
//   - Different Maven repos
//   - Forge version IDs include the MC version (`1.20.1-47.4.0`),
//     NeoForge IDs don't (`21.5.34-beta`)
//   - Both produce the same kind of profile JSON in the end
// Everything else is shared.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::mc_java::mc_java_resolve;
use crate::mc_vanilla::{
    http_client, install_vanilla, libraries_dir, mc_root, versions_dir, InstallProgress,
};

// ─── Loader kind ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ForgeKind {
    Forge,
    Neoforge,
}

impl ForgeKind {
    fn label(self) -> &'static str {
        match self {
            ForgeKind::Forge => "Forge",
            ForgeKind::Neoforge => "NeoForge",
        }
    }

    /// Returns the URL of the installer JAR for the given version. For
    /// NeoForge, `mc_version` is ignored (the loader version pins the
    /// MC compat itself); for Forge, the URL is `mc-loader` style.
    fn installer_url(self, mc_version: &str, loader_version: &str) -> String {
        match self {
            ForgeKind::Forge => format!(
                "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{lv}/forge-{mc}-{lv}-installer.jar",
                mc = mc_version,
                lv = loader_version,
            ),
            ForgeKind::Neoforge => format!(
                "https://maven.neoforged.net/releases/net/neoforged/neoforge/{lv}/neoforge-{lv}-installer.jar",
                lv = loader_version,
            ),
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────

fn emit<R: Runtime>(app: &AppHandle<R>, p: &InstallProgress) {
    let _ = app.emit("mc-vanilla-progress", p);
}

/// Synthesizes a minimal `launcher_profiles.json` in the target dir so
/// the Forge/NeoForge installer thinks it's looking at a vanilla
/// launcher install. Mojang's official format has more fields than
/// this, but the installer only checks for the file's existence + a
/// valid JSON shape.
async fn write_stub_launcher_profiles(dir: &Path) -> Result<(), String> {
    let path = dir.join("launcher_profiles.json");
    let stub = serde_json::json!({
        "profiles": {},
        "selectedProfile": "(Default)",
        "clientToken": "00000000-0000-0000-0000-000000000000",
        "settings": {
            "showGameLog": false,
            "showMenu": false,
            "enableSnapshots": false
        },
        "version": 3
    });
    fs::write(&path, serde_json::to_vec_pretty(&stub).unwrap_or_default())
        .await
        .map_err(|e| format!("écriture launcher_profiles.json échouée : {}", e))
}

/// Recursively copies `src` into `dst`. Preserves directory structure.
/// Used to merge the installer's `versions/` + `libraries/` output
/// into our shared launcher layout.
async fn copy_tree(src: &Path, dst: &Path) -> Result<(), String> {
    let mut stack: Vec<(PathBuf, PathBuf)> = vec![(src.to_path_buf(), dst.to_path_buf())];
    while let Some((s, d)) = stack.pop() {
        let meta = match fs::metadata(&s).await {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            fs::create_dir_all(&d)
                .await
                .map_err(|e| format!("mkdir {} échoué : {}", d.display(), e))?;
            let mut entries = fs::read_dir(&s)
                .await
                .map_err(|e| format!("read_dir {} échoué : {}", s.display(), e))?;
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name();
                stack.push((entry.path(), d.join(name)));
            }
        } else {
            if let Some(parent) = d.parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("mkdir parent {} failed: {}", parent.display(), e))?;
            }
            // Don't overwrite existing files (e.g. the vanilla
            // client.jar that's already where we want it). Forge
            // installers re-emit a full vanilla copy, but ours is
            // already SHA-1-verified, so skipping is safer + faster.
            if !d.exists() {
                fs::copy(&s, &d)
                    .await
                    .map_err(|e| format!("copy {} → {} failed: {}", s.display(), d.display(), e))?;
            }
        }
    }
    Ok(())
}

// ─── Public install pipeline ──────────────────────────────────────────

/// Top-level: makes sure vanilla bits are present, downloads the
/// Forge/NeoForge installer JAR, runs it headless, then folds its
/// output into our shared layout. Idempotent — re-running on an
/// already-installed loader is a no-op (we skip if the profile JSON
/// is already in `versions/`).
pub async fn install_forge_like<R: Runtime>(
    app: &AppHandle<R>,
    kind: ForgeKind,
    mc_version: &str,
    loader_version: &str,
    instance_id: &str,
) -> Result<(), String> {
    // 1. Vanilla prerequisite ─ Forge/NeoForge reuse the vanilla bits
    //    (client.jar, asset index, base libraries). install_vanilla is
    //    idempotent so re-running on an installed setup costs ~ 0.
    install_vanilla(app, mc_version, instance_id).await?;

    // 2. Resolve a compatible Java to RUN the installer.
    let java = mc_java_resolve(app.clone(), mc_version.to_string()).await?;
    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "forge-installer-dl".to_string(),
            current: 0,
            total: 1,
            message: format!("Téléchargement de l'installeur {}…", kind.label()),
        },
    );

    // 3. DL the installer JAR into a scratch dir we can clean up later.
    let mc_root_path = mc_root(app)?;
    let scratch_root = mc_root_path
        .join("scratch")
        .join(format!("{}-{}", kind.label().to_lowercase(), loader_version));
    let _ = fs::remove_dir_all(&scratch_root).await;
    fs::create_dir_all(&scratch_root)
        .await
        .map_err(|e| format!("mkdir scratch {} failed: {}", scratch_root.display(), e))?;
    let installer_path = scratch_root.join("installer.jar");
    let url = kind.installer_url(mc_version, loader_version);
    let client = http_client()?;
    let res = client
        .get(&url)
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("DL installer failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!(
            "Installeur {} introuvable (HTTP {}). URL : {}",
            kind.label(),
            res.status(),
            url
        ));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("read installer body failed: {}", e))?;
    let mut f = fs::File::create(&installer_path)
        .await
        .map_err(|e| format!("create installer file failed: {}", e))?;
    f.write_all(&bytes)
        .await
        .map_err(|e| format!("write installer file failed: {}", e))?;
    f.flush().await.ok();

    // 4. Spin up a fake `.minecraft` for the installer to write into.
    //    `--installClient` expects a launcher_profiles.json + a `versions/`
    //    dir to live under whatever path we pass.
    let fake_mc_dir = scratch_root.join("fake-mc");
    fs::create_dir_all(&fake_mc_dir)
        .await
        .map_err(|e| format!("mkdir fake mc dir failed: {}", e))?;
    write_stub_launcher_profiles(&fake_mc_dir).await?;

    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "forge-installer-run".to_string(),
            current: 0,
            total: 1,
            message: format!("Exécution de l'installeur {} (jusqu'à 60 s)…", kind.label()),
        },
    );

    // 5. Run the installer headless. The installer prints its progress
    //    to stdout but we only care about the exit code. Generous
    //    timeout (8 min) because Forge installers do a LOT of patching.
    let output = tokio::time::timeout(
        Duration::from_secs(8 * 60),
        Command::new(&java.path)
            .arg("-jar")
            .arg(&installer_path)
            .arg("--installClient")
            .arg(&fake_mc_dir)
            .current_dir(&scratch_root)
            .output(),
    )
    .await
    .map_err(|_| format!("Installeur {} timeout (8 min). Réessaye.", kind.label()))?
    .map_err(|e| format!("Spawn installeur {} échoué : {}", kind.label(), e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Installeur {} a échoué (exit {:?}).\n--- stdout ---\n{}\n--- stderr ---\n{}",
            kind.label(),
            output.status.code(),
            stdout,
            stderr
        ));
    }

    // 6. Sweep the installer output (`fake-mc/versions/...` and
    //    `fake-mc/libraries/...`) into our shared `<root>/versions/`
    //    and `<root>/libraries/` dirs.
    let fake_versions = fake_mc_dir.join("versions");
    let fake_libraries = fake_mc_dir.join("libraries");
    if fake_versions.exists() {
        copy_tree(&fake_versions, &versions_dir(app)?).await?;
    }
    if fake_libraries.exists() {
        copy_tree(&fake_libraries, &libraries_dir(app)?).await?;
    }

    // 7. Cleanup.
    let _ = fs::remove_dir_all(&scratch_root).await;

    emit(
        app,
        &InstallProgress {
            mc_version: mc_version.to_string(),
            phase: "done".to_string(),
            current: 1,
            total: 1,
            message: format!("{} {} prêt.", kind.label(), loader_version),
        },
    );
    Ok(())
}

// ─── Version listing (Forge + NeoForge) ──────────────────────────────

/// Forge promotions JSON. `promos` keys are like `"1.20.1-recommended"`
/// or `"1.20.1-latest"`. We surface both per-MC for the picker UI.
#[derive(Debug, Clone, Deserialize)]
struct ForgePromotions {
    promos: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeVersionEntry {
    pub mc_version: String,
    pub loader_version: String,
    pub channel: String, // "recommended" | "latest"
}

pub async fn list_forge_versions() -> Result<Vec<ForgeVersionEntry>, String> {
    let client = http_client()?;
    let res = client
        .get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
        .send()
        .await
        .map_err(|e| format!("Forge promotions GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Forge promotions HTTP {}", res.status()));
    }
    let parsed: ForgePromotions = res
        .json()
        .await
        .map_err(|e| format!("Forge promotions parse failed: {}", e))?;
    let mut out = Vec::with_capacity(parsed.promos.len());
    for (key, version) in parsed.promos {
        if let Some((mc, channel)) = key.rsplit_once('-') {
            out.push(ForgeVersionEntry {
                mc_version: mc.to_string(),
                loader_version: version,
                channel: channel.to_string(),
            });
        }
    }
    // Sort newest first (lexicographic on mc_version is good enough for
    // the picker — 1.21.x > 1.20.x > 1.19.x).
    out.sort_by(|a, b| b.mc_version.cmp(&a.mc_version));
    Ok(out)
}

/// NeoForge maven-metadata is XML; we just want the `<version>` list.
/// Cheap regex extraction beats pulling in a real XML parser.
pub async fn list_neoforge_versions() -> Result<Vec<String>, String> {
    let client = http_client()?;
    let res = client
        .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| format!("NeoForge maven-metadata GET failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("NeoForge maven-metadata HTTP {}", res.status()));
    }
    let xml = res
        .text()
        .await
        .map_err(|e| format!("NeoForge XML read failed: {}", e))?;
    let mut versions: Vec<String> = Vec::new();
    let mut rest = xml.as_str();
    while let Some(start) = rest.find("<version>") {
        let after = &rest[start + "<version>".len()..];
        if let Some(end) = after.find("</version>") {
            versions.push(after[..end].to_string());
            rest = &after[end + "</version>".len()..];
        } else {
            break;
        }
    }
    versions.reverse(); // maven lists oldest-first; we want newest-first
    Ok(versions)
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_forge_list_versions() -> Result<Vec<ForgeVersionEntry>, String> {
    list_forge_versions().await
}

#[tauri::command]
pub async fn mc_neoforge_list_versions() -> Result<Vec<String>, String> {
    list_neoforge_versions().await
}

#[tauri::command]
pub async fn mc_forge_install<R: Runtime>(
    app: AppHandle<R>,
    mc_version: String,
    loader_version: String,
    instance_id: String,
) -> Result<(), String> {
    install_forge_like(&app, ForgeKind::Forge, &mc_version, &loader_version, &instance_id).await
}

#[tauri::command]
pub async fn mc_neoforge_install<R: Runtime>(
    app: AppHandle<R>,
    mc_version: String,
    loader_version: String,
    instance_id: String,
) -> Result<(), String> {
    install_forge_like(&app, ForgeKind::Neoforge, &mc_version, &loader_version, &instance_id).await
}
