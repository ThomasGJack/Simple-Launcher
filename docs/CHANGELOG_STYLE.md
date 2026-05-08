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

## Exemples concrets

### ✅ Bonne release note

```markdown
## [Unreleased]

### Nouveau
- Profil public partageable sur /u/ton-id (avatar, bio, achievements, heatmap).
- Calendrier crew partagé avec rappel J-1.

### Amélioré
- Le launcher démarre 2× plus vite sur les crews de 60+ membres.
- L'overlay in-game (Shift+F9) suit ton thème custom.

### Corrigé
- Plus de freeze quand on rejoint un channel avec 1000+ messages.

### Détails techniques
- MembersList O(n²) → O(n) via usersByUid Map partagé entre footer + body
  (src/components/crews/MembersList.tsx). Gain typique : 50ms → < 5ms.
- Channel scroll virtualisé via react-window pour les channels > 500
  messages (cf. src/components/crews/ChannelView.tsx).
- Stage 4 d'optim perf — voir docs/PHASE2.md.
```

### ❌ Mauvaise release note (style ancien)

```markdown
### Corrigé
- **Bouton "Suivant" peu visible / clipped**
  ([src/components/onboarding/OnboardingTour.tsx](src/components/...))
  — le bouton Suivant était trop discret (text-xs px-3.5 py-1.5 weight
  semibold) et pouvait être clipped à largeur étroite. Refonte : text-sm
  font-bold, padding plus généreux (px-5 py-2.5), glow shadow plus
  prononcé, hover scale-up 1.03 + active scale-down 0.98 pour un
  feedback tactile clair. Impossible à manquer.
```

→ Le user ne sait même pas qu'il y avait un onboarding (cycle de dev même
jour). Ni le path. Ni le scale-up. Si on le veut quand même côté user-
facing : *"Onboarding plus lisible"*. Sinon → **Détails techniques**.

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
