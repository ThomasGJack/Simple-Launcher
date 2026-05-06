mod cache;
mod diagnostic;
mod discord_rpc;
mod log_file;
mod mc_auth;
mod mc_backup;
mod mc_crash;
mod mc_fabric;
mod mc_forge;
mod mc_github;
mod mc_java;
mod mc_launch;
mod mc_modrinth;
mod mc_runtime_deps;
mod mc_vanilla;
mod mc_zip;
mod modules;
mod oauth;
mod overlay;
mod rcon;
#[cfg(windows)]
mod single_instance;
mod tray;
mod velo_updater;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── Single-instance guard (Windows only) ──────────────────────
    //
    // BEFORE any Tauri init : try to acquire a kernel mutex. If
    // another simple-launcher.exe already holds it, signal it to
    // surface its window and exit this process immediately.
    //
    // We deliberately do this before `tauri::Builder::default()` —
    // any work after we know we're a duplicate is wasted.
    #[cfg(windows)]
    let _instance_lock = match single_instance::try_acquire_lock() {
        Ok(handle) => {
            // Leak the handle into a Box so it lives for the full
            // process lifetime (Windows releases the mutex when the
            // owning process exits, regardless of leak / drop).
            Box::leak(Box::new(handle))
        }
        Err(()) => {
            eprintln!(
                "[single-instance] another Simple Launcher is already running — \
                 signaling it and exiting."
            );
            single_instance::signal_show();
            std::process::exit(0);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // tauri-plugin-updater retiré au profit de Velopack — voir
        // src/velo_updater.rs pour les commands check/download/apply.
        // Velopack apporte les delta updates et un installer qui
        // remplace NSIS sans ses dialogs Windows-classiques.
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // Global hotkey plugin — drives the in-game overlay toggle
        // (default Ctrl+Shift+O). The actual binding is created
        // lazily from the frontend on app boot via
        // `overlay_register_hotkey` once the saved preference is
        // loaded from localStorage.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(modules::LaunchTracker::new())
        .manage(discord_rpc::DiscordRpc::new())
        .manage(rcon::RconRegistry::new())
        .manage(log_file::LogFileState::new())
        .manage(mc_auth::McAuthState::new())
        .manage(overlay::OverlayState::new())
        .manage(velo_updater::VeloState::new())
        .on_window_event(|window, event| {
            // Intercept the main-window close request: instead of exiting
            // the app, hide the window and let the tray icon stay alive.
            // The user explicitly quits from the tray menu when they want
            // to fully close. This matches Discord/Steam UX.
            //
            // Same logic for the overlay window — we want hiding (so the
            // global hotkey can re-show it later) instead of destroying
            // the webview each time the user dismisses it.
            if window.label() == "main" || window.label() == "overlay" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            let discord = app.state::<discord_rpc::DiscordRpc>();
            let arc = discord.arc();
            tauri::async_runtime::spawn(async move {
                arc.set_idle().await;
            });
            // Install the system-tray icon — non-fatal if it fails (e.g.
            // headless Windows / CI). Just log and continue.
            if let Err(err) = tray::install(app.handle()) {
                eprintln!("[tray] install failed: {}", err);
            }
            // Listen for "second instance was blocked" events from
            // single_instance.rs — when a 2nd simple-launcher.exe
            // tries to launch and signals our event, surface the
            // main window so the user sees the existing app respond.
            #[cfg(windows)]
            {
                let app_handle = app.handle().clone();
                single_instance::install_show_listener(move || {
                    eprintln!(
                        "[single-instance] second invocation signaled — surfacing main window"
                    );
                    if let Some(window) = app_handle.get_webview_window("main") {
                        // Order matters : unminimize → show → AOT
                        // burst → focus → AOT off. The always-on-top
                        // burst is a Windows trick to bypass the
                        // foreground-lock that prevents a non-
                        // foreground process from stealing focus.
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_focus();
                        let _ = window.set_always_on_top(false);
                        // Drive the tray-discovered achievement (#39)
                        // and any other UI hooks that listen for
                        // "user came back from tray".
                        let _ = app_handle.emit("tray-reopen", ());
                    } else {
                        eprintln!(
                            "[single-instance] listener fired but 'main' window missing — \
                             app shutting down ?"
                        );
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            oauth::start_oauth_listener,
            modules::module_get_state,
            modules::module_install_or_update,
            modules::module_launch_hosted,
            modules::module_launch_shortcut,
            modules::module_uninstall,
            // Prism-era commands removed in v26.05.03.8 — the in-house
            // native chain (`mc_native_*` + `mc_vanilla_*` + `mc_fabric_*` +
            // `mc_forge_*` + `mc_zip_*` + `mc_modrinth_*`) is now the only
            // supported Minecraft launch path.
            rcon::rcon_connect,
            rcon::rcon_send,
            rcon::rcon_close,
            log_file::logs_append,
            log_file::logs_read,
            log_file::logs_take_orphans,
            log_file::logs_delete,
            log_file::logs_dir_path,
            log_file::logs_fetch_text,
            mc_auth::mc_auth_login,
            mc_auth::mc_auth_list,
            mc_auth::mc_auth_logout,
            mc_auth::mc_auth_refresh,
            mc_auth::mc_auth_fallback_start,
            mc_auth::mc_auth_fallback_complete,
            mc_java::mc_java_list,
            mc_java::mc_java_install,
            mc_java::mc_java_resolve,
            mc_vanilla::mc_vanilla_list_versions,
            mc_vanilla::mc_vanilla_install,
            mc_vanilla::mc_vanilla_is_installed,
            mc_vanilla::mc_native_uninstall_instance,
            mc_vanilla::mc_native_open_instance_dir,
            mc_fabric::mc_fabric_list_game_versions,
            mc_fabric::mc_fabric_list_loader_versions,
            mc_fabric::mc_fabric_install,
            mc_forge::mc_forge_list_versions,
            mc_forge::mc_neoforge_list_versions,
            mc_forge::mc_forge_install,
            mc_forge::mc_neoforge_install,
            mc_modrinth::mc_modrinth_search,
            mc_modrinth::mc_modrinth_list_versions,
            mc_modrinth::mc_modrinth_install,
            mc_zip::mc_zip_install,
            mc_zip::mc_zip_read_manifest_url,
            mc_runtime_deps::mc_runtime_deps_check,
            mc_runtime_deps::mc_runtime_deps_install,
            diagnostic::diagnostic_run,
            cache::cache_calculate_size,
            cache::cache_purge,
            mc_backup::mc_backup_create,
            mc_backup::mc_backup_list,
            mc_backup::mc_backup_delete,
            mc_backup::mc_backup_restore,
            mc_crash::mc_crash_collect,
            mc_github::gh_token_set,
            mc_github::gh_token_status,
            mc_github::gh_token_clear,
            mc_github::gh_list_repos,
            mc_github::gh_upload_modpack,
            mc_launch::mc_native_launch,
            overlay::overlay_register_hotkey,
            overlay::overlay_unregister_hotkey,
            overlay::overlay_toggle,
            overlay::overlay_show,
            overlay::overlay_hide,
            // Velopack auto-updater commands (replaces tauri-plugin-updater)
            velo_updater::velo_check,
            velo_updater::velo_download,
            velo_updater::velo_apply,
            velo_updater::velo_current_version,
            velo_updater::velo_is_installed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
