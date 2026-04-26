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
