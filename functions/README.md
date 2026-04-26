# Simple Launcher — Cloud Functions

Backend serverless pour Simple Launcher. Une seule fonction pour l'instant : `discordAuth`.

## Pré-requis

- Node 20
- `firebase-tools` global : `npm install -g firebase-tools`
- Authentification : `firebase login` (compte Google qui possède le projet `simplelaunche`)

## Setup initial (une seule fois)

```bash
# Depuis la racine du projet (Simple Launcher/)

# 1. Login (s'ouvre dans le navigateur)
firebase login

# 2. Vérifier que le projet est bien sélectionné
firebase use simplelaunche

# 3. Activer Cloud Functions sur Firebase
#    Dans la console : https://console.firebase.google.com/project/simplelaunche/functions
#    Cloud Functions exige le plan Blaze (pay-as-you-go) — il y a un free tier généreux
#    (2M invocations/mois gratuites). Ajouter une CB est nécessaire mais le coût restera 0
#    pour ton usage perso/amis.

# 4. Installer les deps
cd functions && npm install && cd ..

# 5. Définir les secrets (ils ne sont JAMAIS dans le code)
#    Pour DISCORD_CLIENT_SECRET : il est dans .env.local à la racine
firebase functions:secrets:set DISCORD_CLIENT_SECRET
# Colle la valeur quand demandé

firebase functions:secrets:set DISCORD_CLIENT_ID
# Colle 1498029528461869277

# 6. Déployer
firebase deploy --only functions
```

## Mises à jour

```bash
# Modifier functions/src/index.ts puis :
cd functions && npm run build && cd ..
firebase deploy --only functions
```

## Tester en local (émulateur)

```bash
cd functions && npm run serve
# La fonction tourne sur http://localhost:5001
# Pour la pointer côté client, modifier src/firebase/config.ts pour appeler
# `connectFunctionsEmulator(functions, "localhost", 5001)` en dev
```

## Logs

```bash
firebase functions:log
# Ou en direct :
firebase functions:log --follow
```
