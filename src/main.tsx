import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installOnlineDetection } from "@/lib/online";
import "./index.css";

// Boot the network reachability tracker before React mounts so the very
// first paint already knows whether we're online. The detection runs a
// probe every 30 s and listens to native online/offline events, feeding
// `useOnlineStore`.
installOnlineDetection();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
