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

## [v26.04.27.2] - 2026-04-27  · semver `26.427.1`


### Ajouté
- **Édition d'un module existant dans l'admin** : clique sur un module dans la liste « Modules publiés » → il se charge dans le formulaire avec tous ses champs (description, icône, bannière, thème, particules, sections, serveur Minecraft, IDs CurseForge…). Bouton « Quitter l'édition » dans l'en-tête pour annuler. L'ID n'est pas modifiable (c'est la clé Firestore). Pour les modules hébergés, le `.zip` est facultatif en mode édition : sans nouveau fichier, seuls les autres champs sont mis à jour ; avec un nouveau fichier, ça pousse une nouvelle version (le numéro de version doit être incrémenté).
- **Aperçu en temps réel dans le panel admin** : la colonne droite (au-dessus de la liste des modules publiés) affiche désormais une carte qui se met à jour en direct à chaque changement (nom, description, icône, bannière, couleur primaire, particules). Le badge de type (Hébergé / Minecraft) suit la sélection et le bouton du bas adopte la couleur primaire du thème.
- **Modules Minecraft (modpacks CurseForge)** : nouveau type de module dans le panel admin. Tu renseignes le `Project ID` et le `File ID` CurseForge (auto-extraits depuis l'URL collée) + version MC + mod loader optionnels. Les utilisateurs cliquent "Installer le modpack" → le launcher télécharge le `.zip` via l'API CurseForge, lit le `manifest.json` pour récupérer le nom de l'instance Prism, et appelle `prismlauncher --import` pour finaliser. Au prochain clic "JOUER", c'est `prismlauncher --launch <instance> [--server <addr>]` (avec direct-connect au serveur si renseigné). Le suivi du process Prism est branché sur Discord Rich Presence + tracking du temps de jeu, comme les autres modules.
- **Auto-installation de Prism Launcher** : si Prism n'est pas détecté sur la machine (vérifie d'abord les chemins standard d'install puis notre dossier managé), le launcher télécharge automatiquement la dernière release portable depuis GitHub (~90 Mo) et l'extrait dans `%APPDATA%\com.simplelaunche.app\prism\` à la première install d'un modpack. Tes potes n'ont rien à installer manuellement. Le download est mutualisé avec celui du modpack dans le même flow de progression (phases « Téléchargement de Prism Launcher », « Extraction », puis « Téléchargement du modpack », « Import »).
- **Clé API CurseForge** : nouvelle variable `VITE_CURSEFORGE_API_KEY` à mettre dans `.env.local`. Inscription gratuite sur https://console.curseforge.com. Sans cette clé, les modules Minecraft affichent un message explicatif au lieu d'essayer de télécharger.
- **Favoris** : étoile sur chaque carte de bibliothèque (visible au survol, ou tout le temps quand activée) et bouton "Favoris" sur la page détail d'un jeu. Les jeux favoris apparaissent comme des icônes cliquables dans la sidebar gauche, à la façon Discord, avec une mini-étoile dorée dans le coin supérieur droit. Stocké dans Firestore (`/users/{uid}.favorites`), partagé entre tous tes appareils.
- **Sélecteur de fichier natif** pour le chemin de l'exécutable dans le formulaire d'ajout de raccourci : bouton « Parcourir » qui ouvre le dialog Windows pour choisir le `.exe`, le `.bat`, le `.cmd` ou le `.lnk`. Plus besoin de copier-coller le chemin manuellement. Le nom du fichier s'affiche en gros et le chemin complet en mono dessous.
- **Bouton « Ajouter un jeu » dans la bibliothèque** : tout utilisateur peut maintenant créer ses propres raccourcis vers des .exe locaux directement depuis la page Bibliothèque, plus besoin de passer par l'admin.
- **Modal de création/édition** avec formulaire à gauche et **aperçu en temps réel** de la carte à droite : nom, description, icône (upload), bannière (upload), chemin .exe, arguments, couleurs primaire/accent, font display, particules (preset + couleur + densité), serveur Minecraft optionnel. La preview se met à jour à chaque saisie pour visualiser le rendu final avant de valider.
- **Modification d'un raccourci existant** : crayon ✏ qui apparaît au hover sur tes raccourcis dans la bibliothèque, ouvre la même modal pré-remplie. Permet de changer icône, couleurs, etc., à tout moment.
- **Suppression d'un raccourci** depuis la modal d'édition (bouton Supprimer rouge), avec confirmation.

### Changé
- **Refonte de l'architecture des raccourcis** : les raccourcis locaux sont désormais privés à chaque utilisateur (Firestore `/users/{uid}/shortcuts/{id}`, Storage `users/{uid}/shortcuts/{id}/`). Avant, ils étaient stockés dans la collection globale `/modules/*` et visibles par tout le monde — maintenant chacun a sa propre liste perso.
- **Page Admin simplifiée** : retire le toggle Raccourci/Hébergé. L'admin ne sert plus qu'à publier des modules **hébergés** (jeux à télécharger pour tous). Les raccourcis perso passent par la bibliothèque.
- **Page de détail module** : supporte aussi les raccourcis perso (auparavant elle ne trouvait que les modules globaux et affichait "introuvable" pour les raccourcis).
- **Sécurité Firestore + Storage** : nouvelles règles isolant `/users/{uid}/shortcuts/*` à l'utilisateur propriétaire en lecture comme en écriture.

### Corrigé
- **Badge « LOCAL » incorrect dans le panel admin** pour les modules Minecraft. La liste « Modules publiés » affiche désormais le bon badge selon le type : `vX.Y.Z` (cyan) pour les hébergés, `Modpack` (vert émeraude) pour les Minecraft, `Local` (fuchsia) en fallback.
- **Bibliothèque n'affichait pas les modules Minecraft** : le filtre `LibraryPage` ne gardait que les modules de type `hosted`, ce qui excluait les nouveaux modpacks Minecraft créés depuis l'admin. Le filtre exclut désormais uniquement les anciens raccourcis (`shortcut`) qui auraient pu rester dans la collection globale.
- Page détail module : les chemins longs (ex: `C:\Users\…\CurseForge.lnk`) débordaient hors du panneau Informations de manière disgracieuse. Ils sont maintenant dans une zone scrollable horizontalement avec une mini scrollbar discrète, et le chemin complet s'affiche dans une infobulle au survol.
- Formulaire d'ajout de raccourci : l'ID auto-généré depuis le nom restait bloqué sur la première lettre tapée (`MineColonies` → `c` au lieu de `minecolonies`). L'ID se synchronise désormais en continu avec le nom tant que le raccourci n'est pas sauvegardé.
## [v26.04.27] - 2026-04-27  · semver `26.427.0`


### Ajouté
- Page de téléchargement : encart pliable expliquant comment passer le warning Windows SmartScreen lors de la première install (clic "Informations complémentaires" → "Exécuter quand même"), avec note expliquant que les mises à jour suivantes sont signées et passent sans popup.

### Changé
- Refonte des images de l'installeur NSIS (header + sidebar) avec contraste plus fort, logo plus gros, lignes diagonales façon "speed lines", glow cyan + magenta plus saturés, texte épais. Le rendu était trop subtil dans la version précédente, désormais bien visible dans le wizard.
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
