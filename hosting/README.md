# Simple Launcher — Hosting

Backend Firebase Hosting du launcher. Sert :

- `/launcher/latest.json` — manifest auto-updater (lu par Tauri à chaque démarrage)
- `/releases/{version}/{exe + sig}` — installeurs signés
- `/` — page placeholder

## Workflow de release

### Pendant le dev

Chaque modification du launcher → **ajouter une entrée dans `CHANGELOG.md`** sous `## [Unreleased]`, dans la bonne catégorie (Ajouté / Changé / Corrigé / Supprimé / Sécurité). Ces entrées deviennent les notes affichées dans la popup de MAJ côté client.

⚠ **L'IA assistant (Claude) NE déploie PAS de nouvelle version launcher tant que l'utilisateur ne lui dit pas explicitement de le faire.** Les modifs s'accumulent dans `[Unreleased]` jusqu'à ce que tu décides de release.

### Quand tu veux release

#### 1. Bumper la version

Modifie **les trois fichiers** suivants à la même valeur (ex: `0.2.0`) :

- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version = "..."`
- `package.json` → `"version"`

#### 2. Build + sign

```bash
npm run release:launcher
```

Le script :
- Refuse si `[Unreleased]` est vide
- Build le launcher en release (signed)
- Copie `Simple Launcher_X.Y.Z_x64-setup.exe` + `.sig` dans `hosting/releases/X.Y.Z/`
- Met à jour `hosting/download/SimpleLauncher-Setup.exe` (URL stable)
- Génère `hosting/launcher/latest.json` avec la signature, l'URL et les notes
- Rewrite `CHANGELOG.md` : déplace `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`, recrée une `[Unreleased]` vide

#### 3. Déployer

```bash
firebase deploy --only hosting
```

### 4. Tester

Relance ton launcher (ancienne version installée). Le banner "Mise à jour disponible" apparaît en bas à droite après quelques secondes.

## Sécurité

- La clé privée est dans `.tauri-keys/sign.key` (gitignored — **ne jamais commit**)
- La clé publique est dans `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- Si tu perds la clé privée, plus aucun client existant ne pourra recevoir de MAJ : ils devront réinstaller manuellement avec une nouvelle clé.

## Backup de la clé

Dès maintenant, copie `.tauri-keys/sign.key` dans un endroit sûr (KeePass, 1Password, USB dans un tiroir…).
