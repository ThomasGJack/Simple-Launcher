/**
 * Suppress the native browser right-click context menu globally so
 * the launcher feels like a native app rather than a webview.
 *
 * The default Tauri webview shows a Chromium-style context menu with
 * "Reload", "Inspect element", "Save as…", "Back" — entirely out of
 * place in a polished launcher UI and a giveaway that we're not a
 * "real" Windows app.
 *
 * We install a single document-level listener that calls
 * preventDefault() on every contextmenu event. Components that want
 * to surface their OWN custom menu (e.g. the crew context menu in
 * CrewsPage) attach an `onContextMenu` handler that calls
 * preventDefault() and renders the popup. Those handlers fire BEFORE
 * the document-level one (event bubbles up from target → document) so
 * by the time we get the event, the component has already done its
 * job.
 *
 * Exception : we let the native menu through on `<input>` /
 * `<textarea>` elements so the user can still copy / paste / select
 * with right-click. Without this, a right-click in the message
 * composer would feel completely broken.
 */
export function installContextMenuSuppression(): void {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "contextmenu",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Allow native right-click in editable fields so copy/paste
      // still works.
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (target.isContentEditable) return;
      // For everything else, suppress the native Chromium menu.
      // Components with their own onContextMenu handlers have
      // already run by now (capturing phase fires first), so this
      // only kills the default fallback.
      e.preventDefault();
    },
    // Listen on the bubbling phase so per-component handlers fire
    // first.
    false,
  );
}
