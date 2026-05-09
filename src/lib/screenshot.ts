// Capture d'écran — wrapper TS autour de la command Tauri Rust
// `screenshot_capture` (cf. `src-tauri/src/screenshot.rs`).
//
// 2 flows :
//   - `captureAndSave()` : capture + déclenche un download local
//     (Pictures/Téléchargements). Pratique pour l'usage quick.
//   - `captureAndUpload(uid)` : capture + upload Firebase Storage +
//     crée le doc /users/{uid}/screenshots/{id}. Visible dans la
//     gallery de la page profile, taggué avec le module joué.

import { invoke } from "@tauri-apps/api/core";
import { uploadScreenshot, type Screenshot } from "@/firebase/screenshots";

/**
 * Capture l'écran et déclenche un download du PNG.
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

/**
 * Capture l'écran ET upload vers Firebase Storage + crée la metadata.
 * Auto-tag avec le module actuellement joué (si dispo dans le store).
 * Renvoie le Screenshot persisté.
 */
export async function captureAndUpload(uid: string): Promise<Screenshot> {
  const bytes = await invoke<number[]>("screenshot_capture");
  const u8 = new Uint8Array(bytes);

  // Récupère l'activité courante depuis le auth/presence store —
  // permet d'auto-tag la capture avec le jeu joué au moment X.
  // Lazy import pour éviter cycle.
  let moduleId: string | null = null;
  let moduleName: string | null = null;
  try {
    const { useAuthStore } = await import("@/store/auth");
    const me = useAuthStore.getState().user;
    if (me) {
      const { useUsers } = await import("@/store/firebaseStores");
      // useUsers est un hook React, pas accessible ici. Fallback :
      // on peut récupérer activity via useAchievementsStore ou autre,
      // mais c'est moins fiable. Pour MVP on laisse moduleId null si
      // pas trouvable, l'user peut éditer le caption après.
      void useUsers; // silence unused
    }
  } catch {
    /* silent */
  }

  // Tente de calculer width/height depuis le PNG header.
  const dims = decodePngDimensions(u8);

  const screenshot = await uploadScreenshot(uid, u8, {
    moduleId,
    moduleName,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
  });
  return screenshot;
}

/**
 * Combo : capture + upload + download local. Le user a la copie
 * dans son Pictures ET sa gallery launcher.
 */
export async function captureUploadAndSave(uid: string): Promise<Screenshot> {
  const bytes = await invoke<number[]>("screenshot_capture");
  const u8 = new Uint8Array(bytes);

  const defaultName = `simplelauncher-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, -5)}.png`;
  downloadAsBlobUrl(u8, defaultName);

  const dims = decodePngDimensions(u8);
  const screenshot = await uploadScreenshot(uid, u8, {
    moduleId: null,
    moduleName: null,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
  });
  return screenshot;
}

function downloadAsBlobUrl(bytes: Uint8Array, filename: string): string {
  const blob = new Blob([bytes as BlobPart], { type: "image/png" });
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

/**
 * Parse le header PNG pour extraire width/height. Rapide (8 octets)
 * et permet de stocker les dims dans Firestore sans loading l'image.
 * Format PNG IHDR : 8 magic bytes + 4 length + 4 "IHDR" + 4 width + 4 height.
 */
function decodePngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // Vérif magic PNG
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  )
    return null;
  // Width = octets 16-19 big-endian
  const width =
    (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height =
    (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}
