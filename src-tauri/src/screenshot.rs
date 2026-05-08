// Capture d'écran cross-platform via le crate `screenshots`. Sur
// Windows utilise GDI BitBlt + DesktopWindowXamlSource. Capture tout
// le monitor primaire ; multi-monitors = TODO Phase ultérieure.
//
// Le frontend appelle `screenshot_capture()` qui retourne les bytes
// PNG (Base64 ou Vec<u8> selon le tooling). On retourne un PNG complet
// que le frontend peut sauver via la dialog plugin ou afficher.

use std::io::Cursor;

use image::ImageEncoder;
use screenshots::Screen;

/// Capture l'écran principal et retourne les bytes PNG. Le caller
/// (frontend) peut soit afficher le PNG, soit le sauver sur disque
/// via le plugin Tauri dialog, soit l'uploader vers Firebase Storage.
#[tauri::command]
pub async fn screenshot_capture() -> Result<Vec<u8>, String> {
    // Tâche bloquante — la lecture du framebuffer GDI est synchrone.
    tauri::async_runtime::spawn_blocking(|| -> Result<Vec<u8>, String> {
        let screens = Screen::all().map_err(|e| format!("enum monitors: {}", e))?;
        let screen = screens
            .into_iter()
            .next()
            .ok_or_else(|| "Aucun écran détecté".to_string())?;
        let img = screen
            .capture()
            .map_err(|e| format!("capture failed: {}", e))?;

        let width = img.width();
        let height = img.height();
        let raw = img.into_raw();

        // Encode en PNG. On utilise PngEncoder du crate image (rgba8).
        let mut buf = Cursor::new(Vec::<u8>::with_capacity((width * height * 4) as usize));
        let encoder = image::codecs::png::PngEncoder::new(&mut buf);
        encoder
            .write_image(&raw, width, height, image::ExtendedColorType::Rgba8)
            .map_err(|e| format!("png encode: {}", e))?;
        Ok(buf.into_inner())
    })
    .await
    .map_err(|e| format!("join: {}", e))?
}
