# Limitations assumées · TODOs post-MVP

Ce fichier liste les **limitations volontaires** prises pendant l'implémentation
des 16 features (cf. `docs/FEATURES_BRAINSTORM.txt`). Chacune est un compromis
fait pour livrer la feature en MVP — à reprendre plus tard quand le besoin se
fait sentir.

---

## Phase B — Twitch + OBS (livrée)

### 1. Twitch : OAuth flow manuel au lieu d'auto

**Limitation actuelle** : le user colle son Client ID + User Access Token
manuellement dans le panel Settings. Documentation inline pointe vers
`dev.twitch.tv/console/apps/create` + `twitchtokengenerator.com` avec scope
`channel:manage:broadcast`.

**Pourquoi** : OAuth implicit grant Twitch retourne le token dans le hash URL
(`#access_token=…`) qui n'est pas envoyé au serveur loopback HTTP. Pour le
récupérer, il faut une petite page HTML qui lit `window.location.hash` côté
JS et POST à un endpoint local. Faisable mais ajoute ~150 LOC.

**À faire plus tard** : 
- Étendre `oauth.rs` avec un mode "fragment-collector" (page HTML qui
  intercepte le hash et le POST en form-encoded au loopback)
- TwitchPanel : bouton "Se connecter avec Twitch" qui ouvre le flow auto
  au lieu des inputs manuels
- Garder les inputs manuels en fallback "advanced"

### 2. OBS : pas de browser source overlay

**Limitation actuelle** : le bridge Rust `obs_ws.rs` est complet (handshake
SHA-256 challenge OK, BroadcastCustomEvent pour pousser des events). MAIS pas
de page browser source qui consomme les events côté stream.

**Pourquoi** : la browser source OBS pointe vers une URL HTTPS (page Firebase
Hosting). Pour qu'elle consomme `ws://localhost:4455` il faut bypass le mixed
content HTTPS/WS — pénible. Alternative : faire que la browser source lise
Firestore (HTTPS partout, propre) au lieu d'écouter le WebSocket. Demande de
créer une nouvelle collection `/streamOverlay/{uid}/events/{eventId}`.

**À faire plus tard** :
- Sub-collection Firestore `/users/{uid}/streamOverlay/{eventId}` avec TTL
  auto-delete après 30s
- `hosting/obs-overlay.html` : page statique qui auth anonymous, lit `?uid=X`
  de la query string, écoute la sub-collection en live, render des cards
  d'overlay (achievement débloqué, friend online, crew message…)
- Le launcher écrit dans Firestore au lieu de pousser via obs-websocket
- L'obs-websocket bridge actuel reste utile pour features futures (toggle
  scène / mute mic depuis le launcher)

### 3. Twitch token : localStorage au lieu de keyring

**Limitation actuelle** : le `accessToken` Twitch est en clair dans
`localStorage`. Suffit pour un crew d'amis privés.

**Pourquoi** : keyring (Windows Credential Manager) demande un round-trip
Rust ↔ React + un fallback fichier (cf. `mc_github.rs` qui implémente déjà
le pattern). Ajout ~100 LOC.

**À faire plus tard** :
- Ajouter `set_twitch_token` / `get_twitch_token` côté Rust qui appelle
  `keyring::Entry::new("simple-launcher-twitch", "default")` avec fallback
  fichier JSON dans `dirs::config_dir()`. Calque sur `mc_github.rs`.
- TwitchPanel persiste via cette command Rust au lieu de localStorage

---

## Slots à remplir au fur et à mesure des phases

À ajouter ici à chaque phase quand on assume une limitation pour MVP.
