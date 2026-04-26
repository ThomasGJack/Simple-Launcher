# Simple Launcher

Launcher Windows multi-jeux modulaire — interface frameless, animations gaming, backend Firebase, auth Discord.

Voir [`PLAN.md`](./PLAN.md) pour le plan complet.

## Stack
- Tauri 2 (Rust + WebView2)
- React 19 + TypeScript + Vite 7
- Tailwind v4 + Framer Motion + GSAP
- Firebase (Auth via Discord OAuth, Firestore, Storage, Functions)
- Zustand (state)

## Démarrer

Prérequis Windows :
- Node 20+
- Rust stable (`rustup`)
- MSVC Build Tools 2022 (workload C++)

```bash
npm install
cp .env.example .env  # remplir les clés Firebase + Discord
npm run tauri:dev
```

## Structure

```
src/
  components/
    window/   TitleBar custom
    layout/   AppShell, Sidebar, AnimatedBackground
    ui/       PlayButton, ...
  pages/      Home, Library, Login, Settings
  store/      Zustand (auth, ui)
  firebase/   config, auth Discord
  types/      module.ts
  lib/        cn helper
src-tauri/    Rust backend
```
