// Capture d'écran — wrapper TS autour de la command Tauri Rust
// `screenshot_capture` (cf. `src-tauri/src/screenshot.rs`).
//
// MVP : on capture, on save dans le dossier Pictures/SimpleLauncher
// du user via le plugin dialog, et on toast un message de succès.
// L'upload Firebase Storage + organisation par module = POSTMVP.

import { invoke } from "@tauri-apps/api/core";

/**
 * Capture l'écran et déclenche un download du PNG via le browser
 * embedded WebView2 (le user choisit où sauver via la dialog Windows
 * standard de download). Renvoie le filename utilisé.
 *
 * On utilise le fallback Blob URL plutôt que le plugin-fs Tauri
 * (pas dans les deps actuelles — POSTMVP pour bypass la dialog
 * Download standard).
 */
export async function captureAndSave(): Promise<string> {
  const bytes = await invoke<number[]>("screenshot_capture");
  const u8 = new Uint8Array(bytes);

  const defaultName = `simplelauncher-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, -5)}.png`;

  return downloadAsBlobUrl(u8, defaultName);
}

function downloadAsBlobUrl(bytes: Uint8Array, filename: string): string {
  const blob = new Blob([bytes], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
  return filename;
}
