//! Multi-binding global shortcuts — parallèle à `overlay.rs` mais
//! gère plusieurs actions distinctes (capture d'écran, toggle overlay,
//! mute mic, focus chat, etc.). Chaque action a un `id` stable côté
//! frontend, l'utilisateur peut rebinder via Settings.
//!
//! Architecture : sur trigger d'un shortcut, le Rust émet l'event Tauri
//! `shortcut-triggered` avec `action_id` en payload. Le frontend
//! écoute via `listen("shortcut-triggered", …)` et dispatche vers le
//! handler React correspondant. Avantage : aucune logique d'action
//! n'est hardcodée Rust-side, on peut ajouter des nouvelles actions
//! sans toucher au backend.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

/// Stocke les bindings actifs : `action_id` → `Shortcut`. Permet de
/// unregister proprement le shortcut précédent quand un user rebinde
/// (le plugin ne supporte pas le replace in-place).
#[derive(Default)]
pub struct ShortcutsState {
    bindings: Mutex<HashMap<String, Shortcut>>,
}

impl ShortcutsState {
    pub fn new() -> Self {
        Self::default()
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn shortcuts_register<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ShortcutsState>,
    action_id: String,
    spec: String,
) -> Result<(), String> {
    let shortcut = parse_shortcut(&spec)
        .ok_or_else(|| format!("Raccourci invalide : « {} »", spec))?;

    // Unregister previous binding pour ce action_id, le plugin
    // accumule les handlers sinon (toggle multi-fire).
    {
        let mut map = state
            .bindings
            .lock()
            .map_err(|_| "lock poisoned".to_string())?;
        if let Some(old) = map.remove(&action_id) {
            let _ = app.global_shortcut().unregister(old);
        }
    }

    let action_for_handler = action_id.clone();
    let app_for_handler = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_handle, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app_for_handler
                    .emit("shortcut-triggered", action_for_handler.clone());
            }
        })
        .map_err(|e| format!("register failed: {}", e))?;

    state
        .bindings
        .lock()
        .map_err(|_| "lock poisoned".to_string())?
        .insert(action_id, shortcut);
    Ok(())
}

#[tauri::command]
pub async fn shortcuts_unregister<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ShortcutsState>,
    action_id: String,
) -> Result<(), String> {
    let removed = state
        .bindings
        .lock()
        .map_err(|_| "lock poisoned".to_string())?
        .remove(&action_id);
    if let Some(s) = removed {
        let _ = app.global_shortcut().unregister(s);
    }
    Ok(())
}

#[tauri::command]
pub async fn shortcuts_unregister_all<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ShortcutsState>,
) -> Result<(), String> {
    let map: HashMap<String, Shortcut> = std::mem::take(
        &mut *state
            .bindings
            .lock()
            .map_err(|_| "lock poisoned".to_string())?,
    );
    for (_id, s) in map {
        let _ = app.global_shortcut().unregister(s);
    }
    Ok(())
}

// ─── Parsing helpers ─────────────────────────────────────────────────
//
// Note : copy-paste from overlay.rs (parse_shortcut + parse_code). Pas
// extrait en module commun pour l'instant — petit code, le doublon
// vaut moins que le risque de toucher overlay.rs qui marche.

/// Parse une spec textuelle ("Ctrl+Shift+O", "F2", "Alt+Space") en
/// `Shortcut`. Retourne None pour les inputs malformés.
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
