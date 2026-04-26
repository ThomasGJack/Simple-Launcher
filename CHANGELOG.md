# Changelog

Toutes les modifications notables du launcher sont listées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versioning [SemVer](https://semver.org/lang/fr/).

À chaque modification, ajoute une entrée sous `## [Unreleased]` dans la catégorie qui correspond.
Quand on release, `npm run release:launcher` déplace automatiquement `[Unreleased]` vers `[X.Y.Z] - YYYY-MM-DD` et le contenu devient les notes affichées dans la popup de mise à jour côté client.

## [Unreleased]

### Ajouté

### Changé

### Corrigé

### Supprimé

### Sécurité

## [v26.04.26] - 2026-04-26  · semver `26.426.0`


### Ajouté
- Installation des modules type "Hébergé" depuis la bibliothèque : téléchargement, vérification SHA-256, extraction du zip dans `%APPDATA%\com.simplelaunche.app\games\{id}\`, suivi de la version installée localement.
- Bouton "Jouer" qui lance l'exécutable du module (raccourci local pour Type B, exe extrait pour Type A) avec son working directory.
- Bouton "Mettre à jour" qui apparaît automatiquement quand la version Firestore d'un module est plus récente que celle installée.
- Bouton "Désinstaller" (corbeille au survol) pour les modules hébergés.
- Barre de progression live pendant le téléchargement et l'extraction, avec phase et taille en Mo.
- Page Bibliothèque refaite : cartes 4×5 avec bannière, badge d'état (Non installé / vX.Y / vX.Y → vZ.W / Local), gradient overlay et animations au hover.
- Logo officiel Simple Launcher (penguin néon à capuche) intégré partout : icône Windows / barre des tâches / installeur, page de connexion, sidebar, barre de titre, page de téléchargement web, et favicon.
- **Page de détail par module** : un clic sur une carte de bibliothèque ouvre une page hero immersive avec grande bannière (zoom subtil au load), nom en font display, badge d'état, bouton JOUER/INSTALLER/MAJ géant, panneau d'infos latéral (taille, version, date d'install, chemin), bouton désinstaller, bouton retour bibliothèque. Thème accent couleur configurable par module dans Firestore (`page.theme.primary`).
- **Particules WebGL** par module via tsParticles, configurables dans le manifest (presets `stars` / `snow` / `fireflies` / `sparkles`, couleur, densité).
- **Page d'accueil enrichie** : prénom Discord en accroche, stats jeux disponibles + installés, section "Modules récents" avec cards 16:9 et chips d'état, navigation rapide vers la bibliothèque ou le premier jeu.
- **Sons d'interface** synthétisés en WebAudio (zéro fichier audio à bundler) : hover doux, click bas-fréquence, whoosh montant au lancement de jeu, jingle de succès après install, bip d'erreur, ding de notification quand une MAJ launcher est dispo.
- **Toggle "Sons d'interface"** dans la page Paramètres pour couper/réactiver tous les effets, avec préférence persistée en localStorage.
- **Page admin enrichie** :
  - Upload des icônes/bannières directement dans Firebase Storage depuis l'admin (drop d'un PNG/JPG/WebP/GIF), plus besoin d'héberger l'image ailleurs.
  - Nouvelle section "Personnalisation de la page module" dans le formulaire admin : couleurs primaire et accent du thème (color picker), font display, preset de particules (étoiles / neige / lucioles / étincelles / aucune) avec couleur et densité réglables, type de background hero (image / vidéo / aucun) avec URL.
- **Discord Rich Presence** : quand le launcher est ouvert, ton statut Discord affiche "Dans le menu — Simple Launcher". Quand tu lances un jeu via le launcher, il devient "Joue à {nom du jeu} — via Simple Launcher" avec le timer de session. Au retour dans le launcher, repasse en "Dans le menu". Échec silencieux si Discord n'est pas lancé.
- **Tracking du temps de jeu** : chaque session de jeu (depuis le clic JOUER jusqu'à la fermeture du process) est enregistrée dans Firestore (`/users/{uid}/playtime/{moduleId}` avec `totalMs`, `totalLaunches`, `lastPlayedAt`). Affiché sur la page Profil : temps total cumulé, nombre de lancements, top 5 des jeux les plus joués (cliquables pour ouvrir leur page détail).
- **Page Communauté** : nouvelle entrée dans la sidebar (icône Users) qui liste tous les utilisateurs du launcher avec leur avatar Discord, leur statut (en ligne / inactif / hors ligne basé sur un heartbeat Firestore toutes les 30 sec) et ce qu'ils sont en train de jouer (cliquable pour ouvrir la page du jeu). Encart "Inviter tes potes" avec message pré-rédigé copiable en un clic, plus une note expliquant pourquoi on ne peut pas tirer la liste d'amis Discord directement (pas accessible via OAuth depuis 2022).
- **Statut serveur Minecraft** : nouveau champ optionnel `serverAddress` dans l'admin (panneau Personnalisation). Si renseigné, un badge "X/Y" en temps réel apparaît sur la carte de bibliothèque, et la page détail affiche un encart dédié avec le nombre de joueurs en ligne, la version du serveur et le MOTD. Polling toutes les 30 sec via `mcsrvstat.us`, cache local 30 sec pour éviter le spam.
- **Sections riches sur la page module** : la page détail rend désormais les sections définies dans le manifest — grille de captures d'écran (cliquables, ouvre l'image en grand), stats clé/valeur. Pour les modules hébergés, un bloc "Versions publiées" est généré automatiquement à partir du sous-dossier Firestore `/modules/{id}/versions`. Les types `carousel` et `custom-html` sont supportés par le moteur mais sans éditeur visuel pour l'instant.
- **Éditeur de sections dans l'admin** : nouvelles textareas dans le panneau Personnalisation pour saisir les URLs des screenshots (une par ligne) et les stats au format `label = valeur`.
- **Installeur stylisé** aux couleurs de l'app : header banner avec logo + nom en cyan, sidebar verticale (welcome / finish) avec gros logo, fond néon dégradé, grille subtile et texte typo display. Icône custom dans la barre de titre de l'installeur, langue forcée en français, install per-user (pas besoin d'admin Windows). Images générées automatiquement depuis le logo via `npm run installer:art`.
- **Versioning calver** : la version du launcher passe au format date `vYY.MM.JJ` (par ex. v26.04.26) avec variantes `vYY.MM.JJ.2`, `.3` pour les multi-releases dans la même journée. Le semver interne (que cargo et l'auto-updater exigent) est encodé en `YY.MMDD.S` (ex: `26.426.0` = 1ère release du 26 avril, `26.426.1` = 2ème). Affichage unifié partout : popup de mise à jour, page Paramètres, header du changelog. Nouveau script `npm run bump` qui auto-détecte la date du jour et incrémente la séquence si une release a déjà eu lieu aujourd'hui.


### Corrigé
- Page Admin : la création d'un module échouait avec "Unsupported field value: undefined" quand un champ optionnel était vide (description, icône, bannière, arguments). Les champs vides sont maintenant omis du document Firestore au lieu d'envoyer `undefined`.


### Sécurité
- Vérification SHA-256 obligatoire après chaque téléchargement de module : si le hash ne correspond pas au manifest, le zip est supprimé et l'installation échoue.
- Protection contre le path traversal lors de l'extraction des zips (les chemins hors du dossier de destination sont ignorés).
## [0.1.0] - 2026-04-26

### Ajouté
- Première version publique
- Authentification Discord OAuth (page de login + Cloud Function `discordAuth`)
- Page profil avec avatar Discord, ID, email, déconnexion
- Auto-redirect vers connexion si pas authentifié, vers accueil sinon
- Persistance de session entre redémarrages (Firebase Auth local)
- Sidebar avec icônes glow et état actif animé
- Page accueil avec hero "SIMPLE LAUNCHER" + bouton "JOUER" néon
- Page bibliothèque (placeholders pour futurs modules)
- Page paramètres (squelette)
- Page admin pour gérer les modules (visible seulement aux Discord IDs whitelistés)
  - Création de modules type "Raccourci local" et "Hébergé sur Firebase"
  - Upload .zip avec progress + SHA-256 + manifest Firestore
  - Liste live des modules publiés avec suppression
- Fenêtre frameless avec barre de titre custom (drag, minimiser, agrandir, fermer)
- Background animé : 3 blobs gradient + grille subtile
- Auto-updater du launcher (vérifie au démarrage, banner glassmorphism, restart auto)
- Page de téléchargement publique sur https://simplelaunche.web.app
