# Simple Launcher

Launcher de jeux Windows pour une communauté d'amis — pensé comme un mélange de **Steam + Discord + un launcher Minecraft**, dans une seule app native. Interface frameless animée, backend Firebase temps réel, connexion via Discord.

L'idée : un seul endroit pour lancer ses jeux (jeux hébergés, raccourcis locaux, imports Steam, FiveM, instances Minecraft), discuter en crew avec salon vocal, suivre son temps de jeu et ses succès, et débloquer des cosmétiques — le tout mis à jour automatiquement en tâche de fond.

> Projet perso / communautaire, pas un produit commercial. Voir [`PLAN.md`](./PLAN.md) pour la vision complète et [`CHANGELOG.md`](./CHANGELOG.md) pour l'historique détaillé des releases.

---

## ✨ Ce que fait le launcher

### 🎮 Bibliothèque de jeux
- **Modules hébergés** — binaires uploadés sur Firebase Storage (ou GitHub Releases), installés + mis à jour depuis l'app avec barre de progression.
- **Raccourcis personnels** — n'importe quel `.exe` local devient une tuile lançable.
- **Import Steam en un clic** — détecte ta bibliothèque Steam et crée un raccourci par jeu, avec sa cover et son icône officielle. Aperçu enrichi au clic (screenshots, trailer, succès avec rareté, joueurs en ligne, prix, reviews — via l'API publique Steam). Filtre par genre.
- **FiveM natif** — tuile FiveM intégrée : détecte `FiveM.exe`, bouton « Jouer » direct ou « Installer FiveM » si absent. Fiche d'info dédiée (RP / Drift / DM / maps custom + liens serveurs & wiki Cfx.re).
- **Minecraft natif** — launcher MC complet sans Prism (voir plus bas).

### 👥 Communauté
- **Crews / clans** — salons de discussion, membres avec présence temps réel, statut personnalisé, sessions de jeu.
- **Salon vocal WebRTC** — voix peer-to-peer (mesh, jusqu'à 8), détection de parole, réglage du volume par participant, test micro, mute / sourd.
- **News** — fil d'actu avec sondages, réactions emoji, commentaires (réponses, réactions, mentions @user + notifications).
- **Wiki + TODO de crew** — pages markdown collaboratives et liste de tâches partagée par crew.
- **Messagerie privée**, friends online, profils publics partageables (`/u/<id>` sur le site).

### 🎨 Personnalisation
- **Thèmes complets** — couleurs, police (presets Google Fonts + police custom), densité d'affichage, pack de sons (Soft Lofi / Arcade 8-bit / Minimal).
- **Thèmes saisonniers** — décor Halloween & Noël qui s'active automatiquement selon la date.
- **Cosmétiques** — cadres d'avatar débloquables (tier / saison / soutien), affichés partout dans l'app.
- **Raccourcis clavier custom** — capture d'écran, overlay, navigation… rebindables.

### 🖼️ Capture & fenêtres
- **Screenshots** — capture via raccourci (F2 par défaut), upload cloud automatique, galerie sur le profil (filtres, légendes, téléchargement).
- **Picture-in-Picture** — mini-fenêtre flottante always-on-top (amis en ligne + notifs) par-dessus un jeu plein écran.
- **Overlay en jeu** — fenêtre transparente togglable au raccourci.

### 🔗 Intégrations & extras
- **Rich Presence Discord** — « Joue à … via Simple Launcher » automatique, avec temps écoulé.
- **Twitch** — met à jour le titre du stream au lancement d'un jeu. **OBS** — connexion WebSocket pour un overlay d'activité crew.
- **Soutien (Ko-fi)** — 3 tiers VIP avec effets visuels premium ; abonnements gérés par webhook Ko-fi côté Cloud Functions.
- **Tray Windows** — l'app continue en arrière-plan comme Discord/Steam.
- **Auto-update Velopack** — mises à jour delta (~3-5 Mo au lieu du binaire complet), install atomique sans dialog Windows.

---

## 🧱 Stack technique

| Couche | Tech |
|---|---|
| Bureau | **Tauri 2** (Rust + WebView2), fenêtre frameless |
| UI | **React 19** + TypeScript + Vite 7 |
| Style | **Tailwind v4** + Framer Motion + GSAP |
| State | **Zustand** (stores ref-counted pour mutualiser les watchers Firestore) |
| Backend | **Firebase** — Auth (Discord OAuth via Cloud Function), Firestore, Storage, Functions (europe-west1) |
| Auth Minecraft | OAuth Microsoft v2.0 (Azure app + PKCE) + mode secours legacy |
| Voix | **WebRTC** mesh + signaling Firestore, VAD via Web Audio `AnalyserNode` |
| Auto-update | **Velopack** (delta updates, hébergé sur Firebase Hosting) |
| Secrets locaux | `keyring` (Windows Credential Manager) + fallback fichier JSON chiffré |

---

## 🚀 Démarrer

### Prérequis (Windows)
- **Node 20+**
- **Rust stable** (`rustup`)
- **MSVC Build Tools 2022** (workload « Développement Desktop en C++ »)

### Installation
```powershell
npm install
copy .env.example .env.local   # remplir les clés Firebase + Discord
npm run tauri:dev
```

Sans `.env.local` rempli, l'app démarre en mode hors-ligne/dev (Firebase désactivé) — pratique pour bosser l'UI sans backend.

### Build production
```powershell
npm run tauri:build
```

---

## ⚙️ Configuration `.env.local`

Toutes les variables sont documentées dans [`.env.example`](./.env.example). Les principales :

| Variable | Rôle |
|---|---|
| `VITE_FIREBASE_*` | Config Firebase Web SDK (Console → Paramètres → Vos apps → Web) |
| `VITE_DISCORD_CLIENT_ID` | ID public de l'app Discord (login OAuth) |
| `DISCORD_CLIENT_SECRET` | Secret Discord — **jamais** commité ; au déploiement il vit dans `firebase functions:secrets:set DISCORD_CLIENT_SECRET` |
| `VITE_CURSEFORGE_API_KEY` | Optionnel — résolution des mods CurseForge |
| `DISCORD_RELEASE_WEBHOOK_URL` | Optionnel — annonce Discord après chaque release |

> ⚠️ Le fichier `.env.local` est gitignored. Ne jamais committer de vraie clé — la config Firebase *web* présente dans `hosting/u/index.html` est publique par design (protégée par les règles Firestore + App Check), pas les secrets serveur.

---

## ⛏️ Launcher Minecraft natif

Chaîne complète, sans dépendance à Prism :

- **Version MC** pinnée depuis le `version_manifest_v2.json` de Mojang (release / snapshot / anciennes).
- **Loader** au choix : Vanilla, Fabric (`meta.fabricmc.net`), Forge / NeoForge (installer JAR headless).
- **Modpack** : aucun, Modrinth (`.mrpack`, recherche + DL parallèle intégrés), ou ZIP CurseForge.
- **JRE auto** — télécharge le bon Adoptium Temurin selon la version MC.
- **Auth Microsoft** (OAuth + PKCE) ou mode secours paste-URL ; tokens chiffrés en local.
- **RAM configurable** par module, **console live**, **auto-connect serveur** (`--quickPlayMultiplayer`).

Le bouton « Lancer » enchaîne tout en un clic : refresh token → install manquants → build de la commande JVM → spawn `javaw` avec logs streamés.

### Hosting des modpacks
1. **GitHub Releases** (recommandé) — gratuit, 2 Go/fichier, jamais expiré. Picker + auto-bootstrap de repo intégrés à l'admin.
2. **Firebase Storage** — direct depuis l'admin, pour les petits packs.
3. **Pixeldrain / Drive / Catbox** — colle l'URL de partage, conversion auto en URL de DL.

---

## 🗂️ Structure du repo

```
src/                    Frontend React
  components/           window · layout · ui · library · module-blocks · admin · crews · voice · news · cosmetics · screenshots
  pages/                Home · Library · ModuleDetail · Crews · Profile · Settings · Admin · …
  store/                Zustand (auth, ui, voice, settings, firebaseStores ref-counted)
  firebase/             config, auth Discord, modules, news, crews, presence, screenshots, steamApps, …
  lib/                  modules, nativeModules (FiveM), steamImport, steamGameInfo, mc*, sounds, themes, cosmetics, …
  types/                module.ts (union discriminée LauncherModule) · moduleBlocks.ts (pages V2)

src-tauri/src/          Backend Rust (Tauri commands)
  lib.rs                Point d'entrée + invoke_handler
  modules.rs            Lancement + tracking (playtime, Discord/Twitch RPC)
  mc_*.rs               Chaîne Minecraft (auth, java, vanilla, fabric, forge, modrinth, zip, launch, github, backup, crash)
  steam.rs / steam_api.rs   Détection Steam + enrichissement via API Web publique
  fivem.rs              Détection FiveM.exe (registry Cfx.re + fallback)
  screenshot.rs         Capture PNG plein écran
  overlay.rs / pip.rs   Fenêtres overlay + Picture-in-Picture
  shortcuts.rs          Raccourcis clavier globaux custom
  discord_rpc.rs / twitch_rpc.rs / obs_ws.rs   Présence externe
  velo_updater.rs       Auto-update Velopack
  win_aumid.rs          AUMID Windows (notifications « Simple Launcher »)
  tray.rs · rcon.rs · oauth.rs · single_instance.rs · cache.rs · diagnostic.rs

functions/src/          Cloud Functions (Discord OAuth, cleanup planifié, webhook Ko-fi)
hosting/                Site public (changelog, pages légales, profils /u/, feed auto-update)
scripts/                Outils release (bump-version, release-launcher, notify-discord)
docs/                   CHANGELOG_STYLE, FEATURES_BRAINSTORM, notes de phase
```

---

## 🛠️ Scripts utiles

| Commande | Effet |
|---|---|
| `npm run tauri:dev` | Launcher en dev (HMR Vite + recompile Rust à chaque save) |
| `npm run tauri:build` | Build prod |
| `npm run build` | Type-check + build du frontend seul |
| `npx tsc --noEmit` | Type-check sans émettre |
| `cd src-tauri && cargo build` | Compile juste le backend Rust |
| `npm run bump` | Bump de version calver (`YY.MMDD.S`) |
| `npm run release:launcher` | Build Velopack + déplace `[Unreleased]` du CHANGELOG sous la nouvelle version |
| `npm run release:notify` | Poste l'embed Discord d'annonce de release |

---

## 🔒 Sécurité & vie privée

- **Tokens Microsoft & PAT GitHub** chiffrés via le Windows Credential Manager (fallback fichier JSON local).
- **Refresh tokens** stockés uniquement en local (`%APPDATA%\Simple Launcher\`), jamais envoyés à un tiers.
- **Secrets serveur** (Discord client secret, webhook Ko-fi) — dans les secrets Firebase Functions, jamais dans le code.
- **Pas de télémétrie tierce** — seuls Firestore (logs admin) et Discord (avatar / pseudo) reçoivent des données.
- **Pages légales** RGPD dans `hosting/terms.html` + `hosting/privacy.html`.

---

## 📄 Licence

Projet privé. Tous droits réservés — code partagé à titre de portfolio / archive. Réutilisation sur demande.
