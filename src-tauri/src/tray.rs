//! System tray icon + context menu wiring.
//!
//! Builds an icon in the Windows notification area with three menu items:
//!  - **Ouvrir Simple Launcher** — restores the main window if hidden /
//!    minimized and brings it to the front.
//!  - **Rejoindre la communauté** — opens the Communauté page directly via
//!    a custom event the frontend listens for.
//!  - **Quitter** — properly exits the app (otherwise closing the main
//!    window just hides it).
//!
//! Left-clicking the tray icon also toggles main-window visibility, which
//! matches Discord / Steam behavior users already expect.

use tauri::{
    image::Image,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// Embedded PNG used as the tray icon. We use the 32×32 variant since
/// Windows tray icons render at low resolution — embedding the bigger one
/// would just waste binary size.
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");

/// Installs the tray icon on the given AppHandle. Called once during
/// `setup()` in lib.rs. Returns Ok even when system-tray is unavailable
/// (so the app still launches on systems without a tray, e.g. headless).
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // Build the menu items
    let open = MenuItem::with_id(app, "open", "Ouvrir Simple Launcher", true, None::<&str>)?;
    let community = MenuItem::with_id(app, "community", "Communauté", true, None::<&str>)?;
    let messages = MenuItem::with_id(app, "messages", "Messages", true, None::<&str>)?;
    let library = MenuItem::with_id(app, "library", "Bibliothèque", true, None::<&str>)?;
    let check_update = MenuItem::with_id(
        app,
        "check-update",
        "Chercher une mise à jour",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;

    // A submenu groups the navigation shortcuts so the top-level menu stays
    // short. Order is:
    //   Open / [Quick nav submenu] / -- / Check update / -- / Quit.
    let nav = Submenu::with_items(app, "Naviguer vers", true, &[&community, &messages, &library])?;
    let menu = Menu::with_items(
        app,
        &[&open, &nav, &separator, &check_update, &separator2, &quit],
    )?;

    let icon = Image::from_bytes(TRAY_ICON_BYTES)?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Simple Launcher")
        .icon(icon)
        .menu(&menu)
        // Show the menu on right-click (default Windows behavior); we
        // handle left-click manually to toggle visibility.
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_icon_event)
        .build(app)?;

    Ok(())
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        "open" => show_main_window(app),
        "community" => navigate_to(app, "community", None),
        "messages" => navigate_to(app, "messages", None),
        "library" => navigate_to(app, "library", None),
        "check-update" => {
            // Make sure the main window is up so the user can see the
            // result toast/modal, then forward to the frontend updater.
            // The TS side (UpdateBanner) listens for `tray-check-update`,
            // re-runs the same `check()` it does on its 2-min poll, and
            // surfaces feedback even when no update is available
            // ("Tu es déjà à jour" toast) — which the silent poll never
            // does.
            show_main_window(app);
            let _ = app.emit("tray-check-update", ());
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

fn handle_icon_event<R: Runtime>(tray: &tauri::tray::TrayIcon<R>, event: TrayIconEvent) {
    // Left single-click → toggle visibility (show if hidden, hide if shown
    // and focused, focus if shown but unfocused).
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let app = tray.app_handle();
        toggle_main_window(app);
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        // Only emit `tray-reopen` when the window was actually hidden —
        // not when the user clicks the tray on a window that was just
        // unfocused. This drives the "Discret" achievement (#39) which
        // requires the user to have closed-to-tray then come back.
        let was_hidden = !window.is_visible().unwrap_or(true);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if was_hidden {
            let _ = app.emit("tray-reopen", ());
        }
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else { return };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    if visible && focused {
        let _ = window.hide();
    } else {
        let was_hidden = !visible;
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if was_hidden {
            let _ = app.emit("tray-reopen", ());
        }
    }
}

fn navigate_to<R: Runtime>(app: &AppHandle<R>, route: &str, payload: Option<&str>) {
    show_main_window(app);
    // Frontend listens for "tray-navigate" events and dispatches into the UI store.
    let _ = app.emit(
        "tray-navigate",
        serde_json::json!({ "route": route, "payload": payload }),
    );
}
