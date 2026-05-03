mod cache;
mod diagnostic;
mod discord_rpc;
mod log_file;
mod mc_auth;
mod mc_backup;
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
mod rcon;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(modules::LaunchTracker::new())
        .manage(discord_rpc::DiscordRpc::new())
        .manage(rcon::RconRegistry::new())
        .manage(log_file::LogFileState::new())
        .manage(mc_auth::McAuthState::new())
        .on_window_event(|window, event| {
            // Intercept the main-window close request: instead of exiting
            // the app, hide the window and let the tray icon stay alive.
            // The user explicitly quits from the tray menu when they want
            // to fully close. This matches Discord/Steam UX.
            if window.label() == "main" {
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
            mc_github::gh_token_set,
            mc_github::gh_token_status,
            mc_github::gh_token_clear,
            mc_github::gh_list_repos,
            mc_github::gh_upload_modpack,
            mc_launch::mc_native_launch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
