# Simple Launcher — Hosting

Backend Firebase Hosting du launcher. Sert :

- `/launcher/latest.json` — manifest auto-updater (lu par Tauri à chaque démarrage)
- `/releases/{version}/{exe + sig}` — installeurs signés
- `/` — page placeholder

## Workflow de release

### 1. Bumper la version

Modifie **les trois fichiers** suivants à la même valeur (ex: `0.2.0`) :

- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version = "..."`
- `package.json` → `"version"`

### 2. Build + sign

```bash
NOTES="Ajout système de modules + fix login Discord" npm run release:launcher
```

Le script :
- Build le launcher en release (signed)
- Copie `Simple Launcher_X.Y.Z_x64-setup.exe` + `.sig` dans `hosting/releases/X.Y.Z/`
- Génère `hosting/launcher/latest.json` avec la signature et l'URL

### 3. Déployer

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
