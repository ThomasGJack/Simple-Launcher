//! Manual single-instance enforcement using Win32 primitives.
//!
//! Replaces `tauri-plugin-single-instance` which had reliability
//! issues in some user setups (mainly when UAC elevation differs
//! between the first and second process, or when antivirus locks
//! the plugin's IPC named pipe). The manual implementation uses
//! only `CreateMutexW` + `CreateEventW` / `OpenEventW` / `SetEvent`
//! which are kernel objects guaranteed to be released by Windows
//! when the owning process dies, even on hard crash.
//!
//! ## Flow
//!
//! 1. **First process** boots :
//!    - `try_acquire_lock()` → `CreateMutexW` → returns Ok(handle).
//!      The handle is leaked so the mutex stays alive for the full
//!      process lifetime (Windows auto-cleanups on exit).
//!    - `install_show_listener(callback)` → spawns a thread that
//!      blocks on the show-event. When signaled, runs the callback
//!      (typically : surface the main window).
//!    - Tauri runs normally.
//!
//! 2. **Second process** boots :
//!    - `try_acquire_lock()` → `CreateMutexW` returns Ok BUT
//!      `GetLastError()` reports `ERROR_ALREADY_EXISTS`. We close
//!      our duplicate handle, then `SetEvent()` on the show-event
//!      to tell the first process "user wants you back, foreground
//!      yourself". Returns Err — caller exits the process.
//!    - The first process's listener thread wakes, runs the
//!      callback. User sees the existing window come to the front.
//!
//! ## Why not the Tauri plugin
//!
//! The plugin in v2.4.2 uses a localhost TCP socket for argv
//! forwarding, which can fail when :
//!   - Windows Defender / a corporate AV blocks the loopback bind
//!   - The user has multiple network interfaces with strict firewall rules
//!   - The launcher is launched simultaneously from two contexts (e.g.
//!     once from the start menu and once from a `.bat` script that
//!     elevates to admin)
//! A simple named mutex doesn't have any of these failure modes.

#![cfg(windows)]

use std::sync::{Arc, Mutex};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
use windows::Win32::System::Threading::{
    CreateEventW, CreateMutexW, OpenEventW, SetEvent, WaitForSingleObject, EVENT_MODIFY_STATE,
    INFINITE,
};

// `Global\\` prefix scopes the kernel object across all user
// sessions, so even if Simple Launcher is somehow running under
// two different user contexts on the same machine, only one can
// hold the lock. The version suffix lets us bump the name if we
// ever need to coexist with an older launcher build during
// migration.
const MUTEX_NAME: &str = "Global\\SimpleLauncher_SingleInstance_Mutex_v1";
const EVENT_NAME: &str = "Global\\SimpleLauncher_ShowEvent_v1";

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Try to acquire the single-instance lock. Returns Ok if this is
/// the FIRST process — caller MUST keep the returned handle alive
/// for the whole process lifetime (just leak it via `Box::leak`).
/// Returns Err if another instance already holds the lock — the
/// caller should signal it via `signal_show()` then exit.
pub fn try_acquire_lock() -> Result<HANDLE, ()> {
    unsafe {
        let name = to_wide(MUTEX_NAME);
        let handle = match CreateMutexW(None, false, PCWSTR(name.as_ptr())) {
            Ok(h) => h,
            Err(err) => {
                eprintln!("[single-instance] CreateMutexW failed: {:?}", err);
                return Err(());
            }
        };
        // GetLastError MUST be checked immediately — even though
        // CreateMutexW returns Ok, ERROR_ALREADY_EXISTS means another
        // process has the same-named mutex.
        let last_err = GetLastError();
        if last_err == ERROR_ALREADY_EXISTS {
            // Drop our duplicate handle. The other process's mutex
            // stays alive ; that's fine.
            let _ = CloseHandle(handle);
            return Err(());
        }
        Ok(handle)
    }
}

/// Signal the existing Simple Launcher instance that a second one
/// tried to launch. The existing instance's listener will surface
/// its main window. Best-effort — silently no-ops if the event
/// can't be opened (e.g. the existing instance is shutting down).
pub fn signal_show() {
    unsafe {
        let name = to_wide(EVENT_NAME);
        match OpenEventW(EVENT_MODIFY_STATE, false, PCWSTR(name.as_ptr())) {
            Ok(event) => {
                let _ = SetEvent(event);
                let _ = CloseHandle(event);
            }
            Err(err) => {
                eprintln!(
                    "[single-instance] OpenEventW failed (existing instance probably down): {:?}",
                    err,
                );
            }
        }
    }
}

/// Spawn a worker thread that blocks on the show-event and runs the
/// given callback every time the event is signaled. The first
/// instance calls this once at startup ; the callback typically
/// surfaces the main window.
///
/// We spawn a background thread because `WaitForSingleObject` with
/// `INFINITE` blocks ; running it on the main thread would freeze
/// Tauri's event loop.
pub fn install_show_listener<F>(callback: F)
where
    F: Fn() + Send + 'static,
{
    let cb = Arc::new(Mutex::new(callback));
    std::thread::spawn(move || {
        unsafe {
            let name = to_wide(EVENT_NAME);
            // `CreateEventW` with `auto-reset = true` (2nd arg) means
            // SetEvent wakes exactly one waiting thread and the
            // event auto-resets to non-signaled. Perfect for our
            // "every time someone signals, run the callback once" flow.
            let event = match CreateEventW(None, false, false, PCWSTR(name.as_ptr())) {
                Ok(h) => h,
                Err(err) => {
                    eprintln!("[single-instance] CreateEventW failed: {:?}", err);
                    return;
                }
            };
            loop {
                let result = WaitForSingleObject(event, INFINITE);
                if result.0 != 0 {
                    // WAIT_OBJECT_0 is 0 ; anything else is failure
                    // (timeout impossible with INFINITE, abandoned
                    // mutex, etc.) — bail out so we don't spin.
                    eprintln!(
                        "[single-instance] WaitForSingleObject returned {:?}, exiting listener",
                        result,
                    );
                    break;
                }
                if let Ok(cb) = cb.lock() {
                    cb();
                }
            }
            let _ = CloseHandle(event);
        }
    });
}
