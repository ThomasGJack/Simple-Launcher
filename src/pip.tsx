import React from "react";
import ReactDOM from "react-dom/client";
import { PipApp } from "@/components/pip/PipApp";
import { installContextMenuSuppression } from "@/lib/contextMenu";
import "./index.css";

installContextMenuSuppression();

/**
 * Entry-point pour la fenêtre Picture-in-Picture. Chargé par `pip.html`
 * que Tauri ouvre comme 4e fenêtre labellée `pip` (cf. tauri.conf.json).
 * La fenêtre est configurée transparent + frameless + always-on-top et
 * démarre cachée — l'user la révèle via un bouton sidebar ou un
 * raccourci custom (cf. customShortcuts).
 *
 * Bundle gardé volontairement light — pas de routing, pas de Sidebar,
 * juste l'UI mini-feed. Tout le code partagé (firebase config, sons,
 * etc.) est hoisté dans des chunks communs avec les autres fenêtres
 * par Vite.
 */
ReactDOM.createRoot(document.getElementById("pip-root") as HTMLElement).render(
  <React.StrictMode>
    <PipApp />
  </React.StrictMode>,
);
