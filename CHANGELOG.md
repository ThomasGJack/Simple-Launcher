# Changelog

Toutes les modifications notables du launcher sont listées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versioning [SemVer](https://semver.org/lang/fr/).

À chaque modification, ajoute une entrée sous `## [Unreleased]` dans la catégorie qui correspond.
Quand on release, `npm run release:launcher` déplace automatiquement `[Unreleased]` vers `[X.Y.Z] - YYYY-MM-DD` et le contenu devient les notes affichées dans la popup de mise à jour côté client.

## [Unreleased]

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

### Changé

### Corrigé
- Page Admin : la création d'un module échouait avec "Unsupported field value: undefined" quand un champ optionnel était vide (description, icône, bannière, arguments). Les champs vides sont maintenant omis du document Firestore au lieu d'envoyer `undefined`.

### Supprimé

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
