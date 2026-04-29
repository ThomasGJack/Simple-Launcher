mod discord_rpc;
mod minecraft;
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
        .manage(minecraft::McLaunchTracker::new())
        .manage(discord_rpc::DiscordRpc::new())
        .manage(rcon::RconRegistry::new())
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
            minecraft::mc_find_prism,
            minecraft::mc_get_state,
            minecraft::mc_install_modpack,
            minecraft::mc_launch,
            minecraft::mc_uninstall,
            rcon::rcon_connect,
            rcon::rcon_send,
            rcon::rcon_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
