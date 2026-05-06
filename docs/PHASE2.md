# Phase 2 — sujets de réflexion (à discuter avant impl)

Ces 3 features sont notées ici pour qu'on en discute avant d'attaquer
l'implémentation. Elles demandent toutes un choix de stack ou de
direction qu'on doit prendre ensemble — pas évident d'aller à
l'aveugle.

Phase 1 (notifs natives, scroll memory, toasts custom, heatmap, crew
custom roles, polish) est terminée et committée. Cette phase 2 est
purement documentaire pour l'instant.

---

## 2.1 — Voice channels in crews

### Le problème

Permettre aux membres d'un crew de discuter en voice sans quitter le
launcher. Concrètement : un bouton "Rejoindre voice" sur la page d'un
crew → ouverture d'un channel audio peer-to-peer où plusieurs membres
peuvent parler simultanément.

### Stacks possibles

#### Option A — WebRTC peer-to-peer pur

- Le launcher ouvre une connexion WebRTC entre les participants via un
  signaling server léger (Firestore peut servir de signaling : doc
  partagé qui contient les SDP offers/answers + ICE candidates)
- Chaque pair se connecte directement aux autres → mesh full-mesh
- TURN server gratuit en fallback si NAT strict (Twilio offre gratuit
  jusqu'à un seuil ; sinon coturn auto-hébergé sur un VPS 5€/mois)

**Pros** :
- Zéro coût récurrent au début (signaling sur Firestore qu'on a déjà)
- Latence minimale (peer-to-peer direct)
- Open source / pas de lock-in

**Cons** :
- Mesh ne scale pas au-delà de ~5 participants simultanés (chaque
  pair ouvre N-1 connexions parallèles → CPU + bande passante)
- Echo cancellation, noise suppression, AGC à wirer manuellement (les
  browsers fournissent les API mais c'est du boulot)
- Mute / push-to-talk / volume mixer à coder
- Implémentation Tauri : WebView Chromium supporte WebRTC nativement,
  donc OK

#### Option B — SFU dédié (mediasoup, livekit-server, jitsi)

- Tous les pairs envoient leur audio à un SFU central qui le forward
  aux autres
- Scale facilement à 20+ participants
- LiveKit a un SaaS gratuit jusqu'à 50 participants/mois ou self-hosted
  Docker en 5 min

**Pros** :
- Scale comme un vrai service (Discord-like)
- LiveKit fournit un SDK JS clé-en-main avec mute / push-to-talk / etc.
- Pas de coût si self-hosted sur un VPS

**Cons** :
- Coût VPS + maintenance (5-10€/mois minimum)
- Plus complexe à déployer / monitorer
- Lock-in modéré sur LiveKit ou mediasoup

#### Option C — Hub Discord-style externe (leverage Discord lui-même)

- Au lieu de réinventer, lancer un join URL Discord pour le crew
- Tu crées un serveur Discord par crew, le launcher juste ouvre le
  bon channel voice via le deep link discord://

**Pros** :
- Zéro code voice à écrire
- Discord fait le job correctement

**Cons** :
- Pas vraiment "in-launcher" — l'utilisateur quitte le launcher
- Demande de gérer la création/sync des serveurs Discord
- Casse le storytelling "tout dans Simple Launcher"

### Ma reco initiale

**Option A (WebRTC + Firestore signaling)** pour la v1, avec une UI
basique : 1 bouton join, une liste des participants connectés, mute
button. Limite à 5 participants jusqu'à ce qu'on voie le besoin réel.
Si ça décolle, migrer vers LiveKit self-hosted en v2.

### Questions à trancher avec l'utilisateur

1. Combien de participants max attendus par voice channel ?
2. OK pour utiliser Firestore comme signaling (1 doc par session) ?
3. Push-to-talk ou voix ouverte par défaut ?
4. Visuel : panel droit du crew (sticky) ou modal flottante ?

---

## 2.2 — Stream highlights auto

### Le problème

Capturer automatiquement de courts clips (10-30 s) des moments
intéressants pendant qu'un jeu tourne, comme NVIDIA Shadowplay ou
Xbox Game DVR. L'utilisateur peut ensuite les retrouver / partager
depuis le launcher.

### Stacks possibles

#### Option A — Buffer rolling FFmpeg

- Lance un sous-process FFmpeg qui capture en continu l'écran (`gdigrab`
  / `dshow` Windows) dans un buffer mémoire de 30 s
- Sur trigger (keybind ou event auto), flush les 30 dernières secondes
  vers un .mp4

**Pros** :
- Solution open-source standard
- FFmpeg gère encodage matériel (NVENC, AMD AMF, Intel QSV) si dispo
- Pas de DLL injection → pas de risque anti-cheat

**Cons** :
- Capture écran générique (gdigrab) plante avec les jeux fullscreen
  exclusive (même problème que l'overlay)
- Capture de la WGC (Windows.Graphics.Capture) plus moderne mais
  nécessite Windows 10 1809+ et un peu de setup côté Rust
- CPU/RAM : 30 s de buffer 1080p = 200-400 MB selon codec

#### Option B — Hook DXGI direct

- Inject une DLL dans le process du jeu, hook IDXGISwapChain::Present
- Récupère le back buffer GPU à chaque frame, encode via NVENC
- C'est ce que ShadowPlay fait

**Pros** :
- Latence minimale, qualité parfaite
- Marche en exclusive fullscreen

**Cons** :
- Trigger anti-cheat → ban risk sur jeux compétitifs
- Implémentation lourde (DLL signed, hook chain, etc.)
- Maintenance par-API et par-architecture

#### Option C — OBS embedded (obs-studio en sub-process)

- Lance OBS avec un profil headless préconfiguré (replay buffer 30 s)
- Utilise IPC pour trigger save_replay
- OBS fait tout le boulot

**Pros** :
- OBS est solide, optimisé, gère NVENC etc.
- Maintenance externalisée

**Cons** :
- OBS est lourd (300+ MB RAM même headless)
- Demande à l'utilisateur d'installer OBS séparément, ou bundle dans
  l'installer (gros coût installer)

### Triggers possibles

Une fois le buffer de capture en place, qu'est-ce qui déclenche le save ?

- **Keybind global** (default ex. F10) : l'utilisateur clique → save
  les 30 s précédentes
- **Auto-detect kill / achievement** : trop game-spécifique, drop
- **Auto-save sur exit du jeu** : conserve les 30 dernières secondes
  toujours

### Ma reco initiale

**Option A + WGC** pour Windows 10 1809+. Buffer 30 s au lancement de
chaque jeu. Keybind global default `F10` configurable dans Settings.
Save dans `%APPDATA%/SimpleLauncher/clips/{moduleId}/{timestamp}.mp4`.
Liste des clips visible sur la page module + boutons Lire / Partager
/ Supprimer. Limite 5 GB total avec rotation FIFO.

### Questions à trancher avec l'utilisateur

1. Quel keybind par défaut (F10 ? Ctrl+Shift+R ? autre) ?
2. Durée du buffer : 15 / 30 / 60 secondes ?
3. Format : H.264 1080p 60 fps qualité moyenne (10 Mbps), ou plus ?
4. Limite stockage : 5 / 10 / 20 GB avant rotation FIFO ?
5. Un clip = un fichier séparé OU un .mp4 unique avec chapters ?
6. Stockage local seul, ou option upload Firebase Storage / YouTube
   pour partage (pose des questions de coût) ?

---

## 2.3 — Profile public riche

### Le problème

La PublicProfilePage actuelle est basique : avatar + nom + tier +
stats simples + showcase achievements + heatmap (Phase 1.4). On veut
la transformer en vrai page personnelle "carte de visite" qu'on peut
partager (déjà partageable via /u/{discordId}, déjà un QR code).

### Pistes d'enrichissement

#### Visuel
- **Bannière custom** : déjà partiellement implémenté, à polish.
  Permettre des bannières animées (gif, mp4 short loop) ?
- **Theme custom de la page** : couleur de fond, gradient hero, font
- **Skin avatar** : effet 3D rotatif au survol, particules, tilt

#### Contenu
- **Bio** : texte libre 200 chars (déjà partiellement dispose)
- **Liens externes** : Twitch / YouTube / Twitter / GitHub / TikTok
  affichés en boutons avec icônes
- **Showcase modules** : 3 jeux favoris épinglés avec preview gros
  (déjà partiellement)
- **Showcase achievements** : 3 succès épinglés (déjà fait)
- **Wall de screenshots** : galerie de captures partagées par le
  user (intégrer la feature stream highlights de 2.2 ?)
- **Stats avancées** : %win / kills (par jeu via Steam API si linked),
  crew memberships, durée de la plus longue session
- **Activité récente** : feed des 10 dernières actions publiques
  (achievements débloqués, jeux lancés, msg crew publics)

#### Social
- **Endorsements** : un autre user peut "endorse" un trait du profil
  ("strat" / "casual" / "patient" / "leader") — Discord-style
- **Wall de messages publics** : autres users peuvent laisser un
  message permanent visible (modération nécessaire)
- **Status text** : "vibant à Lille / cherche team Apex / dispo
  weekends" — ligne sous le tier
- **Mini-blog** : posts datés visibles uniquement sur le profil

#### Customisation premium (gated tier)
- **Effet de fond animé** : aurora / particles / video bg pour Légende
- **Frame avatar premium** : déjà existe via tier system
- **Sound on profile load** : un sample audio joue quand quelqu'un
  ouvre ton profil (style PSN custom theme)
- **Trophy room 3D** : showcase achievements en 3D scene WebGL

### Tradeoffs

- **Storage Firebase** : bannières + screenshots = espace. Quota
  gratuit 5 GB → ~1000 bannières 5 MB ou 50000 screenshots 100 KB
- **Modération** : wall public + bio = surface d'abus, faut un
  signalement + quelques admin tools
- **Perf page** : si on charge tout (banner + bio + 10 modules + 50
  achievements + 5 screenshots + activité), la page peut devenir
  lourde — virtualization / lazy load nécessaire
- **Tier gating** : qu'est-ce qui est gratuit vs supporters-only ?
  Trop verrouiller = effet cheap. Pas assez = cannibalise le tier

### Ma reco initiale

Plan pyramide :

**Niveau 1 (gratuit)** :
- Bio 200 chars
- Liens externes (5 max)
- Bannière statique
- Wall de screenshots (5 max)
- Activité récente

**Niveau 2 (Soutien)** :
- Liens externes illimités
- Status text
- 10 screenshots

**Niveau 3 (VIP)** :
- Bannière animée (mp4 5 s loop)
- Custom accent color page (override la couleur par défaut)
- Endorsements

**Niveau 4 (Légende)** :
- Effet de fond animé full-screen (aurora, particles)
- Sound on load
- Trophy room 3D
- Mini-blog (5 posts max)

### Questions à trancher avec l'utilisateur

1. La pyramide tier ci-dessus — OK ? trop verrouillé ?
2. Wall public modéré : opt-in OU opt-out par défaut ?
3. Endorsements : combien max par profil (10 ? illimité ?)
4. Sound on load : autorisé ou trop intrusif (auto-play
   audio = mauvais UX) ?
5. Trophy room 3D : worth the investment WebGL ou trop niche ?
6. Stats Steam linked : nécessite OAuth Steam, est-ce qu'on s'engage
   sur ça ?

---

## Récap

Quand on est prêts à attaquer une de ces 3 features, on en discute
ensemble pour trancher les questions ci-dessus. La phase 1 a livré
6 features concrètes (commits b59f3d8 à 476e315 ce jour) sans
toucher à ces sujets de réflexion.
