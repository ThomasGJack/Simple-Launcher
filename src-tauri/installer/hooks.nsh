; Simple Launcher — NSIS installer hooks
;
; These macros are wired into Tauri's NSIS template at the four
; standard lifecycle points (PREINSTALL / POSTINSTALL / PREUNINSTALL
; / POSTUNINSTALL). They run during install execution and can
; manipulate files, registry, MessageBoxes, etc.
;
; Most of the visual chrome (Welcome / Finish pages, header.bmp,
; sidebar.bmp, language selector, install path, run-on-finish
; checkbox) is configured in tauri.conf.json directly — these hooks
; only handle behaviour that needs runtime code.

!macro NSIS_HOOK_PREINSTALL
  ; Best-effort cleanup of stale auto-update markers from previous
  ; versions. Some early dev installs left a partial state file in
  ; %APPDATA%/SimpleLauncher that confuses the new launcher boot
  ; flow. Silently delete if present — no prompt.
  Delete "$APPDATA\SimpleLauncher\.update-marker"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Drop a fresh-install marker so the launcher's first boot can
  ; detect "this is a new install" (vs. an upgrade) and show the
  ; welcome modal accordingly. The marker is purely advisory — the
  ; launcher tolerates it being missing.
  CreateDirectory "$APPDATA\SimpleLauncher"
  FileOpen $0 "$APPDATA\SimpleLauncher\.fresh-install" w
  FileWrite $0 "${VERSION}"
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; No-op — uninstall confirmation is handled by Tauri's default UI.
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean residual marker files so a future reinstall starts fresh.
  ; Doesn't touch user data (saves, screenshots, configs) — those
  ; live elsewhere and stay with the user.
  Delete "$APPDATA\SimpleLauncher\.fresh-install"
  Delete "$APPDATA\SimpleLauncher\.update-marker"
!macroend
