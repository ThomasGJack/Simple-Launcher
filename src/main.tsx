import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installOnlineDetection } from "@/lib/online";
import { bootOverlayHotkey } from "@/lib/overlay";
import "./index.css";

// Boot the network reachability tracker before React mounts so the very
// first paint already knows whether we're online. The detection runs a
// probe every 30 s and listens to native online/offline events, feeding
// `useOnlineStore`.
installOnlineDetection();

// Register the in-game overlay global hotkey on startup. Reads the
// user's saved binding (default Ctrl+Shift+O) and asks Tauri's
// global-shortcut plugin to bind it OS-wide. Best-effort — failures
// (e.g. another app already owns the combo) are logged, the launcher
// still works without the overlay.
bootOverlayHotkey().catch((err) => {
  console.warn("[overlay] failed to register hotkey:", err);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
