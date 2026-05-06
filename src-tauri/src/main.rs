// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // VelopackApp MUST run before any other init — the launcher exe
    // is invoked with hidden CLI flags during install / update /
    // uninstall (e.g. `--veloapp-install 1.2.3`), and VelopackApp
    // intercepts those, performs the requested action, and exits the
    // process. If we let Tauri spin up first, the user would see a
    // flash of UI before the install/update completes, or worse, a
    // race condition.
    velopack::VelopackApp::build().run();

    simple_launcher_lib::run()
}
