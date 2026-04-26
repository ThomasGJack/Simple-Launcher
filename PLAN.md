# Simple Launcher — Plan de développement

## 1. Vision

Launcher Windows multi-jeux **modulaire**, privé (toi + amis), avec :
- Interface **frameless** custom (zéro barre Windows native)
- Pages de jeu **ultra personnalisables** (carrousel, bannières animées, animations riches)
- Deux types d'entrées : jeux hébergés sur Firebase (téléchargeables) **ou** raccourcis vers exécutables installés localement
- Auth & sync via Firebase
- MAJ automatique du launcher + des jeux

## 2. Stack technique finale

| Couche | Choix | Pourquoi |
|---|---|---|
| Shell desktop | **Tauri 2** (Rust + WebView2) | Léger (~10 Mo), frameless natif, auto-updater intégré, perf téléchargement |
| UI | **React 18 + TypeScript** + **Vite** | Écosystème riche pour anims |
| Animations | **Framer Motion** + **GSAP** (timelines complexes) | Carrousel, transitions de page, parallaxe |
| Style | **Tailwind CSS** + **shadcn/ui** | Rapidité de prototypage, composants modulables |
| State | **Zustand** | Léger, simple, suffit pour un launcher |
| Backend | **Firebase** (Auth, Firestore, Storage, Functions) | Gratuit jusqu'à un certain volume, très adapté |
| Stockage gros binaires | **Firebase Storage** au début, migration possible vers **Cloudflare R2** si > 5 Go cumulés | Coût |
| Téléchargement & patching | Crate Rust `reqwest` + `zstd` + `sha2` | Patches différentiels, vérif intégrité |

## 3. Architecture frameless

Tauri config : `"decorations": false`, `"transparent": true`.

Top bar custom React :
- Drag region invisible (`data-tauri-drag-region`)
- Boutons custom min/max/close (icônes Lucide)
- Profil utilisateur, notifications, recherche globale

Window resize handles custom sur les bords (fins, invisibles, gérés via Tauri API).

## 4. Système de modules

Chaque jeu = un **module** décrit par un manifest. Deux types :

### Type A — Jeu hébergé (Firebase)
```json
{
  "id": "mon-jeu",
  "type": "hosted",
  "name": "Mon Jeu",
  "version": "1.2.3",
  "description": "...",
  "executable": "MonJeu.exe",
  "downloadUrl": "https://firebasestorage.../mon-jeu-1.2.3.zip",
  "size": 524288000,
  "sha256": "abc...",
  "patches": [
    { "from": "1.2.2", "url": "...", "sha256": "..." }
  ],
  "page": { /* config UI custom — voir §6 */ }
}
```

### Type B — Raccourci local
```json
{
  "id": "minecraft",
  "type": "shortcut",
  "name": "Minecraft",
  "executablePath": "C:\\Program Files\\Minecraft\\launcher.exe",
  "args": [],
  "page": { /* config UI custom */ }
}
```

Tous les manifests sont stockés dans **Firestore** (collection `modules`), mis à jour en temps réel. Le launcher écoute les changements → la liste des jeux se MAJ live.

## 5. Personnalisation des pages de jeu

Chaque page = un **JSON descripteur** rendu par un moteur de pages :

```json
{
  "background": { "type": "video", "url": "...", "blur": 0 },
  "hero": {
    "type": "carousel",
    "slides": [
      { "image": "...", "title": "...", "animation": "ken-burns" },
      { "video": "...", "title": "..." }
    ],
    "interval": 5000,
    "transition": "slide-fade"
  },
  "sections": [
    { "type": "changelog", "data": [...] },
    { "type": "screenshots-grid", "images": [...] },
    { "type": "stats", "data": [...] },
    { "type": "custom-html", "content": "..." }
  ],
  "theme": { "primary": "#FFD93D", "accent": "#FF6B6B", "font": "..." }
}
```

→ Chaque jeu peut avoir un thème, une typo, un fond animé, des sections différentes. Le moteur React mappe chaque `type` à un composant. **Hyper extensible** : on rajoute un nouveau type de section en ajoutant un composant.

Animations standard disponibles : `ken-burns`, `parallax-scroll`, `slide-fade`, `morph`, `stagger-reveal`.

## 6. Système de mise à jour

### Launcher lui-même
- Tauri updater : check au démarrage d'un endpoint signé
- Si nouvelle version : download → install → restart silencieux
- Endpoint hébergé sur Firebase Hosting (gratuit)

### Jeux (Type A)
- Au démarrage : compare `localVersion` vs `manifest.version` (Firestore)
- Si patch différentiel disponible : applique le patch (gain de bande passante)
- Sinon : re-download complet
- Vérif SHA-256 → si KO, retry / fallback complet
- Progress bar custom + vitesse + ETA

### Jeux (Type B)
Pas de MAJ gérée par nous (le jeu se MAJ via son propre launcher).

## 7. Firebase — modèle de données

```
/users/{uid}
  - displayName, avatar, createdAt
  - settings: { theme, language, ... }
  - library: [moduleId, ...]      // jeux installés
  - friends: [uid, ...]
  - playtime: { moduleId: minutes }

/modules/{moduleId}              // manifests publics
  - (cf. §4)

/modules/{moduleId}/versions/{v}  // historique versions
  - changelog, releaseDate, downloadUrl

/launcher/release                // version actuelle du launcher
  - version, downloadUrl, signature, releaseNotes
```

**Auth** : **Discord OAuth uniquement** (pas d'email/password, pas de Google).

Flow Discord → Firebase :
1. Launcher ouvre fenêtre OAuth Discord (URL `https://discord.com/oauth2/authorize?...&scope=identify+email`)
2. Discord redirige avec un `code` → launcher l'envoie à une **Cloud Function** `discordAuth`
3. Cloud Function échange `code` contre access_token Discord, fetch `/users/@me`, crée/MAJ user Firestore
4. Cloud Function génère un **Firebase Custom Token** signé
5. Launcher fait `signInWithCustomToken()` → user authentifié

Stockage du profil Discord côté Firestore : `displayName`, `discriminator`, `avatar` (CDN Discord), `discordId` (clé d'unicité).

Pas de DRM, mais tu peux limiter l'accès à des modules via `allowedDiscordIds: [...]` dans le manifest si tu veux des "jeux privés" pour certains amis.

## 8. Phases de développement

### Phase 0 — Setup (1-2 jours)
- Init Tauri + React + Tailwind
- Frameless window + topbar custom
- Projet Firebase créé, SDK câblé
- Repo Git initialisé

### Phase 1 — MVP (2-3 semaines)
- [ ] Auth Firebase (email + Google)
- [ ] Liste des jeux (Firestore live)
- [ ] Lancement Type B (raccourci local)
- [ ] Page de jeu basique avec hero + description
- [ ] Carrousel hero animé (Framer Motion)
- [ ] Settings basiques (thème, déconnexion)
- [ ] Tracking playtime (process watcher)

### Phase 2 — Téléchargement & MAJ (2 semaines)
- [ ] Téléchargement Type A avec progress
- [ ] Vérif SHA-256, extraction zstd
- [ ] Système de versions + détection MAJ
- [ ] Auto-updater du launcher
- [ ] Patches différentiels (optionnel — peut attendre V2)

### Phase 3 — Personnalisation poussée (2 semaines)
- [ ] Moteur de pages custom (JSON → composants)
- [ ] Tous les types de sections (`screenshots-grid`, `stats`, `custom-html`...)
- [ ] Backgrounds vidéo, parallaxe, morph entre pages
- [ ] Transitions de navigation cinématiques
- [ ] Thèmes par jeu

### Phase 4 — Social & polish (1-2 semaines)
- [ ] Liste d'amis, statut online
- [ ] Notifications in-app
- [ ] Bibliothèque, favoris, filtres, tri
- [ ] Search globale (Cmd+K)
- [ ] Sons UI (subtils)

### Phase 5 — Outil d'admin (1 semaine)
- Mini app séparée OU page cachée du launcher pour **toi** :
- [ ] Upload nouvelles versions de jeux
- [ ] Édition manifests
- [ ] Édition pages custom (idéalement en visuel, sinon JSON direct)
- [ ] Publication

## 9. Structure du projet

```
Simple Launcher/
├── src-tauri/                  # Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── downloader.rs       # Téléchargement, patches, vérif
│   │   ├── launcher.rs         # Lance les exes
│   │   ├── process_watcher.rs  # Tracking playtime
│   │   └── window.rs           # Frameless helpers
│   └── tauri.conf.json
├── src/                        # React/TS
│   ├── main.tsx
│   ├── app/
│   │   ├── routes/
│   │   ├── store/              # Zustand
│   │   └── firebase/
│   ├── components/
│   │   ├── window/             # Topbar, resize handles
│   │   ├── ui/                 # shadcn
│   │   └── pages/              # Moteur de pages custom
│   │       ├── PageRenderer.tsx
│   │       └── sections/
│   │           ├── HeroCarousel.tsx
│   │           ├── ScreenshotsGrid.tsx
│   │           ├── Changelog.tsx
│   │           └── ...
│   └── styles/
├── admin/                      # Outil d'upload (Phase 5)
├── PLAN.md
└── README.md
```

## 10. Points à creuser plus tard

- **Anti-cheat / signatures** : si un jour tu veux ouvrir au public, signer les binaires côté Cloud Function avant download
- **Firebase quotas** : Storage gratuit = 5 Go. Au-delà → Cloudflare R2 (gratuit jusqu'à 10 Go, pas de frais d'egress)
- **Crash reporting** : Sentry gratuit jusqu'à 5k events/mois
- **Editeur visuel de pages** : ambitieux, à faire seulement si Phase 3 te confirme que tu veux pas éditer du JSON à la main toute ta vie

## 11. Direction artistique — "Full panel gaming"

Référence : **Paladium Launcher**, **ReCube (Nation Glory)** — launchers MC FR immersifs.

### Codes visuels
- **Plein écran panel** : pas de fenêtre étriquée, le launcher prend toute la place et l'utilise
- **Background vidéo/animé en boucle** sur l'accueil (loop fluide, ~5-15 sec, compressé)
- **Particules WebGL/Canvas** par-dessus (poussières, étincelles, lueurs, configurable par jeu)
- **Palette** : sombre dominant (gris très foncé / noir bleuté) + **accent néon** par jeu (cyan, or, magenta, vert acide…)
- **Glassmorphism subtil** sur les panels d'info (blur + transparence + bord lumineux)
- **Glow & shadows** : tout ce qui est interactif a un halo/glow au hover
- **Typo** : sans-serif moderne avec une display gaming pour les titres (Bebas Neue, Orbitron, ou typo custom plus douce style Inter Display + display Audiowide pour les hero)

### Composants signature
- **Sidebar gauche fixe** : logo + icônes des jeux (avec glow d'état : installé / à installer / en cours de DL)
- **Hero plein écran** : bannière vidéo + titre du jeu en énorme + sous-titre + bouton "JOUER" massif (centre ou bas-droite)
- **Bouton "JOUER"** : la pièce maîtresse — gradient animé, glow pulsant, particules au hover, son de clic, micro-anim de pression
- **News carousel** en bas ou flottant à droite : actus du serveur/jeu, mises à jour, events
- **Transition de page** cinématique : fade + slide + parallaxe sur le background (pas de simple route change)
- **Loading screens** stylés entre les pages avec barre de progression custom
- **Sons UI** discrets : hover (sub bass), clic (snap métallique), notification (chime), lancement de jeu (whoosh)

### Effets techniques
- Background vidéo : `<video autoplay loop muted playsinline>` + overlay gradient noir 40%
- Particules : **tsParticles** (config par jeu via le manifest)
- Parallaxe : transform translate-Z sur scroll/move souris (Framer Motion `useScroll` + `useMotionValue`)
- Page transitions : `AnimatePresence` + variants (slideX, scale, blur)
- Glow animé : `box-shadow` keyframes + `filter: drop-shadow`

### Page custom — config étendue
```json
{
  "background": {
    "type": "video",
    "url": "...",
    "overlay": "linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.8))",
    "particles": { "preset": "stars", "color": "#00ffff", "density": 50 }
  },
  "theme": {
    "primary": "#00d4ff",
    "accent": "#ff00aa",
    "fontDisplay": "Audiowide",
    "uiSounds": true
  },
  "playButton": {
    "label": "JOUER",
    "position": "bottom-right",
    "style": "neon-pulse"
  }
}
```

## 12. Décisions figées

| Question | Réponse |
|---|---|
| Nom | **Simple Launcher** |
| Style | Full panel gaming type Paladium / ReCube |
| Auth | Discord OAuth **uniquement** |
| Patches diff | **V2** (re-download complet en MVP, on optimise après) |

---

**Prochaine étape** : Phase 0 — init Tauri + structure dossiers + frameless window + topbar custom + setup Firebase + setup Discord OAuth app. Dis "go" quand tu veux que je lance.
