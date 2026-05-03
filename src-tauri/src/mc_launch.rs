// Native Minecraft launch path.
//
// Ties together everything that came before: reads the merged
// vanilla + Fabric version JSON, resolves the right Java runtime,
// builds the final `javaw …` command line (classpath + JVM args + main
// class + game args, all with `${variables}` substituted), and spawns
// the process. Stdout + stderr are streamed back to the frontend via
// `mc-launch-log` Tauri events so the UI can show a console.
//
// Out of scope for this module:
//   - Auth (handled by `mc_auth`; we just consume the resulting tokens)
//   - Asset / library DL (already done by `mc_vanilla` and `mc_fabric`)
//   - Mod loader installers other than Fabric (Forge / NeoForge come
//     later)

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::mc_java::mc_java_resolve;
use crate::mc_vanilla::{
    instance_natives_dir, libraries_dir, maven_path, mc_root, versions_dir,
};

// ─── Inputs (from the frontend) ───────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOptions {
    /// Stable instance id (e.g. the Firestore module id). Drives the
    /// per-instance dirs (.minecraft, natives, logs).
    pub instance_id: String,
    /// Vanilla MC version like "1.20.1".
    pub mc_version: String,
    /// "vanilla" or "fabric" (others come later).
    pub loader: String,
    /// Required when `loader == "fabric"`; ignored otherwise.
    pub loader_version: Option<String>,
    /// UUID of the account previously stored via `mc_auth_login` (without
    /// dashes — that's how Mojang returns it).
    pub account_uuid: String,
    /// Heap allocation in MiB. 0 = let JVM pick (= 2 GiB by default).
    #[serde(default)]
    pub max_ram_mb: u32,
    /// Optional extra JVM args, applied AFTER the manifest's args so
    /// they win in case of conflicts.
    #[serde(default)]
    pub extra_jvm_args: Vec<String>,
    /// Optional window resolution. Defaults to 854x480 (Mojang's own).
    #[serde(default)]
    pub resolution: Option<(u32, u32)>,
    /// Optional server address to auto-join on launch
    /// (`host` or `host:port`). When set, we append `--server` and
    /// `--port` to the game args so MC opens directly into the server's
    /// loading screen instead of the main menu.
    #[serde(default)]
    pub server_address: Option<String>,
}

// ─── Logging events ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchLogLine {
    pub instance_id: String,
    pub stream: String, // "stdout" | "stderr" | "info" | "exit"
    pub line: String,
}

fn emit<R: Runtime>(app: &AppHandle<R>, ev: &LaunchLogLine) {
    let _ = app.emit("mc-launch-log", ev);
}

// ─── Vanilla version.json subset (extends mc_vanilla's narrow read) ──

#[derive(Debug, Clone, Deserialize)]
struct LaunchVersionJson {
    #[serde(rename = "mainClass")]
    main_class: String,
    /// Modern args (1.13+) — preferred when present.
    #[serde(default)]
    arguments: Option<ArgumentBlocks>,
    /// Legacy single-string args (pre-1.13).
    #[serde(rename = "minecraftArguments")]
    #[serde(default)]
    minecraft_arguments: Option<String>,
    libraries: Vec<LibraryEntry>,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexRef,
    #[serde(rename = "type")]
    #[serde(default = "default_type")]
    type_: String,
}
fn default_type() -> String {
    "release".into()
}

#[derive(Debug, Clone, Deserialize)]
struct ArgumentBlocks {
    #[serde(default)]
    game: Vec<serde_json::Value>,
    #[serde(default)]
    jvm: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct AssetIndexRef {
    id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryEntry {
    name: String,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<LibraryRule>>,
    natives: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryDownloads {
    artifact: Option<Artifact>,
    /// Pre-1.19 natives lived under a `classifiers.{linux,windows,osx}`
    /// map. We don't currently consume them (modern MC ships natives as
    /// a separate top-level entry per platform), but we keep the field
    /// declared so the version.json round-trips cleanly through serde.
    #[allow(dead_code)]
    classifiers: Option<HashMap<String, Artifact>>,
}

#[derive(Debug, Clone, Deserialize)]
struct Artifact {
    path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryRule {
    action: String,
    os: Option<RuleOs>,
}

#[derive(Debug, Clone, Deserialize)]
struct RuleOs {
    name: Option<String>,
}

// ─── Loader profile (permissive: handles Fabric / Forge / NeoForge) ──
//
// Fabric profile JSONs have minimal libraries (`{name, url}`) and the
// launcher fills in the path via `maven_path()`. Forge and NeoForge
// profiles emitted by their installer's `--installClient` mode produce
// vanilla-compatible libraries (`{name, downloads:{artifact:{path,…}}}`).
// `LoaderProfile` accepts both shapes — we pick `downloads.artifact.path`
// when present, fall back to `maven_path(name)` otherwise.

#[derive(Debug, Clone, Deserialize)]
struct LoaderProfile {
    #[serde(rename = "mainClass")]
    main_class: Option<String>,
    #[serde(default)]
    libraries: Vec<LoaderLibrary>,
    #[serde(default)]
    arguments: Option<ArgumentBlocks>,
    /// Pre-1.13 single-string args (some legacy Forge profiles).
    #[serde(rename = "minecraftArguments")]
    #[serde(default)]
    minecraft_arguments: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LoaderLibrary {
    name: String,
    /// Vanilla/Forge/NeoForge schema.
    downloads: Option<LibraryDownloads>,
    /// Fabric schema — a base Maven URL, with the path inferred from `name`.
    #[allow(dead_code)]
    url: Option<String>,
    rules: Option<Vec<LibraryRule>>,
    natives: Option<HashMap<String, String>>,
}

fn loader_lib_applies_on_windows(rules: &Option<Vec<LibraryRule>>) -> bool {
    library_applies_on_windows(rules)
}
fn loader_lib_natives_classifier(lib: &LoaderLibrary) -> Option<String> {
    lib.natives
        .as_ref()
        .and_then(|m| m.get("windows").cloned())
}

/// Returns the relative path inside `libraries/` for a loader library.
fn loader_lib_path(lib: &LoaderLibrary) -> String {
    lib.downloads
        .as_ref()
        .and_then(|d| d.artifact.as_ref())
        .and_then(|a| a.path.clone())
        .unwrap_or_else(|| maven_path(&lib.name))
}

/// Returns the disk path of the loader's profile JSON for the given
/// (loader, mc_version, loader_version) tuple. Mirrors the layout that
/// each installer produces in `mc_root/versions/`.
fn loader_profile_path<R: Runtime>(
    app: &AppHandle<R>,
    loader: &str,
    mc_version: &str,
    loader_version: &str,
) -> Result<PathBuf, String> {
    let composite_id = match loader {
        "fabric" => format!("fabric-loader-{}-{}", loader_version, mc_version),
        "forge" => format!("{}-forge-{}", mc_version, loader_version),
        "neoforge" => format!("neoforge-{}", loader_version),
        other => return Err(format!("Loader inconnu : {}", other)),
    };
    Ok(versions_dir(app)?
        .join(&composite_id)
        .join(format!("{}.json", composite_id)))
}

// ─── Helpers ──────────────────────────────────────────────────────────

fn library_applies_on_windows(rules: &Option<Vec<LibraryRule>>) -> bool {
    let Some(rules) = rules else {
        return true;
    };
    let mut allowed = false;
    for r in rules {
        let matches = match &r.os {
            None => true,
            Some(os) => os
                .name
                .as_deref()
                .map(|n| n == "windows")
                .unwrap_or(true),
        };
        if matches {
            allowed = r.action == "allow";
        }
    }
    allowed
}

fn windows_natives_classifier(lib: &LibraryEntry) -> Option<String> {
    lib.natives
        .as_ref()
        .and_then(|m| m.get("windows").cloned())
}

/// Substitutes `${var_name}` placeholders in `s` against `vars`. Tokens
/// not in `vars` are left as-is so we can spot what's missing in the
/// emitted command line.
fn subst_vars(s: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            if let Some(close) = s[i + 2..].find('}') {
                let key = &s[i + 2..i + 2 + close];
                if let Some(value) = vars.get(key) {
                    out.push_str(value);
                    i += 2 + close + 1;
                    continue;
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// Set of MC manifest "feature flags" we have enabled. Mojang's modern
/// args have rules like `{"features": {"is_quick_play_singleplayer": true}}`
/// gating optional CLI flags. Any feature NOT in this map is treated as
/// `false`, which excludes its arg from the final command line. Without
/// this gate, MC 1.20+ crashes with "Only one quick play option can be
/// specified" because we'd ship `--quickPlaySingleplayer`,
/// `--quickPlayMultiplayer` AND `--quickPlayRealms` simultaneously.
fn launcher_features() -> HashMap<&'static str, bool> {
    HashMap::from([
        // We always pass `--width`/`--height` from `opts.resolution`, so
        // the resolution-gated args ARE wanted.
        ("has_custom_resolution", true),
        // Everything else stays off: not a demo account, no quick-play
        // (we boot to the main menu), etc.
        ("is_demo_user", false),
        ("has_quick_plays_support", false),
        ("is_quick_play_singleplayer", false),
        ("is_quick_play_multiplayer", false),
        ("is_quick_play_realms", false),
    ])
}

/// Walks the modern args list and pulls out each applicable string,
/// honoring both `os` rules (skip macOS/linux items) AND `features`
/// rules (skip args that need a feature we haven't enabled). Plain
/// strings always pass through. Conditional objects with no matching
/// allow-rule are dropped.
fn flatten_args(items: &[serde_json::Value]) -> Vec<String> {
    let features = launcher_features();
    let mut out = Vec::new();
    for item in items {
        match item {
            serde_json::Value::String(s) => out.push(s.clone()),
            serde_json::Value::Object(map) => {
                let allowed = map
                    .get("rules")
                    .and_then(|v| v.as_array())
                    .map(|rules| {
                        let mut allow = false;
                        for r in rules {
                            let action = r
                                .get("action")
                                .and_then(|v| v.as_str())
                                .unwrap_or("disallow");
                            // OS clause: pass on Windows or when absent.
                            let os_matches = match r
                                .get("os")
                                .and_then(|os| os.get("name"))
                                .and_then(|v| v.as_str())
                            {
                                None => true,
                                Some("windows") => true,
                                _ => false,
                            };
                            // Features clause: every required feature
                            // must equal what we have. Missing key = we
                            // treat it as `false`. This is the bit the
                            // first version was missing.
                            let features_matches = match r
                                .get("features")
                                .and_then(|f| f.as_object())
                            {
                                None => true,
                                Some(req) => req.iter().all(|(k, v)| {
                                    let want = v.as_bool().unwrap_or(false);
                                    features.get(k.as_str()).copied().unwrap_or(false) == want
                                }),
                            };
                            if os_matches && features_matches {
                                allow = action == "allow";
                            }
                        }
                        allow
                    })
                    .unwrap_or(true);
                if !allowed {
                    continue;
                }
                if let Some(value) = map.get("value") {
                    match value {
                        serde_json::Value::String(s) => out.push(s.clone()),
                        serde_json::Value::Array(arr) => {
                            for v in arr {
                                if let Some(s) = v.as_str() {
                                    out.push(s.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    out
}

fn dotted_uuid(uuid: &str) -> String {
    let cleaned: String = uuid.chars().filter(|c| *c != '-').collect();
    if cleaned.len() != 32 {
        return uuid.to_string();
    }
    format!(
        "{}-{}-{}-{}-{}",
        &cleaned[0..8],
        &cleaned[8..12],
        &cleaned[12..16],
        &cleaned[16..20],
        &cleaned[20..32]
    )
}

// ─── Account loader (delegates to mc_auth — handles keyring split) ────

/// Lightweight projection of `mc_auth::McAccount` keeping only what
/// the launch path needs. Built from the canonical loader in
/// `mc_auth::load_account_by_uuid`, which handles the keyring/JSON
/// split internally.
struct StoredMcAccount {
    uuid: String,
    player_name: String,
    mc_access_token: String,
    expires_at: i64,
}

async fn load_account<R: Runtime>(
    app: &AppHandle<R>,
    uuid: &str,
) -> Result<StoredMcAccount, String> {
    let acc = crate::mc_auth::load_account_by_uuid(app, uuid)
        .await?
        .ok_or_else(|| format!("Compte {} introuvable.", uuid))?;
    Ok(StoredMcAccount {
        uuid: acc.uuid,
        player_name: acc.player_name,
        mc_access_token: acc.mc_access_token,
        expires_at: acc.expires_at,
    })
}

/// Returns the account ready to launch: if its access token expires in
/// under 5 minutes (or already expired), runs `mc_auth_refresh` first
/// to mint a fresh one. Falls through to whatever's on disk if the
/// refresh fails — better to attempt the launch and let the user see a
/// 401 from the game than to silently block them on a network blip.
async fn load_and_refresh_account<R: Runtime>(
    app: &AppHandle<R>,
    uuid: &str,
) -> Result<StoredMcAccount, String> {
    let acc = load_account(app, uuid).await?;
    let now = chrono_millis_now();
    let stale = acc.expires_at.saturating_sub(now) < 5 * 60_000;
    if !stale {
        return Ok(acc);
    }
    // Best-effort refresh. Re-load after — `mc_auth_refresh` overwrites
    // the same record with a fresh access token (in keyring).
    if let Err(err) = crate::mc_auth::mc_auth_refresh(app.clone(), uuid.to_string()).await {
        eprintln!("[mc-launch] silent refresh failed: {}", err);
    }
    load_account(app, uuid).await
}

fn chrono_millis_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ─── Main launch path ─────────────────────────────────────────────────

pub async fn launch<R: Runtime>(
    app: AppHandle<R>,
    opts: LaunchOptions,
) -> Result<(), String> {
    // Diagnostic: surface what we received from the frontend so a
    // misconfigured `serverAddress` (None / empty / malformed) is easy
    // to spot in the launch console.
    eprintln!(
        "[mc-launch] launch opts: instance={} mc={} loader={} server_address={:?}",
        opts.instance_id, opts.mc_version, opts.loader, opts.server_address
    );
    emit(
        &app,
        &LaunchLogLine {
            instance_id: opts.instance_id.clone(),
            stream: "info".into(),
            line: match opts.server_address.as_deref() {
                Some(s) if !s.trim().is_empty() => {
                    format!("Auto-connect demandé sur : {}", s)
                }
                _ => "Aucun serveur d'auto-connect configuré (lancement vers le menu principal).".to_string(),
            },
        },
    );

    // 1. Resolve account ─ silent-refreshes the access token if it's
    //    about to expire so the game starts with a healthy session.
    let account = load_and_refresh_account(&app, &opts.account_uuid).await?;
    emit(
        &app,
        &LaunchLogLine {
            instance_id: opts.instance_id.clone(),
            stream: "info".into(),
            line: format!("Compte : {} ({})", account.player_name, &account.uuid[..8]),
        },
    );

    // 2. Resolve Java for this MC version ────────────────────────────
    let java = mc_java_resolve(app.clone(), opts.mc_version.clone()).await?;
    emit(
        &app,
        &LaunchLogLine {
            instance_id: opts.instance_id.clone(),
            stream: "info".into(),
            line: format!("Java : {} ({})", java.version_string, java.path),
        },
    );

    // 3. Read vanilla version.json ────────────────────────────────────
    let vanilla_json_path = versions_dir(&app)?
        .join(&opts.mc_version)
        .join(format!("{}.json", opts.mc_version));
    let vanilla_bytes = fs::read(&vanilla_json_path)
        .await
        .map_err(|e| format!("Lecture {} échouée : {}", vanilla_json_path.display(), e))?;
    let vanilla: LaunchVersionJson = serde_json::from_slice(&vanilla_bytes)
        .map_err(|e| format!("Parse vanilla version.json échoué : {}", e))?;

    // 4. (Optional) Fabric overlay ────────────────────────────────────
    let mut main_class = vanilla.main_class.clone();
    let mut classpath_libs: Vec<PathBuf> = Vec::new();
    let mut extra_game_args: Vec<String> = Vec::new();
    let mut extra_jvm_args: Vec<String> = Vec::new();

    if opts.loader != "vanilla" {
        let loader_version = opts.loader_version.as_deref().ok_or_else(|| {
            format!("loaderVersion requis pour {}.", opts.loader)
        })?;
        let profile_path =
            loader_profile_path(&app, &opts.loader, &opts.mc_version, loader_version)?;
        let profile_bytes = fs::read(&profile_path).await.map_err(|e| {
            format!(
                "Profile {} introuvable ({}). Re-installe le loader. ({})",
                opts.loader,
                profile_path.display(),
                e
            )
        })?;
        let profile: LoaderProfile = serde_json::from_slice(&profile_bytes)
            .map_err(|e| format!("Parse profil {} échoué : {}", opts.loader, e))?;
        if let Some(mc) = profile.main_class {
            main_class = mc;
        }
        let libs_dir = libraries_dir(&app)?;
        for lib in &profile.libraries {
            if !loader_lib_applies_on_windows(&lib.rules) {
                continue;
            }
            // Skip natives-only entries.
            if loader_lib_natives_classifier(lib).is_some()
                && lib
                    .downloads
                    .as_ref()
                    .map(|d| d.artifact.is_none())
                    .unwrap_or(false)
            {
                continue;
            }
            classpath_libs.push(libs_dir.join(loader_lib_path(lib)));
        }
        if let Some(args) = profile.arguments {
            extra_game_args.extend(flatten_args(&args.game));
            extra_jvm_args.extend(flatten_args(&args.jvm));
        } else if let Some(legacy) = &profile.minecraft_arguments {
            // Some old Forge profiles use the pre-1.13 single-string
            // format for game args. Tokenize and append.
            for tok in legacy.split_whitespace() {
                extra_game_args.push(tok.to_string());
            }
        }
    }

    // 5. Build full classpath (vanilla libs + fabric libs + client.jar) ─
    let libs_dir = libraries_dir(&app)?;
    for lib in &vanilla.libraries {
        if !library_applies_on_windows(&lib.rules) {
            continue;
        }
        // Skip libs whose only role is shipping native classifiers — we
        // already extracted those into natives_dir, no need on classpath.
        let has_natives_only =
            windows_natives_classifier(lib).is_some() && lib.downloads.as_ref().map(|d| d.artifact.is_none()).unwrap_or(false);
        if has_natives_only {
            continue;
        }
        let path_rel = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
            .and_then(|a| a.path.clone())
            .unwrap_or_else(|| maven_path(&lib.name));
        classpath_libs.push(libs_dir.join(path_rel));
    }
    let client_jar = versions_dir(&app)?
        .join(&opts.mc_version)
        .join(format!("{}.jar", opts.mc_version));
    classpath_libs.push(client_jar);

    // Deduplicate by absolute path. Loader profiles (Fabric/Forge/
    // NeoForge) often re-list libraries that vanilla also lists at the
    // exact same Maven coordinates — without dedup, the SAME jar lands
    // on the classpath twice. NeoForge's BootstrapLauncher chokes on
    // that with "Duplicate key … jopt-simple-5.0.4.jar" because it
    // builds a `Collectors.toMap()` of every classpath entry. Loader
    // libs are pushed FIRST, so keeping the first occurrence preserves
    // the loader's version when the artifact differs.
    let mut seen = std::collections::HashSet::new();
    classpath_libs.retain(|p| seen.insert(p.clone()));

    let classpath = classpath_libs
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(";"); // Windows separator

    // 6. Build the variable-substitution map ──────────────────────────
    let mc_root = mc_root(&app)?;
    let game_dir = mc_root
        .join("instances")
        .join(&opts.instance_id)
        .join(".minecraft");
    fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| format!("mkdir game_dir failed: {}", e))?;
    let natives_dir = instance_natives_dir(&app, &opts.instance_id)?;
    let assets_root = mc_root.join("assets");
    let libs_root = libraries_dir(&app)?;

    let (res_w, res_h) = opts.resolution.unwrap_or((854, 480));
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", account.player_name.clone());
    vars.insert("auth_uuid", account.uuid.clone());
    vars.insert("auth_access_token", account.mc_access_token.clone());
    vars.insert("auth_xuid", "0".into());
    vars.insert("auth_session", format!("token:{}:{}", account.mc_access_token, account.uuid));
    vars.insert("clientid", "simple-launcher".into());
    vars.insert("user_type", "msa".into());
    vars.insert("user_properties", "{}".into());
    let version_name = if opts.loader == "fabric" {
        format!(
            "fabric-loader-{}-{}",
            opts.loader_version.as_deref().unwrap_or("latest"),
            opts.mc_version
        )
    } else {
        opts.mc_version.clone()
    };
    vars.insert("version_name", version_name.clone());
    vars.insert("version_type", vanilla.type_.clone());
    vars.insert("game_directory", game_dir.to_string_lossy().into_owned());
    vars.insert("assets_root", assets_root.to_string_lossy().into_owned());
    vars.insert("game_assets", assets_root.to_string_lossy().into_owned());
    vars.insert("assets_index_name", vanilla.asset_index.id.clone());
    vars.insert("classpath", classpath);
    vars.insert("classpath_separator", ";".into()); // Windows
    // Forge/NeoForge use this to compose their `-p {module_path}` flag —
    // every entry inside the manifest's `-p` argument is built relative
    // to `${library_directory}`. Missing this var was the root cause of
    // "Unknown module: cpw.mods.securejarhandler" + the IMPL_LOOKUP
    // InaccessibleObjectException at boot.
    vars.insert("library_directory", libs_root.to_string_lossy().into_owned());
    vars.insert("natives_directory", natives_dir.to_string_lossy().into_owned());
    vars.insert("launcher_name", "Simple Launcher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("resolution_width", res_w.to_string());
    vars.insert("resolution_height", res_h.to_string());
    vars.insert("uuid_dotted", dotted_uuid(&account.uuid));

    // 7. Compose JVM args ─────────────────────────────────────────────
    let mut jvm_args: Vec<String> = Vec::new();

    // ── GPU-driver profile trick (CRITICAL on hybrid-GPU laptops) ─────
    //
    // The legendary "MojangTricksIntelDriversForPerformance" hack — a
    // string-matching trick that the official Mojang launcher has been
    // shipping since ~2012 and that Prism/MultiMC inherit verbatim.
    //
    // Why it exists: AMD, Intel and NVIDIA-Optimus drivers all maintain
    // an internal database of "known game executables" (`minecraft.exe`,
    // `cyberpunk2077.exe`, `bf4.exe`, …). When a process spawns, the
    // driver scans BOTH the executable name AND the process command-line
    // for matches against this DB. A hit activates the gaming GPU
    // profile (full perf, all OpenGL features, discrete GPU on hybrid
    // setups). A miss leaves the driver on the "background app" profile
    // — which on certain AMD iGPUs (Vega/RDNA on Ryzen mobile) silently
    // takes BUGGY OpenGL fast-paths in the chunk renderer that produce
    // garbage texture sampling on world geometry while leaving 2D HUD
    // rendering intact (HUD doesn't go through those paths).
    //
    // Symptom we hunted for hours: world renders as random colored noise
    // while HUD stays correct, only on Simple Launcher, not on Prism on
    // the SAME laptop with the SAME mods. Diff-ing Prism's command line
    // (captured from prismlauncher_*.log) revealed this single flag is
    // what Prism ships and we don't.
    //
    // Mechanism: stuff the literal string `minecraft.exe` into the
    // command line via `-XX:HeapDumpPath=…minecraft.exe…`. The flag is
    // a no-op for actual heap-dump behavior (no OOM ever happens here),
    // but the value lands in argv → driver sees `minecraft.exe` → flips
    // to gaming profile → OpenGL works correctly.
    //
    // Don't change this string. The exact filename is what every GPU
    // vendor's driver heuristic has been calibrated against for years.
    jvm_args.push(
        "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump"
            .into(),
    );

    // ── Heap ──
    //
    // Default 4 GiB — modern modded MC (Sodium + Iris + Distant Horizons
    // + ~100 mods) routinely needs at least this. Module-level
    // `maxRamMb` overrides when the admin set one.
    let ram = if opts.max_ram_mb >= 512 {
        opts.max_ram_mb
    } else {
        4096
    };
    jvm_args.push(format!("-Xmx{}M", ram));
    jvm_args.push(format!("-Xms{}M", (ram / 2).max(512)));

    // ── Locale + encoding sanity ──
    //
    // `user.language=en` matches Prism's default and keeps the JVM-level
    // formatting consistent (some mods log in the JVM locale; an
    // `fr_FR` host can break their parsers). MC itself reads its own
    // `options.txt` for in-game language, so this doesn't affect the
    // user-visible UI.
    jvm_args.push("-Duser.language=en".into());
    // UTF-8 is needed otherwise MC corrupts accented characters in
    // chat / file names on French locales.
    jvm_args.push("-Dfile.encoding=UTF-8".into());
    jvm_args.push("-Djava.net.preferIPv4Stack=true".into());

    // NB: previous versions injected "Aikar's flags" (G1NewSizePercent,
    // G1ReservePercent, MaxGCPauseMillis, G1HeapRegionSize). Captured
    // a real Prism launch and confirmed Prism does NOT inject these —
    // it relies on default G1 heuristics. Removed to match Prism so we
    // don't introduce divergent GC behavior we'd then have to debug.

    // Pull in the manifest's JVM args (modern format; legacy versions
    // don't have them and rely on hardcoded sensible defaults).
    if let Some(args) = &vanilla.arguments {
        for raw in flatten_args(&args.jvm) {
            jvm_args.push(subst_vars(&raw, &vars));
        }
    } else {
        // Pre-1.13 fallback: minimum set of JVM args that legacy
        // versions need.
        jvm_args.push(format!(
            "-Djava.library.path={}",
            natives_dir.to_string_lossy()
        ));
        jvm_args.push("-cp".into());
        jvm_args.push(vars.get("classpath").cloned().unwrap_or_default());
    }
    // Fabric-extra JVM args (after vanilla, so they win conflicts).
    for raw in &extra_jvm_args {
        jvm_args.push(subst_vars(raw, &vars));
    }
    // User-provided extras win last.
    for raw in &opts.extra_jvm_args {
        jvm_args.push(subst_vars(raw, &vars));
    }

    // 8. Compose game args ────────────────────────────────────────────
    let mut game_args: Vec<String> = Vec::new();
    if let Some(args) = &vanilla.arguments {
        for raw in flatten_args(&args.game) {
            game_args.push(subst_vars(&raw, &vars));
        }
    } else if let Some(legacy) = &vanilla.minecraft_arguments {
        // Pre-1.13: a single string of space-separated tokens, with the
        // same `${var}` placeholders.
        let substituted = subst_vars(legacy, &vars);
        for tok in substituted.split_whitespace() {
            game_args.push(tok.to_string());
        }
    }
    for raw in &extra_game_args {
        game_args.push(subst_vars(raw, &vars));
    }

    // 8b. Auto-connect to a server if the module has one configured.
    //
    //     We pass BOTH the legacy and modern flag forms so the same
    //     code path works across every MC version we care about:
    //
    //     - `--server <host> --port <n>` — accepted by 1.6 → 1.19.x
    //       and (deprecated but still parsed) on 1.20.x. On 1.20+ this
    //       sometimes lands the player on the multiplayer menu instead
    //       of the server's loading screen depending on the loader.
    //     - `--quickPlayMultiplayer host:port` — added in 1.20.0 as
    //       part of Mojang's "Quick Play" API. This is the canonical
    //       way to bypass the main menu on modern versions and is also
    //       what most mod loaders forward correctly.
    //
    //     Mojang's main class uses joptsimple with
    //     `allowsUnrecognizedOptions`, so passing the modern flag on a
    //     pre-1.20 version is a silent no-op rather than a crash. Same
    //     deal in reverse for the legacy flags on 1.20+.
    //
    //     Accept both `host` and `host:port` user inputs; default port
    //     is 25565 when only a hostname was typed.
    if let Some(addr) = opts.server_address.as_ref().filter(|s| !s.trim().is_empty()) {
        let trimmed = addr.trim();
        let (host, port) = match trimmed.rsplit_once(':') {
            // Make sure the suffix really is a port and not part of an
            // IPv6 literal — if it doesn't parse as u16, treat the whole
            // string as the host.
            Some((h, p)) if p.parse::<u16>().is_ok() => (
                h.to_string(),
                p.parse::<u16>().unwrap_or(25565),
            ),
            _ => (trimmed.to_string(), 25565u16),
        };
        // Legacy form (1.6 → 1.19.x; deprecated on 1.20+)
        game_args.push("--server".to_string());
        game_args.push(host.clone());
        game_args.push("--port".to_string());
        game_args.push(port.to_string());
        // Modern Quick Play form (1.20.0+)
        game_args.push("--quickPlayMultiplayer".to_string());
        game_args.push(format!("{}:{}", host, port));
        emit(
            &app,
            &LaunchLogLine {
                instance_id: opts.instance_id.clone(),
                stream: "info".into(),
                line: format!(
                    "Auto-connect au serveur : {}:{} (legacy + quickPlay)",
                    host, port
                ),
            },
        );
    }

    // 9. Spawn ────────────────────────────────────────────────────────
    let cmd_summary = format!("{} {}", java.path, jvm_args.join(" "));
    emit(
        &app,
        &LaunchLogLine {
            instance_id: opts.instance_id.clone(),
            stream: "info".into(),
            line: format!("Lancement : {} {}", cmd_summary, main_class),
        },
    );
    // Diagnostic: log the final game-args list so we can verify
    // `--server`/`--port` actually made it to the command line. Useful
    // when the auto-connect silently doesn't happen — usually means the
    // module's `server.address` was empty or absent.
    eprintln!(
        "[mc-launch] final game_args ({}): {}",
        game_args.len(),
        game_args.join(" ")
    );
    emit(
        &app,
        &LaunchLogLine {
            instance_id: opts.instance_id.clone(),
            stream: "info".into(),
            line: format!("Game args : {}", game_args.join(" ")),
        },
    );

    let mut command = Command::new(&java.path);
    command.args(&jvm_args).arg(&main_class).args(&game_args);
    command.current_dir(&game_dir);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    // Strip out the global Java-options env vars before spawning. These
    // three are auto-prepended by the JVM to every command line, so a
    // stray `_JAVA_OPTIONS=-Dsun.java2d.opengl=true` set at the user or
    // system level (often left over by old installers, anti-cheats, or
    // Discord/MSI overlays) can silently force software rendering or
    // disable shaders, producing the exact colored-noise symptom we've
    // been chasing on certain laptops. Prism does the same purge for
    // the same reason. We log what we stripped so it's visible if a
    // user ever asks "why did my custom flag not apply".
    for var in ["_JAVA_OPTIONS", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS"] {
        if let Ok(value) = std::env::var(var) {
            eprintln!(
                "[mc-launch] stripping inherited env {}=\"{}\" before spawn",
                var, value
            );
            emit(
                &app,
                &LaunchLogLine {
                    instance_id: opts.instance_id.clone(),
                    stream: "info".into(),
                    line: format!(
                        "Variable d'env Java polluante neutralisée : {}=\"{}\"",
                        var, value
                    ),
                },
            );
        }
        command.env_remove(var);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Spawn javaw échoué : {}", e))?;

    // Stream stdout/stderr line-by-line into Tauri events. The frontend
    // can append them to a console UI.
    let id_for_stdout = opts.instance_id.clone();
    let app_for_stdout = app.clone();
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit(
                    &app_for_stdout,
                    &LaunchLogLine {
                        instance_id: id_for_stdout.clone(),
                        stream: "stdout".into(),
                        line,
                    },
                );
            }
        });
    }
    let id_for_stderr = opts.instance_id.clone();
    let app_for_stderr = app.clone();
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit(
                    &app_for_stderr,
                    &LaunchLogLine {
                        instance_id: id_for_stderr.clone(),
                        stream: "stderr".into(),
                        line,
                    },
                );
            }
        });
    }

    // Watch the exit status and emit a final event so the UI can flip
    // its "running" indicator off + show exit code if non-zero.
    let id_for_exit = opts.instance_id.clone();
    let app_for_exit = app.clone();
    tokio::spawn(async move {
        match child.wait().await {
            Ok(status) => {
                emit(
                    &app_for_exit,
                    &LaunchLogLine {
                        instance_id: id_for_exit,
                        stream: "exit".into(),
                        line: format!("exit code: {:?}", status.code()),
                    },
                );
            }
            Err(err) => {
                emit(
                    &app_for_exit,
                    &LaunchLogLine {
                        instance_id: id_for_exit,
                        stream: "exit".into(),
                        line: format!("wait failed: {}", err),
                    },
                );
            }
        }
    });

    Ok(())
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn mc_native_launch<R: Runtime>(
    app: AppHandle<R>,
    options: LaunchOptions,
) -> Result<(), String> {
    launch(app, options).await
}

// `Path` import keeps clippy happy when no other public API needs it
// outside of internals; silence the unused warning if it ever lands.
#[allow(dead_code)]
fn _unused_path_marker(_p: &Path) {}
