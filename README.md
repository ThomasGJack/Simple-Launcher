# Simple Launcher

Launcher Windows multi-jeux pour un petit groupe d'amis — interface frameless, animations gaming, backend Firebase, auth Discord. Inclut un launcher Minecraft natif (sans Prism) avec support Modrinth + ZIP custom + Forge / Fabric / NeoForge.

Voir [`PLAN.md`](./PLAN.md) pour le plan complet et [`CHANGELOG.md`](./CHANGELOG.md) pour l'historique des releases.

## Fonctionnalités principales

- **Bibliothèque de jeux** — modules hébergés (binaires uploadés sur Firebase Storage), raccourcis personnels (exe local), modules Minecraft (modpacks)
- **Pages de modules 100 % personnalisables** — builder admin drag & drop avec preview live, 22 types de blocs (hero parallax, gallery, video embed, rich text, feature cards, timeline, citations, CTA, embed HTML sanitizé, etc.), thème configurable par bloc + page, polices Google Fonts au runtime
- **Launcher Minecraft natif** — auth Microsoft (OAuth + PKCE) ou mode secours (paste-URL), DL automatique du JRE Adoptium adapté à la version, install vanilla / Fabric / Forge / NeoForge, support modpacks Modrinth (`.mrpack`) et ZIP CurseForge, console live, RAM configurable, auto-connect serveur (legacy `--server` + Quick Play `--quickPlayMultiplayer`)
- **Hosting modpacks** — upload direct vers Firebase Storage **ou** GitHub Releases (gratuit, 2 GB / fichier, jamais expiré). Picker de repo intégré au panel admin, auto-bootstrap d'un repo vide avec README initial
- **Communauté** — Clans / Crews avec salons, sessions de jeu, profils publics, news avec sondages + réactions, messagerie privée, friends online strip
- **VIP / Soutien** — 3 tiers (1 € / 5 € / 10 € par mois) avec effets visuels premium (3D tilt, count-up, ribbon shimmer, particules)
- **Tray Windows** — l'app continue de tourner dans la barre système au lieu de quitter au close, comme Discord/Steam

## Stack

| Couche | Tech |
|---|---|
| Bureau | **Tauri 2** (Rust + WebView2) |
| UI | **React 19** + TypeScript + Vite 7 |
| Style | **Tailwind v4** + Framer Motion + GSAP |
| State | **Zustand** (stores ref-counted pour les watchers Firestore) |
| Backend | **Firebase** (Auth Discord OAuth, Firestore, Storage, Functions) |
| Auth Minecraft | OAuth Microsoft v2.0 (Azure app + mode secours legacy MSA) |
| Crypto secrets | `keyring` (Windows Credential Manager) + fallback fichier JSON |

## Démarrer

### Prérequis Windows

- Node 20+
- Rust stable (`rustup`)
- MSVC Build Tools 2022 (workload C++)

### Installation

```powershell
npm install
cp .env.example .env  # remplir les clés Firebase + Discord
npm run tauri:dev
```

### Build production

```powershell
npm run tauri:build
```

Le `.msi` final apparaît dans `src-tauri/target/release/bundle/msi/`. L'auto-update via `tauri-plugin-updater` lit le manifest hosté sur Firebase Hosting.

## Configuration `.env`

Variables critiques (voir `.env.example`) :

- `VITE_FIREBASE_*` — clés Firebase (toutes obligatoires)
- `VITE_DISCORD_CLIENT_ID` — ID OAuth Discord (login)
- `VITE_DISCORD_REDIRECT_URI` — URL de callback OAuth (`http://localhost:14257/callback` en dev)
- `VITE_CURSEFORGE_API_KEY` — optionnel, pour la résolution per-mod CurseForge (legacy chemin Prism)

## Hosting modpacks Minecraft

Trois options selon ta situation :

1. **GitHub Releases (recommandé)** — gratuit, 2 GB / fichier, jamais expiré.
   1. Va dans Admin → ton module Minecraft → bascule l'upload sur « GitHub Releases »
   2. Clique « Configurer GitHub » la première fois → suis les instructions pour générer un PAT (Personal Access Token classique avec scope `public_repo`) → colle-le
   3. Le picker de repo apparaît. Si t'as pas de repo dédié, clique « Créer un repo sur GitHub » (un public vide suffit, le launcher pousse automatiquement un README initial pour que GitHub accepte la première release)
   4. Drag-drop ton ZIP / `.mrpack` → l'URL de DL est collée auto dans le champ `nativeModpackUrl`

2. **Firebase Storage** — pratique pour des packs petits (< 50 Mo) que tu uploades directement depuis l'admin sans étape intermédiaire. Limite la facture si tu mutualises plusieurs gros modpacks.

3. **Pixeldrain / Google Drive / Catbox** — colle l'URL de partage publique dans le champ `nativeModpackUrl`. Le launcher convertit automatiquement les URLs « share » en URLs de DL anonyme.

⚠️ **OneDrive n'est plus supporté** — Microsoft a verrouillé l'API anonyme en 2024-2025. Bascule sur GitHub Releases.

## Mode natif Minecraft

Le toggle « Mode natif (sans Prism) » dans le panel admin d'un module Minecraft débloque la chaîne native :

- **Version MC pinnée** depuis le `version_manifest_v2.json` Mojang (Releases / Snapshots / Alpha / Beta)
- **Loader** au choix : Vanilla, Fabric (CDN `meta.fabricmc.net`), Forge / NeoForge (installer JAR `--installClient` headless)
- **Source de modpack** : aucun, Modrinth (recherche intégrée + DL automatique des mods), ou ZIP custom (export CurseForge bundled)
- **RAM configurable** — slider 1-16 GiB sauvegardé par module
- **Serveur d'auto-connect** — si renseigné dans la section « Serveur Minecraft » de l'admin, MC plonge directement dans l'écran de loading du serveur

Le bouton « Lancer » sur la page module fait toute la chaîne en un clic : refresh silencieux du token MS si expiration imminente, install vanilla + loader si manquants, install modpack, build de la commande JVM avec substitution des variables `${classpath}`, `${assets_root}`, etc., spawn du `javaw` avec stdout/stderr streamés en console live.

## Structure du repo

```
src/
  components/
    window/         TitleBar custom (drag region Tauri)
    layout/         AppShell, Sidebar, AnimatedBackground
    ui/             PlayButton (réactif au thème), Particles, Mascot, Skeleton
    library/        ModuleCard, ModulePreviewCard, ShortcutForm, MinecraftActionPanel
    module-blocks/  22 composants des blocs custom + BlockRenderer + BlockShell
    admin/          AdminPage tabs, NewsManager, CrewsManager, LogsManager, MinecraftNativeBuilder
    admin/builder/  Builder DnD : Palette, Canvas, Inspector, fields, useBuilderState
  pages/            Home, Library, Login, Settings, Admin, AdminPageBuilder, ModuleDetailPage, …
  store/            Zustand : auth, ui, firebaseStores (ref-counted watchers)
  firebase/         config, auth Discord OAuth, modules, news, conversations, …
  types/            module.ts (LauncherModule discriminated union), moduleBlocks.ts (V2 schema)
  lib/              cn, mcAuth, mcLaunch, mcVanilla, mcFabric, mcForge, mcModrinth, mcZip,
                    mcGithub, modulePageMigration, blockRegistry, sanitizeHtml, …

src-tauri/
  src/
    lib.rs          Point d'entrée Tauri + invoke_handler
    minecraft.rs    Chemin Prism legacy (find_prism, install modpack via --import)
    mc_auth.rs      OAuth MS + Xbox Live + XSTS + Mojang ; storage hybride keyring/JSON
    mc_java.rs      Détection JRE installées + auto-DL Adoptium Temurin
    mc_vanilla.rs   DL parallèle vanilla : version_manifest, libraries, assets, natives
    mc_fabric.rs    Install Fabric (CDN meta.fabricmc.net + libs Maven)
    mc_forge.rs     Install Forge / NeoForge (installer JAR headless)
    mc_modrinth.rs  Install pack .mrpack (parse manifest + DL parallèle des mods)
    mc_zip.rs       Install pack ZIP custom (CurseForge fat-zip ou flat) + streaming DL
    mc_launch.rs    Build commande JVM + spawn + streaming logs ; auto-connect serveur
    mc_github.rs    GitHub Releases (PAT + repo list + upload modpack avec progress)
    rcon.rs         RCON pour les modules avec serveur dédié
    discord_rpc.rs  Rich Presence Discord
    log_file.rs     Logs des launchers vers fichier rotatif
    tray.rs         Système tray avec menu contextuel
    oauth.rs        Loopback HTTP pour callback OAuth Discord
```

## Scripts utiles

| Commande | Effet |
|---|---|
| `npm run tauri:dev` | Lance le launcher en dev (HMR Vite + recompile Rust à chaque save) |
| `npm run tauri:build` | Build prod (`.msi` signé) |
| `npm run release:launcher` | Bump version, déplace `[Unreleased]` du CHANGELOG vers `[X.Y.Z] - YYYY-MM-DD`, commit, tag |
| `npx tsc --noEmit` | Type-check sans émettre de fichier |
| `cd src-tauri && cargo build` | Compile juste le backend Rust (utile pour itérer sans HMR) |

## Sécurité & vie privée

- **Tokens MS chiffrés** via le Windows Credential Manager (avec fallback JSON pour les Windows où le keyring est flaky — observé en pratique)
- **Refresh tokens** stockés en local uniquement (`%APPDATA%\Simple Launcher\mc_accounts.json`), jamais envoyés à un backend tiers
- **PAT GitHub** chiffré au repos via le même mécanisme keyring + fallback fichier
- **Pas de télémétrie tierce** — seuls Firestore (logs admin) et Discord (avatar / pseudo) reçoivent des données
- **Pages légales** dans `hosting/terms.html` + `hosting/privacy.html` (RGPD-compliant), liées dans Azure App Registration
