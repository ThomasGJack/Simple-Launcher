mod discord_rpc;
mod modules;
mod oauth;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(modules::LaunchTracker::new())
        .manage(discord_rpc::DiscordRpc::new())
        .setup(|app| {
            let discord = app.state::<discord_rpc::DiscordRpc>();
            let arc = discord.arc();
            tauri::async_runtime::spawn(async move {
                arc.set_idle().await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            oauth::start_oauth_listener,
            modules::module_get_state,
            modules::module_install_or_update,
            modules::module_launch_hosted,
            modules::module_launch_shortcut,
            modules::module_uninstall,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
