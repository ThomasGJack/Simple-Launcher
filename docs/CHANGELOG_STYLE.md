# Conventions release notes — Simple Launcher

Ce doc fixe **comment écrire les entrées du CHANGELOG.md**. C'est lu par
Claude (qui rédige les entrées au fil du dev) et par un humain qui voudrait
contribuer.

---

## Pourquoi ces règles ?

Les release notes sont affichées à **l'utilisateur final** dans deux endroits :

1. La popup d'auto-update du launcher (Velopack lit `release-notes.md` du `.nupkg`)
2. La page `/changelog.html` du site web public (lit `hosting/launcher/versions.json`)
3. Le message Discord embed posté à chaque release (lit `versions.json`)

Le user qui clique "Voir les notes" veut savoir **ce qui change pour lui**, pas
le détail technique. Avant ce style guide, le CHANGELOG était truffé de paths
de fichiers, de jargon (`O(n²) → O(n)`, `useMotionValue`, `manualChunks`), et
de fixes intra-dev qui n'étaient jamais arrivés en prod — bruit pur côté user.

---

## ⚠ Le test du non-tech

**Avant d'écrire une entrée, pose-toi cette question :**

> *Si je lis cette ligne à ma mère, ma sœur, ma cousine — quelqu'un qui sait
> juste ouvrir un mail et un navigateur — est-ce qu'elle comprend ce qui
> change pour elle ?*

Si la réponse est **non** → reformule, ou déplace en "Détails techniques".

**Mots et concepts à bannir** des sections user-facing :

- `onboarding`, `spotlight`, `coach-mark`, `tooltip`, `modal`, `slide-over`,
  `bbox`, `viewport`, `scrollbar`, `hover state`, `ring`, `glow`, `padding`
- Noms de composants React (`MembersList`, `OnboardingTour`, `NewsCard`)
- Mentions de techno (`Velopack`, `Tauri`, `WebView`, `Firestore`, `Rust`,
  `React`, `framer-motion`, `Zustand`)
- Notation `O(n²)`, `useEffect`, `props`, `state`, `flex`, `grid`
- Paths de fichiers, noms de variables (`useMotionValue`, `data-tour-target`)
- Anglais quand un mot français existe (`fix` → "correction", `bug` →
  "problème", `popup` → "fenêtre")

**Mots qui restent OK** parce qu'ils sont compris du grand public :

- "le launcher", "le crew", "Discord", "Minecraft", "modpack", "achievement"
  (ces deux derniers sont entrés dans le langage gamer)
- "rapide / lent", "se connecter", "se déconnecter", "télécharger",
  "installer", "supprimer", "ajouter", "modifier"

---

## Règles d'écriture (sections user-facing)

Les sections **Nouveau**, **Amélioré**, **Corrigé**, **Supprimé**, **Sécurité**
sont user-facing. Pour chacune :

### 1. Une phrase, max ~100 caractères

❌ *Avant*
```
- **Onboarding tour étoffé : 10 étapes au lieu de 6**
  ([src/components/onboarding/OnboardingTour.tsx](src/components/onboarding/OnboardingTour.tsx)
  + 4 pages avec data-tour-target) — chaque section majeure a désormais une
  étape "vue d'ensemble" (spotlight sur le bouton sidebar) PUIS une étape
  "détail" (spotlight sur un élément clé de la page). [200 mots]
```

✅ *Après*
```
- Onboarding au premier login : 10 étapes pour découvrir tout le launcher.
```

### 2. Verbe / nom court au début

- "Nouveau bouton X" / "Plus rapide sur Y" / "Fix : Z ne plante plus"
- Pas de "ajout du composant XYZ" — trop technique.

### 3. Aucun path de fichier, aucun nom de variable, aucun jargon

- ❌ `src/components/library/ModuleCard.tsx`
- ❌ `useMotionValue`
- ❌ `manualChunks`
- ❌ `O(n²) → O(n)`
- ✅ "Plus rapide quand un crew compte 60+ membres."

### 4. Le bénéfice user, pas la cause technique

- ❌ "Refacto MembersList O(n²) → O(n) via usersByUid Map"
- ✅ "Plus rapide sur les gros crews."

- ❌ "Feature Cargo `custom-protocol` manquante dans Cargo.toml"
- ✅ "Le launcher s'ouvre normalement (la v26.05.06.5 affichait une erreur de connexion)."

### 5. Si tu ajoutes X et que tu fix un bug de X **dans le même cycle de dev**

→ Garde **uniquement** "Nouveau X". Le bug n'a jamais été en prod, le user
ne l'a jamais vécu, ne pas le mentionner.

### 6. Si tu releases une version buggée et que tu re-release 1h après

→ L'entrée "Corrigé" passe en **Détails techniques** (archive interne).

Les users qui sautent la version intermédiaire n'ont jamais subi le bug. Les
mentionner crée du bruit ("c'est quoi ce bug que je n'ai jamais vu ?").

### 7. Pas de catégorie vide

Si la release n'a rien de **Supprimé** ou **Sécurité**, supprime ces sous-
sections de la version finale (le release script le fait
automatiquement via `stripEmptyCategories`).

---

## Section "Détails techniques" — quoi y mettre

Cette section est **archivée dans `CHANGELOG.md` mais exclue des release notes**
(Velopack, Discord embed, page changelog publique).

C'est l'endroit pour :

- Paths de fichiers modifiés (utile pour debug ultérieur)
- Refacto interne, mesures de perf, comparaisons before/after
- Raisonnement architectural ("pourquoi on a choisi X plutôt que Y")
- Workarounds, gotchas, cas limites
- Fixes de bugs intra-dev (jamais en prod)
- Tout ce qui aide un futur Claude / dev à comprendre **le pourquoi** d'un changement

Format libre. C'est ton journal interne, sois aussi verbeux que tu veux.

---

## Catégories user-facing

- **Nouveau** — fonctionnalité qui n'existait pas
- **Amélioré** — fonctionnalité existante rendue meilleure (perf, UX, fiabilité)
- **Corrigé** — bug qui était **en prod** et que tu fix
- **Supprimé** — fonctionnalité retirée
- **Sécurité** — fix de faille, changement de permission, rotation de secret

⚠ "Corrigé" est uniquement pour les bugs **publics** (vus par les users). Les
fixes intra-dev → **Détails techniques**.

---

## Exemples avant / après

### Onboarding tour

❌ *Trop technique*
> "Onboarding tour étoffé : 10 étapes au lieu de 6 (src/components/onboarding/OnboardingTour.tsx + 4 pages avec data-tour-target) — chaque section majeure a désormais une étape "vue d'ensemble" (spotlight sur le bouton sidebar) PUIS une étape "détail" (spotlight sur un élément clé de la page)..."

✅ *Test non-tech passé*
> "Visite guidée enrichie au premier lancement — 10 étapes pour découvrir tout le launcher."

### Refacto perf

❌ *Trop technique*
> "MembersList O(n²) → O(n) via usersByUid Map. Gain : 50ms → 5ms."

✅ *Test non-tech passé*
> "Plus rapide quand un crew compte beaucoup de membres."

### Migration auto-update

❌ *Trop technique*
> "Migration vers Velopack — delta updates ~3-5 MB au lieu de 80 MB, install atomique avec rollback, plus de dialog NSIS."

✅ *Test non-tech passé*
> "Mises à jour beaucoup plus rapides : seulement quelques Mo à télécharger au lieu de 80, et installation invisible."

### Fix bug

❌ *Trop technique*
> "Bouton Passer non cliquable — z-10 explicite, fond bg-bg-base/40, pointer-events-auto sur la card."

✅ *Test non-tech passé*
> "Le bouton « Passer » du tutoriel répond maintenant au clic."

(ou si le bug n'a jamais été en prod : pas de mention côté user, tout en
"Détails techniques".)

### Cycle de dev même jour

Tu ajoutes une visite guidée. Pendant le dev tu te rends compte que le
bouton "Suivant" est trop petit, tu le fix dans la même release.

❌ *Mauvais — pollue les notes*
```
### Nouveau
- Visite guidée enrichie.

### Corrigé
- Bouton "Suivant" plus visible.   ← le user n'a JAMAIS vu le bouton invisible
- Bouton "Passer" cliquable.
```

✅ *Bon — bug intra-dev → Détails techniques*
```
### Nouveau
- Visite guidée enrichie au premier lancement.

### Détails techniques
- Fix bouton "Suivant" peu visible (intra-dev, jamais en prod).
- Fix bouton "Passer" non cliquable (intra-dev).
```

---

## Bonne release note complète (exemple modèle)

```markdown
## [Unreleased]

### Nouveau
- Profil public partageable sur ton-id (avatar, bio, achievements, heatmap).
- Calendrier partagé du crew avec rappel la veille des sessions prévues.

### Amélioré
- Le launcher démarre deux fois plus vite quand un crew est gros.
- La fenêtre transparente en jeu (Shift+F9) suit la couleur que tu as choisie.

### Corrigé
- Le launcher ne bloque plus quand un salon a des milliers de messages.

### Détails techniques
- MembersList O(n²) → O(n) via usersByUid Map partagé.
  src/components/crews/MembersList.tsx. Gain : 50ms → < 5ms.
- ChannelView passé en virtualisation react-window au-delà de 500 messages.
- Voir docs/PHASE2.md pour le contexte global de l'optim.
```

---

## Workflow recommandé pendant le dev

1. Dès que tu fais un changement, ajoute une ligne brute sous `## [Unreleased]` 
   (n'importe quelle sous-section, même approximative).
2. Avant `npm run release:launcher`, **relis** ta section `[Unreleased]` 
   et :
   - Reformule en phrases user-facing
   - Migre les détails techniques vers la section dédiée
   - Vire les "Corrigé" qui sont des fixes intra-dev (jamais en prod)
3. `npm run bump` puis `npm run release:launcher`.
4. `firebase deploy --only hosting`
5. `npm run release:notify` (envoie l'embed Discord).
