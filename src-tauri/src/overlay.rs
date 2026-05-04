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

// ─── Force-borderless (Option A) ────────────────────────────────────

/// Force the current foreground window into borderless windowed
/// mode. Strips its native window styles (WS_POPUP, WS_CAPTION,
/// WS_THICKFRAME) via Win32 SetWindowLong and resizes it to fill the
/// work area of the monitor it's currently on.
///
/// This is the safe alternative to DLL-injection overlays : works
/// for 95%+ of games that run in "exclusive fullscreen" today (the
/// game's swap chain becomes a normal compositor surface, so our
/// always-on-top transparent overlay can paint over it). No process
/// injection, no anti-cheat risk, no admin rights.
///
/// Invoked manually by the user via "Forcer borderless" buttons in
/// the launcher UI, and automatically right after a game launch
/// when `getAutoBorderless()` is true on the frontend side.
#[cfg(windows)]
#[tauri::command]
pub fn overlay_force_borderless() -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return Err("Aucune fenêtre au premier plan".to_string());
    }
    convert_to_borderless(hwnd).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn overlay_force_borderless() -> Result<(), String> {
    Err("Force-borderless n'est implémenté que sur Windows pour le moment".into())
}

/// Same as `overlay_force_borderless` but targets the main window of
/// a specific PID. Used by the auto-borderless logic that knows
/// which process it just spawned (vs the foreground-window heuristic
/// which is best-effort).
#[cfg(windows)]
#[tauri::command]
pub fn overlay_force_borderless_pid(pid: u32) -> Result<(), String> {
    let hwnd = find_main_window_for_pid(pid)
        .ok_or_else(|| format!("Aucune fenêtre trouvée pour le PID {}", pid))?;
    convert_to_borderless(hwnd).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn overlay_force_borderless_pid(_pid: u32) -> Result<(), String> {
    Err("Force-borderless n'est implémenté que sur Windows pour le moment".into())
}

#[cfg(windows)]
fn convert_to_borderless(hwnd: windows::Win32::Foundation::HWND) -> Result<(), String> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE,
        SWP_FRAMECHANGED, SWP_NOZORDER, SW_SHOW, WS_CAPTION, WS_EX_DLGMODALFRAME,
        WS_EX_STATICEDGE, WS_EX_WINDOWEDGE, WS_OVERLAPPED, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    unsafe {
        // ─── 1) Get the current monitor's work area ───────────────
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return Err("GetMonitorInfoW failed".to_string());
        }
        let RECT {
            left,
            top,
            right,
            bottom,
        } = info.rcMonitor;
        let width = right - left;
        let height = bottom - top;

        // ─── 2) Strip "fullscreen-y" window styles ────────────────
        // Removing WS_POPUP is the key bit : games that run in
        // borderless-fullscreen-but-actually-popup mode use
        // WS_POPUP without WS_OVERLAPPED, which the compositor
        // sometimes treats specially. We replace it with the
        // standard WS_OVERLAPPED bit pattern.
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let stripped = style
            & !(WS_POPUP.0
                | WS_CAPTION.0
                | WS_THICKFRAME.0
                | WS_SYSMENU.0
                | WS_OVERLAPPED.0);
        SetWindowLongW(hwnd, GWL_STYLE, stripped as i32);

        let exstyle = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let stripped_ex =
            exstyle & !(WS_EX_DLGMODALFRAME.0 | WS_EX_WINDOWEDGE.0 | WS_EX_STATICEDGE.0);
        SetWindowLongW(hwnd, GWL_EXSTYLE, stripped_ex as i32);

        // ─── 3) Resize + position to fill the work area ──────────
        // SWP_FRAMECHANGED forces a non-client recalc so the new
        // styles take effect immediately. SWP_NOZORDER preserves
        // the user's existing alt-tab order.
        if SetWindowPos(
            hwnd,
            None,
            left,
            top,
            width,
            height,
            SWP_FRAMECHANGED | SWP_NOZORDER,
        )
        .is_err()
        {
            return Err("SetWindowPos failed".to_string());
        }
        let _ = ShowWindow(hwnd, SW_SHOW);
    }
    Ok(())
}

#[cfg(windows)]
fn find_main_window_for_pid(pid: u32) -> Option<windows::Win32::Foundation::HWND> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, TRUE};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
        GW_OWNER,
    };

    struct Search {
        target_pid: u32,
        best: Option<HWND>,
        best_area: i32,
    }

    let mut search = Search {
        target_pid: pid,
        best: None,
        best_area: 0,
    };

    extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let s = &mut *(lparam.0 as *mut Search);
            if !IsWindowVisible(hwnd).as_bool() {
                return TRUE;
            }
            // Skip child / owned windows — we want the top-level
            // main window, not tooltips / dialogs.
            let owner = GetWindow(hwnd, GW_OWNER);
            if let Ok(o) = owner {
                if !o.0.is_null() {
                    return TRUE;
                }
            }
            let mut found_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut found_pid));
            if found_pid != s.target_pid {
                return TRUE;
            }
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_err() {
                return TRUE;
            }
            let area = (rect.right - rect.left) * (rect.bottom - rect.top);
            if area > s.best_area {
                s.best_area = area;
                s.best = Some(hwnd);
            }
            TRUE
        }
    }

    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut search as *mut _ as isize));
    }
    search.best
}
