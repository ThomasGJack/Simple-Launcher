//! Picture-in-Picture window — un petit panneau flottant always-on-top
//! que l'user peut afficher pendant qu'un jeu tourne en plein écran
//! borderless. Affiche un mini-feed live : derniers DMs reçus, derniers
//! achievements unlock, status présence des amis (online / lance un
//! jeu). Pas de copie miniature de la main view (complexe à driver
//! depuis WebView2 + interactions limitées) — on reste sur des notifs
//! lightweight qui ne dérangent pas la vision périphérique.
//!
//! Architecture : clone du pattern `overlay.rs` mais sans hotkey global
//! (le PiP se toggle via un bouton sidebar ou un raccourci custom à
//! configurer dans Settings). Window séparée déclarée dans
//! `tauri.conf.json` avec `visible: false` au boot. Une fois affichée,
//! le user peut la repositionner via drag (no-decorations + transparent
//! bg permet le drag depuis n'importe quel point grâce au
//! `data-tauri-drag-region` du frontend).
//!
//! Limitations identiques à overlay :
//!   - Marche en borderless / windowed
//!   - Ne marche PAS en exclusive fullscreen (rare aujourd'hui)
//! L'user a un toggle dans Settings pour déclarer le mode borderless
//! requis.

use tauri::{AppHandle, Manager, Runtime};

/// Show the PiP window if hidden, hide it if visible. Toggle from the
/// sidebar button or a custom keyboard shortcut bound via the `shortcuts`
/// system (cf. shortcuts.rs / customShortcuts.ts).
fn toggle_pip<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("pip") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_always_on_top(true);
                // Pas de set_focus : on ne veut PAS voler le focus du
                // jeu actif sous-jacent. La PiP reste juste affichée
                // par-dessus, le clavier va toujours au jeu.
            }
        }
    } else {
        eprintln!("[pip] window 'pip' not found");
    }
}

/// Toggle visible/hidden — appelé depuis le frontend (bouton Settings
/// ou raccourci custom dispatch).
#[tauri::command]
pub fn pip_toggle<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    toggle_pip(&app);
    Ok(())
}

/// Show the PiP window unconditionally. Utile pour le bouton "Tester
/// la PiP" dans Settings — l'user veut voir le résultat sans avoir
/// à toggle deux fois s'il était caché.
#[tauri::command]
pub fn pip_show<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pip") {
        let _ = window.show();
        let _ = window.set_always_on_top(true);
    }
    Ok(())
}

/// Hide the PiP window. Appelé quand le user clique le X dans la PiP
/// elle-même, ou quand il toggle off depuis Settings.
#[tauri::command]
pub fn pip_hide<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pip") {
        let _ = window.hide();
    }
    Ok(())
}

/// Repositionne et redimensionne la PiP. Appelé après que l'user a
/// drag-and-drop le mini-window — on persiste la position en
/// localStorage côté frontend, et au prochain show on ré-applique via
/// cette commande.
#[tauri::command]
pub fn pip_set_bounds<R: Runtime>(
    app: AppHandle<R>,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pip") {
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: w,
            height: h,
        }));
    }
    Ok(())
}
