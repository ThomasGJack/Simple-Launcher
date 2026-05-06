import React from "react";
import ReactDOM from "react-dom/client";
import { ToastsApp } from "@/components/overlay/ToastsApp";
import { installContextMenuSuppression } from "@/lib/contextMenu";
import "./index.css";

installContextMenuSuppression();

/**
 * Entry point for the in-game toast notifications window. Loaded by
 * `toasts.html` which Tauri opens as a third window labelled
 * `toasts`. The window is configured in `tauri.conf.json` as
 * transparent + frameless + always-on-top + click-through (set at
 * boot via setIgnoreCursorEvents) — clicks pass through to whatever
 * is underneath (the game), so the user can keep playing while
 * toasts fade in/out in the corner.
 *
 * The actual UI lives in `<ToastsApp>`. Like the overlay, this is a
 * deliberately small React tree — no router, no Sidebar — to keep
 * the bundle for this code path tight.
 */
ReactDOM.createRoot(document.getElementById("toasts-root") as HTMLElement).render(
  <React.StrictMode>
    <ToastsApp />
  </React.StrictMode>,
);
