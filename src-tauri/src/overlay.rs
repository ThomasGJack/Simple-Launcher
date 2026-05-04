//! In-game overlay window — a transparent always-on-top window that
//! the user can toggle over any running game (in borderless / windowed
//! mode) via a global hotkey.
//!
//! The overlay window is declared in `tauri.conf.json` with
//! `visible: false` so it boots hidden. The frontend calls
//! `overlay_register_hotkey` on startup with the user's saved shortcut
//! (default `Ctrl+Shift+O`); pressing the combo at any moment — even
//! while the launcher itself is in the system tray — toggles the
//! overlay's visibility on top of the foreground game.
//!
//! Limitations :
//!   - Works for games running in *borderless* or *windowed* mode
//!     (default for most modern titles : Minecraft, Fortnite, Valorant,
//!     etc.). The Windows compositor lets transparent always-on-top
//!     windows paint above any non-exclusive surface.
//!   - Does **not** work for games running in *exclusive fullscreen*
//!     (rare today, mostly old DirectX 9 titles). Those bypass the
//!     compositor entirely. The user can usually toggle the game to
//!     borderless mode in its options.
//!
//! No DLL injection, no anti-cheat risk, no admin rights required.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

/// Tracks the currently registered shortcut so we can unregister it
/// before binding a new one (the plugin doesn't support replacing in
/// place — repeated `register` calls accumulate, which would multi-fire
/// the toggle handler).
#[derive(Default)]
pub struct OverlayState {
    current: Mutex<Option<Shortcut>>,
}

impl OverlayState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Show the overlay window if hidden, hide it if visible. Called both
/// by the global hotkey handler and by the frontend "Toggle overlay"
/// button (Settings page or sidebar shortcut).
fn toggle_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("overlay") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.set_always_on_top(true);
            }
        }
    } else {
        eprintln!("[overlay] window 'overlay' not found");
    }
}

/// Parse a Tauri-flavoured shortcut string ("Ctrl+Shift+O", "F9",
/// "Alt+Space", …) into a `Shortcut` struct the global-shortcut
/// plugin can register. Returns `None` for malformed input — the
/// caller should fall back to the default `Ctrl+Shift+O`.
fn parse_shortcut(spec: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut key: Option<Code> = None;
    for part in spec.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "alt" | "option" => mods |= Modifiers::ALT,
            "meta" | "cmd" | "super" | "win" => mods |= Modifiers::SUPER,
            other => {
                key = parse_code(other);
            }
        }
    }
    key.map(|code| Shortcut::new(Some(mods), code))
}

/// Map a single key token (`"o"`, `"f9"`, `"space"`, `"1"`) to a
/// `Code` enum value. Conservative whitelist — we don't try to be
/// clever about unusual keys, just cover the common UI shortcuts.
fn parse_code(token: &str) -> Option<Code> {
    let lower = token.to_ascii_lowercase();
    Some(match lower.as_str() {
        // Letters
        "a" => Code::KeyA, "b" => Code::KeyB, "c" => Code::KeyC, "d" => Code::KeyD,
        "e" => Code::KeyE, "f" => Code::KeyF, "g" => Code::KeyG, "h" => Code::KeyH,
        "i" => Code::KeyI, "j" => Code::KeyJ, "k" => Code::KeyK, "l" => Code::KeyL,
        "m" => Code::KeyM, "n" => Code::KeyN, "o" => Code::KeyO, "p" => Code::KeyP,
        "q" => Code::KeyQ, "r" => Code::KeyR, "s" => Code::KeyS, "t" => Code::KeyT,
        "u" => Code::KeyU, "v" => Code::KeyV, "w" => Code::KeyW, "x" => Code::KeyX,
        "y" => Code::KeyY, "z" => Code::KeyZ,
        // Digits
        "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2,
        "3" => Code::Digit3, "4" => Code::Digit4, "5" => Code::Digit5,
        "6" => Code::Digit6, "7" => Code::Digit7, "8" => Code::Digit8,
        "9" => Code::Digit9,
        // Function keys
        "f1" => Code::F1, "f2" => Code::F2, "f3" => Code::F3, "f4" => Code::F4,
        "f5" => Code::F5, "f6" => Code::F6, "f7" => Code::F7, "f8" => Code::F8,
        "f9" => Code::F9, "f10" => Code::F10, "f11" => Code::F11, "f12" => Code::F12,
        // Common UI keys
        "space" => Code::Space,
        "tab" => Code::Tab,
        "escape" | "esc" => Code::Escape,
        "enter" | "return" => Code::Enter,
        _ => return None,
    })
}

/// Registers (or replaces) the global shortcut that toggles the
/// overlay window. Called from the frontend on app boot once the
/// user's saved preference is loaded, and again whenever the user
/// changes the binding in Settings.
#[tauri::command]
pub fn overlay_register_hotkey<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, OverlayState>,
    shortcut: String,
) -> Result<(), String> {
    let parsed = parse_shortcut(&shortcut)
        .ok_or_else(|| format!("Raccourci invalide : '{}'", shortcut))?;

    let gs = app.global_shortcut();
    // Unregister the previous binding before installing the new one.
    if let Some(prev) = state.current.lock().unwrap().take() {
        let _ = gs.unregister(prev);
    }

    let app_handle = app.clone();
    gs.on_shortcut(parsed.clone(), move |_app, _shortcut, event| {
        // The plugin fires twice per press (Pressed + Released). We
        // only act on Pressed so the toggle doesn't immediately undo
        // itself.
        if event.state() == ShortcutState::Pressed {
            toggle_overlay(&app_handle);
        }
    })
    .map_err(|err| format!("Failed to register shortcut: {}", err))?;

    *state.current.lock().unwrap() = Some(parsed);
    Ok(())
}

/// Unregister whatever overlay shortcut is currently bound. Used when
/// the user disables the overlay feature in Settings.
#[tauri::command]
pub fn overlay_unregister_hotkey<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, OverlayState>,
) -> Result<(), String> {
    if let Some(prev) = state.current.lock().unwrap().take() {
        let _ = app.global_shortcut().unregister(prev);
    }
    Ok(())
}

/// Manually toggle the overlay window from the frontend (e.g. from a
/// button in Settings, or a sidebar shortcut). Same effect as pressing
/// the global hotkey.
#[tauri::command]
pub fn overlay_toggle<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    toggle_overlay(&app);
    Ok(())
}

/// Show the overlay window without toggling — used by the frontend's
/// "Open overlay" button when the user wants explicit show without
/// caring about prior state.
#[tauri::command]
pub fn overlay_show<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.set_always_on_top(true);
    }
    Ok(())
}

/// Hide the overlay window. Used when the user clicks "Close" inside
/// the overlay panel.
#[tauri::command]
pub fn overlay_hide<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.hide();
    }
    Ok(())
}
