import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayApp } from "@/components/overlay/OverlayApp";
import "./index.css";

/**
 * Entry point for the in-game overlay window. Loaded by `overlay.html`
 * which Tauri opens as the secondary window labelled `overlay`. The
 * overlay window is configured in `tauri.conf.json` as transparent +
 * borderless + always-on-top + hidden-by-default ; the actual UI
 * lives in `<OverlayApp>`.
 *
 * This is a deliberately tiny React tree — no router, no Sidebar, no
 * page transitions. The overlay shows the user's friends + DMs +
 * notifications and nothing else, so we ship the smallest possible
 * bundle for the overlay code path.
 */
ReactDOM.createRoot(document.getElementById("overlay-root") as HTMLElement).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
