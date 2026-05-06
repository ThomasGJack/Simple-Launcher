import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Mini-app Vite distincte du launcher. Build vers ../hosting (Firebase
// Hosting). emptyOutDir: false est CRITIQUE pour préserver les
// artefacts gérés par scripts/release-launcher.mjs (Velopack packages,
// /u/ profil public, /download/, /changelog.html, /privacy.html, etc.).
//
// Aliases :
//   `@/...`         résout vers ../src (le LAUNCHER) pour que les
//                   composants importés du launcher gardent leurs
//                   imports `@/lib/cn`, `@/lib/achievements`, etc.
//                   fonctionnels côté site web.
//   `@launcher/...` alias explicite (synonyme de `@/...` ici) pour
//                   les imports clairs côté site.
//   `@/lib/sounds`  override → mockSounds.ts (no-op) pour neutraliser
//                   le WebAudio sur la landing (les hover du PlayButton
//                   ne produisent rien, sinon c'est intrusif).
//
// Le code propre du SITE utilise des imports relatifs (./sections/...,
// ../data/...). Aucun alias dédié n'est nécessaire pour ça.
export default defineConfig({
  // root explicite : sans ça, Vite utilise le cwd (= repo root) comme
  // root, et `outDir: "../hosting"` se résout au mauvais endroit (parent
  // du repo). Avec `root: __dirname` (= site/), `../hosting` = repo/hosting.
  root: __dirname,
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: [
      // L'override doit venir AVANT l'alias générique `@`.
      {
        find: "@/lib/sounds",
        replacement: path.resolve(__dirname, "./src/lib/mockSounds.ts"),
      },
      { find: "@launcher", replacement: path.resolve(__dirname, "../src") },
      { find: /^@\//, replacement: path.resolve(__dirname, "../src") + "/" },
    ],
  },

  build: {
    outDir: "../hosting",
    emptyOutDir: false, // ⚠ ne pas changer — préserve hosting/launcher, hosting/u, etc.
    assetsDir: "assets-site", // évite la collision avec hosting/launcher/
    sourcemap: false,
    // Pas de rollupOptions.input : Vite auto-détecte index.html à la
    // racine du root (site/index.html). Le path absolu via path.resolve
    // confondait Rollup et il créait un sous-dossier site/ dans l'output.
  },

  server: {
    port: 1421, // 1420 est pris par le launcher (strictPort)
    strictPort: false,
  },

  clearScreen: false,
});
