// Java runtime management for the native Minecraft launcher.
//
// Two responsibilities:
//   1. **Detect** every Java installation already present on the machine
//      (env var, well-known install dirs, our own `runtimes/` folder),
//      identify each one's major version, and return the list to the UI.
//   2. **Install** a missing major version automatically by downloading
//      Adoptium Temurin JRE from `api.adoptium.net` and extracting it
//      into `<APPDATA>/Simple Launcher/minecraft/runtimes/java-{N}/`.
//
// Resolution policy: when the launcher needs to launch Minecraft X.Y.Z,
// `resolve(mc_version)` returns the path to a compatible Java, installing
// one on the fly if none is found. MC version → Java major mapping mirrors
// Mojang's official requirements (<= 1.16 → 8, 1.17 → 16, 1.18-1.20.4 → 17,
// >= 1.20.5 → 21).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

// ─── Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInstallation {
    /// Absolute path to the `javaw.exe` binary.
    pub path: String,
    /// Major version (8, 11, 17, 21, …). Falls back to 0 if unparseable.
    pub major_version: u32,
    /// Full version string as reported by `java -version` (e.g. "17.0.12").
    pub version_string: String,
    /// Where this Java was found (`env`, `program-files`, `runtimes`, …).
    /// Useful for telemetry + UI hints ("downloaded by Simple Launcher").
    pub source: String,
    /// True if it lives under our managed `runtimes/` directory and we
    /// can therefore safely uninstall it.
    pub managed: bool,
}

// ─── Paths ────────────────────────────────────────────────────────────

fn launcher_runtimes_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {}", e))?;
    Ok(base.join("minecraft").join("runtimes"))
}

// ─── Detection ────────────────────────────────────────────────────────

/// Walks every place Java might live on a Windows box and gathers a
/// deduplicated list of installations. Order matters: our managed
/// `runtimes/` are first (we trust them), then `JAVA_HOME`, then the
/// common install dirs. Same path appearing twice is collapsed.
pub async fn list_installations<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Vec<JavaInstallation>, String> {
    let mut found: Vec<(PathBuf, &'static str, bool)> = Vec::new();

    // 1. Our managed runtimes/
    let runtimes = launcher_runtimes_dir(app)?;
    if runtimes.exists() {
        if let Ok(mut entries) = fs::read_dir(&runtimes).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let exe = entry.path().join("bin").join("javaw.exe");
                if exe.exists() {
                    found.push((exe, "runtimes", true));
                }
            }
        }
    }

    // 2. JAVA_HOME env var
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let exe = PathBuf::from(&java_home).join("bin").join("javaw.exe");
        if exe.exists() {
            found.push((exe, "env", false));
        }
    }

    // 3. Common install dirs on Windows. We glob each `*` directory and
    //    look for a `bin/javaw.exe` inside. Covers Eclipse Adoptium,
    //    Microsoft OpenJDK, Oracle Java, Zulu and the legacy
    //    AdoptOpenJDK paths.
    let common_roots = [
        r"C:\Program Files\Eclipse Adoptium",
        r"C:\Program Files\Eclipse Foundation",
        r"C:\Program Files\Microsoft",
        r"C:\Program Files\Java",
        r"C:\Program Files\Zulu",
        r"C:\Program Files\AdoptOpenJDK",
        r"C:\Program Files\Amazon Corretto",
        r"C:\Program Files (x86)\Java",
    ];
    for root in common_roots {
        let root = Path::new(root);
        if !root.exists() {
            continue;
        }
        if let Ok(mut entries) = fs::read_dir(root).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let exe = entry.path().join("bin").join("javaw.exe");
                if exe.exists() {
                    found.push((exe, "program-files", false));
                }
            }
        }
    }

    // 4. Probe each candidate with `java -version` to extract the major
    //    version. Drop entries that fail to respond (corrupted install).
    let mut out: Vec<JavaInstallation> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (path, source, managed) in found {
        let canonical = path
            .canonicalize()
            .unwrap_or_else(|_| path.clone())
            .to_string_lossy()
            .to_lowercase();
        if !seen.insert(canonical) {
            continue;
        }
        if let Some((major, full)) = probe_version(&path).await {
            out.push(JavaInstallation {
                path: path.to_string_lossy().into_owned(),
                major_version: major,
                version_string: full,
                source: source.to_string(),
                managed,
            });
        }
    }
    Ok(out)
}

/// Runs `{java} -version` and returns `(major, fullVersion)`. Java
/// historically prints the version banner to **stderr**, so we capture
/// both streams and parse whichever one has content. Times out after
/// 5 s so a hanging binary doesn't stall the whole listing.
async fn probe_version(java_exe: &Path) -> Option<(u32, String)> {
    let java_path = java_exe.with_file_name("java.exe");
    let probe_target = if java_path.exists() {
        java_path
    } else {
        java_exe.to_path_buf()
    };
    let out = tokio::time::timeout(
        Duration::from_secs(5),
        Command::new(&probe_target)
            .arg("-version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    let mut text = String::from_utf8_lossy(&out.stderr).to_string();
    if text.trim().is_empty() {
        text = String::from_utf8_lossy(&out.stdout).to_string();
    }
    parse_java_version(&text)
}

/// Parses output like `openjdk version "17.0.12" 2024-07-16 LTS` or
/// `java version "1.8.0_341"`. Returns `(major, full_string)` —
/// `1.8.0_341` becomes `(8, "1.8.0_341")`, `17.0.12` becomes
/// `(17, "17.0.12")`.
fn parse_java_version(stderr: &str) -> Option<(u32, String)> {
    // Find the first quoted version literal.
    let start = stderr.find('"')?;
    let rest = &stderr[start + 1..];
    let end = rest.find('"')?;
    let full = &rest[..end];
    let mut iter = full.split('.');
    let first: u32 = iter.next()?.parse().ok()?;
    if first == 1 {
        // Legacy "1.X.Y_Z" format → major is X.
        let second: u32 = iter.next()?.parse().ok()?;
        Some((second, full.to_string()))
    } else {
        Some((first, full.to_string()))
    }
}

// ─── MC ↔ Java requirement table ──────────────────────────────────────

/// Returns the major Java version Mojang requires for the given
/// Minecraft release. Mirrors the `javaVersion.majorVersion` field in
/// the version.json manifest, but doesn't need to fetch it: the rules
/// are static.
pub fn required_java_for_mc(mc_version: &str) -> u32 {
    let parts: Vec<u32> = mc_version
        .split('.')
        .filter_map(|s| {
            // Strip trailing characters like `-pre1`, `rc2`, etc.
            let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse().ok()
        })
        .collect();
    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);
    match minor {
        m if m <= 16 => 8,
        17 => 16,
        18 | 19 => 17,
        20 if patch <= 4 => 17,
        _ => 21, // 1.20.5+ and beyond, future-proof
    }
}

// ─── Auto-download Adoptium ──────────────────────────────────────────

/// Downloads + extracts an Adoptium Temurin JRE for the given major
/// version into `<APPDATA>/Simple Launcher/minecraft/runtimes/java-{N}/`.
/// Idempotent: if the runtime already exists and is functional, returns
/// early. Otherwise wipes the directory and starts fresh.
///
/// We use the redirect endpoint
/// `api.adoptium.net/v3/binary/latest/{major}/ga/windows/x64/jre/hotspot/normal/eclipse`
/// which returns a 302 to the actual zip. `reqwest` follows it
/// automatically.
pub async fn install_adoptium<R: Runtime>(
    app: &AppHandle<R>,
    major: u32,
) -> Result<JavaInstallation, String> {
    let runtimes = launcher_runtimes_dir(app)?;
    fs::create_dir_all(&runtimes)
        .await
        .map_err(|e| format!("create runtimes dir failed: {}", e))?;
    let target_dir = runtimes.join(format!("java-{}", major));

    // If we already have it AND it's functional, short-circuit.
    let existing_exe = target_dir.join("bin").join("javaw.exe");
    if existing_exe.exists() {
        if let Some((m, full)) = probe_version(&existing_exe).await {
            if m == major {
                return Ok(JavaInstallation {
                    path: existing_exe.to_string_lossy().into_owned(),
                    major_version: m,
                    version_string: full,
                    source: "runtimes".to_string(),
                    managed: true,
                });
            }
        }
        // Corrupted install — nuke and reinstall.
        let _ = fs::remove_dir_all(&target_dir).await;
    }

    // 1. Hit the Adoptium API to get the redirect URL → zip bytes.
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jre/hotspot/normal/eclipse",
        major
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300)) // generous: JRE is ~50 MB
        .build()
        .map_err(|e| format!("HTTP client init failed: {}", e))?;
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("DL Adoptium failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!(
            "Adoptium HTTP {}: pas de JRE Java {} disponible.",
            res.status(),
            major
        ));
    }
    let zip_bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Lecture ZIP Adoptium échouée : {}", e))?;

    // 2. Write to a temp .zip then extract. We could extract from memory
    //    but the `zip` crate prefers a Seek+Read, and a temp file gives
    //    us better error messages on disk-full / permission issues.
    let temp_zip = runtimes.join(format!("java-{}.zip.tmp", major));
    let mut temp_file = fs::File::create(&temp_zip)
        .await
        .map_err(|e| format!("création .zip temp échouée : {}", e))?;
    temp_file
        .write_all(&zip_bytes)
        .await
        .map_err(|e| format!("écriture .zip temp échouée : {}", e))?;
    temp_file
        .flush()
        .await
        .map_err(|e| format!("flush .zip temp échoué : {}", e))?;
    drop(temp_file);

    // 3. Extract synchronously inside spawn_blocking — `zip` is sync.
    let temp_zip_clone = temp_zip.clone();
    let target_dir_clone = target_dir.clone();
    tokio::task::spawn_blocking(move || extract_zip_flat(&temp_zip_clone, &target_dir_clone))
        .await
        .map_err(|e| format!("extraction join failed: {}", e))??;

    // 4. Cleanup temp file.
    let _ = fs::remove_file(&temp_zip).await;

    // 5. Probe to make sure the extracted JRE works.
    let exe = target_dir.join("bin").join("javaw.exe");
    if !exe.exists() {
        return Err(format!(
            "javaw.exe introuvable après extraction (cherché à : {})",
            exe.display()
        ));
    }
    let (m, full) = probe_version(&exe)
        .await
        .ok_or_else(|| "JRE extraite mais ne répond pas à `java -version`".to_string())?;
    Ok(JavaInstallation {
        path: exe.to_string_lossy().into_owned(),
        major_version: m,
        version_string: full,
        source: "runtimes".to_string(),
        managed: true,
    })
}

/// Extracts a ZIP into `dest`, "flattening" the single top-level folder
/// that Adoptium archives ship with (e.g. `jdk-17.0.12+7-jre/`). The
/// caller passes `dest = .../java-17/`, and we want the JRE files
/// directly inside that — not nested an extra level deep.
fn extract_zip_flat(zip_path: &Path, dest: &Path) -> Result<(), String> {
    use std::fs::File;
    use std::io::BufReader;
    let file = File::open(zip_path).map_err(|e| format!("open zip failed: {}", e))?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("read zip failed: {}", e))?;

    // Detect a common top-level folder. If every entry starts with
    // `prefix/`, we strip it during extraction.
    let prefix: Option<String> = {
        let names: Vec<String> = (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
            .collect();
        let first = names.first().and_then(|n| n.split('/').next()).unwrap_or("");
        if !first.is_empty() && names.iter().all(|n| n.starts_with(&format!("{}/", first)) || n == first || n == &format!("{}/", first)) {
            Some(format!("{}/", first))
        } else {
            None
        }
    };

    std::fs::create_dir_all(dest).map_err(|e| format!("mkdir dest failed: {}", e))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {} failed: {}", i, e))?;
        let raw_name = entry.name().to_string();
        let stripped = match &prefix {
            Some(p) if raw_name.starts_with(p) => &raw_name[p.len()..],
            Some(p) if raw_name.trim_end_matches('/') == p.trim_end_matches('/') => continue,
            _ => &raw_name,
        };
        if stripped.is_empty() {
            continue;
        }
        let out_path = dest.join(stripped);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("mkdir failed: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir parent failed: {}", e))?;
            }
            let mut out_file = File::create(&out_path).map_err(|e| format!("create file failed: {}", e))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("copy entry failed: {}", e))?;
        }
    }
    Ok(())
}

// ─── Public Tauri commands ───────────────────────────────────────────

/// Returns every Java installation we can find on this machine.
#[tauri::command]
pub async fn mc_java_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<JavaInstallation>, String> {
    list_installations(&app).await
}

/// Downloads + extracts an Adoptium JRE for the given major version.
/// Used by the UI's "Install Java N" button or implicitly by
/// `mc_java_resolve`. Idempotent.
#[tauri::command]
pub async fn mc_java_install<R: Runtime>(
    app: AppHandle<R>,
    major: u32,
) -> Result<JavaInstallation, String> {
    install_adoptium(&app, major).await
}

/// Returns the Java installation to use for launching the given MC
/// version. If the **exact** major version we want is already present
/// (managed or system-wide), returns it. Otherwise downloads the
/// Adoptium Temurin JRE for that major on the fly. The returned
/// installation is guaranteed `major_version == required_for_mc`.
///
/// Why we don't accept newer Java versions: NeoForge / Forge use the
/// Java Module System (JPMS) for their `securejarhandler`, and
/// Mojang/Microsoft have tightened module access rules with each
/// release (Java 22 made `--add-opens` warnings into hard errors for
/// some packages, Java 24 removed several legacy reflection
/// workarounds, Java 26 broke `MixinPreProcessor`'s class
/// introspection). Symptom of the bug we hit before this rewrite:
/// crash with `java.lang.ClassNotFoundException: java.lang.Integer`
/// during NeoForge boot when running NeoForge 21.1.x on Java 26.
/// Bytecode itself is backward compatible, but the module layer
/// isn't, so NeoForge / Forge launches need the exact major they
/// were built for. Vanilla and Fabric are also strict-major locked
/// for consistency — installing a 40 MB Temurin JRE is cheap and
/// removes a class of footgun.
#[tauri::command]
pub async fn mc_java_resolve<R: Runtime>(
    app: AppHandle<R>,
    mc_version: String,
) -> Result<JavaInstallation, String> {
    let required = required_java_for_mc(&mc_version);
    let installed = list_installations(&app).await.unwrap_or_default();
    if let Some(exact) = installed.iter().find(|j| j.major_version == required) {
        eprintln!(
            "[mc-java] resolve: MC {} → Java {} HIT (path={}, source={})",
            mc_version, required, exact.path, exact.source
        );
        return Ok(exact.clone());
    }
    eprintln!(
        "[mc-java] resolve: MC {} requires Java {}; not installed (have: {:?}). Auto-downloading Adoptium Temurin {}.",
        mc_version,
        required,
        installed
            .iter()
            .map(|j| j.major_version)
            .collect::<Vec<_>>(),
        required
    );
    install_adoptium(&app, required).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_legacy_java_8() {
        let stderr = r#"java version "1.8.0_341"
Java(TM) SE Runtime Environment (build 1.8.0_341-b10)
Java HotSpot(TM) 64-Bit Server VM (build 25.341-b10, mixed mode)"#;
        assert_eq!(parse_java_version(stderr), Some((8, "1.8.0_341".to_string())));
    }

    #[test]
    fn parse_modern_java_17() {
        let stderr = r#"openjdk version "17.0.12" 2024-07-16 LTS
OpenJDK Runtime Environment Temurin-17.0.12+7 (build 17.0.12+7-LTS)
OpenJDK 64-Bit Server VM Temurin-17.0.12+7 (build 17.0.12+7-LTS, mixed mode)"#;
        assert_eq!(parse_java_version(stderr), Some((17, "17.0.12".to_string())));
    }

    #[test]
    fn mc_to_java_mapping() {
        assert_eq!(required_java_for_mc("1.8.9"), 8);
        assert_eq!(required_java_for_mc("1.16.5"), 8);
        assert_eq!(required_java_for_mc("1.17.1"), 16);
        assert_eq!(required_java_for_mc("1.18.2"), 17);
        assert_eq!(required_java_for_mc("1.19.4"), 17);
        assert_eq!(required_java_for_mc("1.20.1"), 17);
        assert_eq!(required_java_for_mc("1.20.4"), 17);
        assert_eq!(required_java_for_mc("1.20.5"), 21);
        assert_eq!(required_java_for_mc("1.21.4"), 21);
        // Pre-release / RC tags.
        assert_eq!(required_java_for_mc("1.21.4-pre1"), 21);
    }
}
