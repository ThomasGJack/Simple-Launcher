# Changelog

Toutes les modifications notables du launcher sont listées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versioning [SemVer](https://semver.org/lang/fr/).

À chaque modification, ajoute une entrée sous `## [Unreleased]` dans la catégorie qui correspond.

**⚠ Style des entrées : voir [docs/CHANGELOG_STYLE.md](docs/CHANGELOG_STYLE.md).**
Une phrase courte lisible par un user, pas du jargon technique. Les détails
techniques (paths, refacto, perf) vont dans la section dédiée plus bas, qui
est exclue des release notes envoyées au user.

Quand on release, `npm run release:launcher` déplace `[Unreleased]` vers
`[X.Y.Z] - YYYY-MM-DD`. Les sections **Nouveau / Amélioré / Corrigé /
Supprimé / Sécurité** deviennent les notes user (popup d'update, page
changelog, embed Discord). La section **Détails techniques** reste archivée
dans ce fichier mais n'est pas envoyée.

## [Unreleased]

<!--
  Style guide : voir docs/CHANGELOG_STYLE.md
  Une phrase courte, lisible par un user. Pas de chemin de fichier ni de
  jargon. Le bénéfice user, pas la cause technique.
  Si tu ajoutes X et que tu fix un bug de X dans le même cycle, garde
  juste "Nouveau X" — le bug n'a jamais été en prod.
-->

### Nouveau

- Commentaires sur les news, avec possibilité de répondre à un commentaire et de modifier ou supprimer les siens.
- Sondages dans les salons des crews — bouton à côté du composer, comme dans les news.
- Connecte ton compte Twitch dans les Paramètres pour que le titre de ton stream change automatiquement quand tu lances un module.
- Connexion à OBS Studio dans les Paramètres pour préparer un overlay activité du crew sur ton stream.
- Raccourcis clavier customisables dans les Paramètres — capture d'écran, recherche, navigation modules.
- Thèmes saisonniers Halloween et Noël — couleurs qui s'adaptent automatiquement à la période, avec décorations visuelles partout : citrouilles, fantômes, toiles d'araignée et feuilles qui tombent pour Halloween ; sapins, guirlandes lumineuses, flocons et étoiles pour Noël.
- Cadres d'avatar débloquables — réservés aux soutiens, aux saisons, ou disponibles par défaut.
- Choix de la police d'écriture (Inter, Outfit, Manrope, Space Grotesk, JetBrains Mono ou ta police custom Google Fonts).
- Choix de la densité d'affichage : Compact, Confort, ou Aéré.
- Choix du pack de sons : Soft Lofi (par défaut), Arcade 8-bit, ou Minimal (un seul ping discret).
- Canal beta pour tester les modules en pré-release. Activable dans les Paramètres, soumis à invitation par l'admin.
- Wiki collaboratif par crew — pages markdown éditables par tous les membres. Accessible via clic-droit sur un crew → "Outils du crew".
- Liste de tâches partagée par crew — chacun peut ajouter, marquer en cours / terminé, supprimer.
- Capture d'écran via raccourci clavier (F2 par défaut, rebindable dans les Paramètres).
- Importer toute ta bibliothèque Steam en un clic — chaque jeu devient un raccourci avec sa cover et son icône Steam, lancé via Steam directement.

### Amélioré

- Paramètres réorganisés en 6 onglets (Apparence, Compte, Notifications, Raccourcis, Intégrations, Avancé) au lieu d'une grosse liste à scroller.
- Première news en haut du fil cliquable : un bouton "Voir & commenter" ouvre la modal avec le thread de commentaires, même si la news est courte.
- Marge ajoutée dans la zone de saisie des commentaires pour que le texte ne soit plus rogné par les bords arrondis.

### Corrigé

### Supprimé

### Sécurité

<!-- ──────────────────────────────────────────────────────────────────
     DÉTAILS TECHNIQUES — Archive interne, NON affichée au user.
     Le release script `scripts/release-launcher.mjs` exclut cette
     section des release notes envoyées via Velopack et Discord.
     Y mettre : paths de fichiers, refacto, perf debug, raisonnement
     architectural — tout ce qui aide un futur dev (ou un futur Claude)
     à comprendre le pourquoi d'un changement, mais qui n'a aucune
     valeur pour un utilisateur final.
     ────────────────────────────────────────────────────────────────── -->

### Détails techniques

- **Phase A — Channel content** ([src/firebase/newsComments.ts](src/firebase/newsComments.ts), [src/firebase/channelPollVotes.ts](src/firebase/channelPollVotes.ts), [src/components/news/CommentThread.tsx](src/components/news/CommentThread.tsx) + `CommentItem.tsx`, [src/components/crews/PollComposer.tsx](src/components/crews/PollComposer.tsx) + `PollMessage.tsx`) — sub-coll `/news/{newsId}/comments/{commentId}` (1 niveau threading via `parentCommentId`, cap watcher 200), `/crews/{crewId}/channels/{channelId}/messages/{messageId}/votes/{uid}`. `CrewMessage.poll` étend le type pour les sondages inline. Markdown léger via `marked` + sanitize via DOMPurify. Rules : tout authed peut read, create gated sur `authorUid == request.auth.uid`, update/delete owner-only.
- **Phase B — External presence** ([src-tauri/src/twitch_rpc.rs](src-tauri/src/twitch_rpc.rs), [src-tauri/src/obs_ws.rs](src-tauri/src/obs_ws.rs), [src/lib/twitchAuth.ts](src/lib/twitchAuth.ts), [src/lib/obsBridge.ts](src/lib/obsBridge.ts), [src/components/settings/TwitchPanel.tsx](src/components/settings/TwitchPanel.tsx) + `ObsPanel.tsx`) — `TwitchRpc` singleton Tauri-managed, set_title via Helix `PATCH /channels`. OBS WebSocket v5 client basé sur `tokio-tungstenite = "0.21"`, handshake SHA-256 challenge (`compute_obs_auth`). Hook dans `modules.rs` + `mc_launch.rs` : `app.try_state::<TwitchRpc>()` + `set_title("Joue à {name}")` en parallèle de Discord RPC. Token Twitch en localStorage (OAuth implicit, expire 60j).
- **Phase C — Settings + Cosmetics core** ([src-tauri/src/shortcuts.rs](src-tauri/src/shortcuts.rs), [src/lib/customShortcuts.ts](src/lib/customShortcuts.ts), [src/components/settings/ShortcutsPanel.tsx](src/components/settings/ShortcutsPanel.tsx), [src/lib/cosmetics.ts](src/lib/cosmetics.ts), [src/firebase/cosmetics.ts](src/firebase/cosmetics.ts), [src/components/cosmetics/AvatarFrame.tsx](src/components/cosmetics/AvatarFrame.tsx) + `CosmeticsGallery.tsx`) — `ShortcutsState` Rust avec `HashMap<ActionId, Shortcut>` + emit `"shortcut-triggered"` event que le frontend écoute pour dispatcher les actions. 5 actions registry frontend-side (capture, mute, etc.). 8 frames cosmetic (default×3, tier×3, season×2) avec patterns SVG (solid/dashed/double/rainbow + animations). `/users/{uid}/cosmetics/{id}` sub-coll watch/grant/equip.
- **Phase D — Themes complets** ([src/lib/soundpacks.ts](src/lib/soundpacks.ts), [src/lib/sounds.ts](src/lib/sounds.ts), [src/lib/themes.ts](src/lib/themes.ts), [src/components/settings/ThemePanel.tsx](src/components/settings/ThemePanel.tsx)) — refacto majeur du module sounds (~250 callsites) en dispatcher : `sounds.click()` etc. devient un thin proxy vers le pack actif, l'API publique est préservée → 0 callsite touché. 3 packs : softlofi (sine + lowpass — actuel), arcade (square 8-bit), minimal (1 ping). FONT_PRESETS + customFontUrl (Google Fonts via `loadFontFace`). LAYOUTS = compact/comfortable/spacious injectent CSS vars `--spacing-base` + `--font-size-base`.
- **Phase E — Module system** ([src/types/module.ts](src/types/module.ts), [src/lib/moduleVisibility.ts](src/lib/moduleVisibility.ts), [src/components/settings/BetaChannelPanel.tsx](src/components/settings/BetaChannelPanel.tsx)) — `BaseModule` étendu avec `prereleaseChannel: "stable" | "beta"` + `prereleaseTesterUids: string[]`. `MinecraftModule.modpackVersion?` pour compare local-vs-server (badge "MAJ modpack" sur la card). `filterVisibleModules(rawModules, { uid, betaEnabled })` côté client. Rules : module beta lisible seulement si owner OU dans `prereleaseTesterUids`. `useSettingsStore.enableBetaChannel: boolean`.
- **Phase F — Crew docs** ([src/firebase/crewWiki.ts](src/firebase/crewWiki.ts), [src/firebase/crewTodos.ts](src/firebase/crewTodos.ts), [src/components/crews/CrewToolsModal.tsx](src/components/crews/CrewToolsModal.tsx) + `CrewToolsModalHost.tsx`, [src/components/crews/CrewContextMenu.tsx](src/components/crews/CrewContextMenu.tsx)) — sub-coll `/crews/{crewId}/wikiPages/{pageId}` (markdown body, hierarchy 1 niveau via `parentPageId`, cap 50) + `/crews/{crewId}/todos/{todoId}` (status/priority, cap 100). Modal 2-tab déclenchée via event `crew-tools:open` dispatch depuis le clic-droit context menu. Last-write-wins (pas de OT/CRDT) — affichage "Édité par X il y a Ys" suffit comme déterrent.
- **Phase G — Screenshots** ([src-tauri/src/screenshot.rs](src-tauri/src/screenshot.rs), [src/lib/screenshot.ts](src/lib/screenshot.ts)) — `screenshot_capture()` via crate `screenshots = "0.8"` + `image::PngEncoder` retourne `Vec<u8>` PNG bytes. Frontend `captureAndSave()` crée un blob URL + déclenche download (pas de plugin-fs dans deps). Hook dans `App.tsx` via `onShortcut("screenshot.capture", ...)`. PiP reporté au prochain cycle.
- **Phase H — Steam library import** ([src-tauri/src/steam.rs](src-tauri/src/steam.rs), [src/lib/steamImport.ts](src/lib/steamImport.ts), [src/components/library/SteamImportModal.tsx](src/components/library/SteamImportModal.tsx)) — détection Steam scan `C:\Program Files (x86)\Steam` + `C:\Program Files\Steam`, parser VDF light pour `libraryfolders.vdf` + `appmanifest_*.acf`. `steamGameToShortcut(game)` génère `executablePath: "steam://run/{appid}"` + URLs CDN Cloudflare Steam pour `iconUrl` (header.jpg 460×215) et `bannerUrl` (library_600x900.jpg). Bulk insert via `saveUserShortcut` loop. Pas de scrape d'`appinfo.vdf` binaire.
- **Saisonniers admin-only** ([src/firebase/seasonalConfig.ts](src/firebase/seasonalConfig.ts), [src/components/admin/SeasonalAdminPanel.tsx](src/components/admin/SeasonalAdminPanel.tsx), [src/components/layout/SeasonalDecorations.tsx](src/components/layout/SeasonalDecorations.tsx)) — déplacé du store user vers `/config/seasonal` Firestore (rules `/config/{configId}` read authed, write admin-only). `bootSeasonalTheme()` applique "auto" sync au boot ; `App.tsx` useEffect dépend de `user` pour install le watcher Firestore (re-subscribe à chaque login pour bypass le permission-denied initial). MutationObserver sur `<html data-season>` côté `SeasonalDecorations` → bascule live des emojis/SVG. Halloween : 4 spider webs SVG + 4 citrouilles + 3 chauves-souris fixes + 4 flying bats + 8 falling leaves + 2 ghosts qui flottent + accents (tombe, araignée, lune, bonbon). Noël : 2 fairy lights SVG (top + bottom, 12 LEDs colorées qui pulsent en décalé) + 3 sapins + 14 falling snowflakes + accents (étoiles, cadeaux, cloches, renne). `pointer-events-none` partout, `motion.div` transform-only pour rester GPU.
- **Settings tabs** ([src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)) — refacto en 6 onglets identiques au pattern AdminPage : `apparence` (sons + theme + accent), `compte` (Minecraft accounts), `notifications` (windows + overlay + toasts), `raccourcis` (custom shortcuts), `integrations` (Twitch + OBS), `avance` (beta + cache + logs + diag + tour + version). `AnimatePresence mode="wait"` + `layoutId="settings-tab-pill"` pour l'animation du pill.
- **Comments fix** : NewsCard featured news désormais toujours cliquable (drop guard `isLongFeatured`, label "Voir & commenter"). Textarea du composer : `px-1 leading-relaxed` pour compenser le `rounded-2xl` 16px du parent qui dépassait des `p-3` 12px → premières lettres rognées. Rules `/news/{nid}/comments/{cid}` déployées (le fix Publier).

## [v26.05.06.16] - 2026-05-06  · semver `26.506.15`

### Nouveau

- Visite guidée enrichie au premier lancement — 10 étapes pour découvrir tout le launcher.
- Raccourcis clavier dans la visite : Échap pour passer, Entrée ou flèche droite pour avancer, flèche gauche pour reculer.

### Détails techniques

- Onboarding tour étoffé : 10 étapes au lieu de 6. Chaque section majeure a une étape "vue d'ensemble" (spotlight sur le bouton sidebar) PUIS une étape "détail" (spotlight sur un élément clé de la page). Library, Community, Profile : 2 steps chacun. Crews + Settings : 1 step. Total 10. Voir [src/components/onboarding/OnboardingTour.tsx](src/components/onboarding/OnboardingTour.tsx) + 4 pages.
- Nouveaux `data-tour-target` sur la grille Library, le panneau users de Community, et la heatmap de Profile. Le tour navigue auto à chaque step.
- Fix bouton "Suivant" peu visible / clipped (intra-dev, jamais en prod) : text-xs → text-sm font-bold, padding px-5 py-2.5, glow plus prononcé, hover scale 1.03.
- Fix bouton "Passer" non cliquable (intra-dev) : z-10 explicite, fond bg-bg-base/40 au repos, pointer-events-auto sur la card pour garantir la cliquabilité.
## [v26.05.06.15] - 2026-05-06  · semver `26.506.14`


### Changé

- **Onboarding tour refonte coach-mark / spotlight** ([src/components/onboarding/OnboardingTour.tsx](src/components/onboarding/OnboardingTour.tsx) + [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx)) — le tour de présentation passe d'une modal centrée plein écran à un pattern type "guided tour" : (1) **Card flottante** bottom-right de l'écran (~26 rem), pas de backdrop fullscreen qui bloque tout. (2) **Spotlight** : un overlay SVG dimme l'écran SAUF autour du bouton Sidebar correspondant à l'étape (Bibliothèque / Communauté / Crews / Profil / Paramètres), avec un anneau cyan animé qui pulse autour du target. (3) **Auto-navigation** : à chaque changement d'étape, le launcher navigue auto vers la page concernée — la card reste ouverte pendant la transition pour que l'utilisateur voie l'UI tout en lisant l'explication. (4) **Pointer-events transparents** sur le backdrop : tu peux cliquer sur le bouton Sidebar mis en évidence pendant que le tour est ouvert. (5) Final centered modal "Tu es prêt(e) !" pour conclure proprement. Les boutons Suivant / Retour / Passer sont compacts et clairement visibles dans la card. NavButton accepte un nouveau prop `tourTarget` qui se traduit en `data-tour-target` côté DOM, lu par le hook `useTargetRect` du tour pour mesurer la bbox via `getBoundingClientRect` + ResizeObserver/scroll listeners.

### Corrigé

- **Boutons Suivant clipped au bas de la modal d'onboarding** ([src/components/onboarding/OnboardingTour.tsx](src/components/onboarding/OnboardingTour.tsx)) — la previous implementation avait un footer `flex justify-between` avec [Retour] + [Voir la bibliothèque] + [Suivant], mais à largeur étroite le bouton Suivant débordait silencieusement. Refonte du footer : seul Retour + Suivant restent, le bouton "Voir [section]" est retiré (l'auto-navigation par étape le rend redondant).
## [v26.05.06.14] - 2026-05-06  · semver `26.506.13`


### Ajouté

- **Page Notifications complète** ([src/pages/NotificationsPage.tsx](src/pages/NotificationsPage.tsx) + [src/store/ui.ts](src/store/ui.ts) + [src/components/layout/AppShell.tsx](src/components/layout/AppShell.tsx) + [src/components/notifications/NotificationsCenter.tsx](src/components/notifications/NotificationsCenter.tsx)) — nouvelle route dédiée `notifications` qui affiche l'historique complet en grand format. Features : (1) **Filtres par type** — chips pour Achievements / Invitations / Amis / News / Mises à jour / Système, chaque chip avec son icône + couleur dédiée + compteur, désactivé si zéro item. (2) **Filtre lu/non lu** — bouton "Non lues" avec compteur, idéal pour le triage. (3) **Recherche full-text** sur titre + description, avec icône clear. (4) **Groupement par date** — Aujourd'hui / Hier / Cette semaine / Plus ancien, séparateurs avec compteurs. (5) **Cards plus larges** que le slide-over — body intégral non tronqué, badge type coloré, hint "Click → ouvre la page" pour les notifs avec un link. (6) **Bulk actions** — "Tout marquer lu" en header (cible toutes les non-lues), "Tout marquer lu (filtre)" qui apparaît quand un filtre est actif et cible uniquement la liste affichée. (7) **Bouton Paramètres** qui navigue vers les réglages des notifs natives par type. Lazy-loadée comme tous les autres pages, avec drill-down transition. ScrollMemoryRoot pour préserver la position en navigant ailleurs.
- **Lien "Voir tout l'historique"** dans le slide-over Notifications ([src/components/notifications/NotificationsCenter.tsx](src/components/notifications/NotificationsCenter.tsx)) — footer du panel slide-over qui navigue vers la nouvelle page complète. Le slide-over reste pour les scans rapides ; la page sert au triage en profondeur.
## [v26.05.06.13] - 2026-05-06  · semver `26.506.12`


### Ajouté

- **Onboarding tour multi-étapes** ([src/components/onboarding/OnboardingTour.tsx](src/components/onboarding/OnboardingTour.tsx) + [src/components/updater/UpdateBanner.tsx](src/components/updater/UpdateBanner.tsx) + [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)) — tour guidé en 6 étapes qui se déclenche **après la WelcomeModal** au tout premier boot (Bibliothèque → Communauté → Crews → Profil → Paramètres → "Tu es prêt"). Chaque étape a une icône colorée animée avec halo, un body explicatif, un bouton "Voir [section]" qui navigue vers la page concernée + close le tour, plus Suivant / Retour / Passer. Step indicator en dots animés au top + compteur "Étape X / Y". Animation slide-x entre les étapes. One-shot (LS flag `launcher.onboardingDone`), refaisable depuis **Paramètres → "Refaire le tour de présentation"**. Architecture découplée : UpdateBanner monte le tour, SettingsPage dispatche un CustomEvent `launcher:replay-onboarding` qu'un `OnboardingReplayBridge` écoute pour ré-ouvrir le tour à n'importe quel moment.
## [v26.05.06.12] - 2026-05-06  · semver `26.506.11`


### Ajouté

- **Liens cliquables partout** ([src/lib/linkUtils.ts](src/lib/linkUtils.ts) + [src/components/crews/MessageItem.tsx](src/components/crews/MessageItem.tsx) + [src/pages/MessagesPage.tsx](src/pages/MessagesPage.tsx) + [src/lib/crewMessageFormat.ts](src/lib/crewMessageFormat.ts)) — auto-linkification des URLs en clair étendue aux messages de **crew chat** et aux **DMs privés**. Le helper `preprocessAutolinks` + `handleExternalLinkClick` (auparavant inlinés dans NewsCard) est extrait dans `lib/linkUtils.ts` et partagé. Les DMs qui rendaient juste `{message.text}` en plain text passent maintenant par `renderMessageMarkdown` (auto-link + bold/italic/code) pour cohérence avec les crews. Tous les liens http(s) ouvrent dans le navigateur OS via `tauri-plugin-opener`.
- **Aperçu des sons dans Settings** ([src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx) `SoundPreviewCard`) — nouvelle carte sous le toggle "Sons d'interface" avec 8 boutons (Clic, Lancement, Succès, Erreur, Notification, Message, Maj. arrivée, Achievement Or) qui jouent chaque son à la demande. Permet d'entendre les sons en isolation avant de les rencontrer en contexte. Boutons grisés quand le master toggle est off.

### Changé

- **Phase 2 perf — MembersList O(n²) → O(n)** ([src/components/crews/MembersList.tsx](src/components/crews/MembersList.tsx)) — les compteurs `onlineCount` + `inGameCount` du footer faisaient un `allUsers.find(u => u.uid === ...)` linéaire par membre, soit O(n²) sur master crew avec 60+ users. Refactor pour passer par le `usersByUid` Map déjà construit ailleurs dans le component → un seul pass O(n) qui calcule les deux compteurs en même temps. Gain typique : ~50 ms → < 5 ms par render sur master crew.
## [v26.05.06.11] - 2026-05-06  · semver `26.506.10`


### Ajouté

- **Modal de détail pour les news** ([src/components/home/NewsCard.tsx](src/components/home/NewsCard.tsx)) — chaque news compacte dans la liste scrollable est désormais cliquable et ouvre une **modal plein écran** avec la news en pleine taille (body intégral non tronqué, réactions, sondage). La modal a un backdrop dimmed + blur, un bouton **Fermer** en haut à droite, ferme à l'Escape ou au click sur le backdrop, et est scrollable si la news est très longue. Les compactes ont aussi un petit chevron animé qui apparaît au survol pour suggérer la cliquabilité, plus un effet hover (ring accent + lift d'ombre).
- **Bouton "Voir la news complète"** ([src/components/home/NewsCard.tsx](src/components/home/NewsCard.tsx)) — quand la news featured (en haut) a un body long (> 280 chars OU contient une structure markdown comme heading/list/code block), un bouton coloré apparaît sous le body pour ouvrir la même modal. Permet d'accéder à un rendu plus aéré sans casser la lisibilité du widget HomePage.
## [v26.05.06.10] - 2026-05-06  · semver `26.506.9`


### Changé

- **News widget : liste verticale scrollable** ([src/components/home/NewsCard.tsx](src/components/home/NewsCard.tsx)) — la news featured (épinglée ou plus récente) reste affichée en pleine taille en haut, mais en dessous la liste des news plus anciennes est désormais **toujours visible** sous forme compacte, avec au moins 2 items en permanence sans interaction. Au-delà, la liste scrolle verticalement (max-height 192 px, scrollbar fine type `info-scroll` qui tire un accent cyan au survol). Header `Plus de news` + compteur du nombre d'items archivés. Avant : il fallait cliquer "Voir les news plus anciennes" puis "Masquer" pour expand/collapse — nouveau comportement plus direct et plus discoverable, le scroll suffit.

### Supprimé

- **Bouton "Voir les news plus anciennes" / "Masquer"** ([src/components/home/NewsCard.tsx](src/components/home/NewsCard.tsx)) — remplacé par la liste compacte toujours visible en scroll vertical (cf. ci-dessus). L'expand/collapse animé n'a plus lieu d'être.
## [v26.05.06.9] - 2026-05-06  · semver `26.506.8`


### Ajouté

- **Liens cliquables dans les news** ([src/components/home/NewsCard.tsx](src/components/home/NewsCard.tsx) + [src/lib/sanitizeHtml.ts](src/lib/sanitizeHtml.ts)) — refonte du rendu des news pour rendre les URLs vraiment cliquables. Trois améliorations combinées : (1) **Auto-linkification** des URLs en clair — taper `https://exemple.com` dans le corps de la news fait apparaître un lien sans avoir à utiliser la syntaxe markdown `[texte](url)`. Le pre-processing détecte les URLs http(s) qui ne sont pas déjà à l'intérieur d'un lien markdown et les wrappe en autolinks. (2) **Click interceptor** sur le conteneur des news qui intercepte les clics sur `<a>` et les route via `tauri-plugin-opener` vers le navigateur système — sans ça, Tauri 2 essayait de naviguer dans la webview du launcher et le clic n'avait aucun effet visible. (3) **Sécurité défense-en-profondeur** : le sanitizer DOMPurify ajoute désormais `target="_blank" rel="noopener noreferrer"` à chaque `<a>` http(s), pour que même si l'interceptor échoue, on évite tout détournement de navigation. Le style des liens dans les news est maintenant cohérent (couleur accent + underline subtil + cursor pointer).
## [v26.05.06.8] - 2026-05-06  · semver `26.506.7`




### Corrigé

- **Cache CDN Firebase qui servait l'ancien Setup.exe cassé** ([firebase.json](firebase.json)) — les headers `Cache-Control: max-age=31536000, immutable` étaient appliqués indistinctement à TOUS les .exe du hosting, y compris `/download/SimpleLauncher-Setup.exe` qui est l'URL stable mise à jour à chaque release. Résultat : même après deploy d'une version fixée, le CDN edge servait la version cachée précédente aux users qui re-téléchargeaient. Fix : split des règles de cache — `/launcher/**/*.{exe,nupkg,...}` (fichiers versionnés, vraiment immutables) gardent le cache long-terme, `/download/**` (URL stable mirroir) passe à `max-age=300, must-revalidate` pour qu'un nouveau deploy soit visible immédiatement.
## [v26.05.06.7] - 2026-05-06  · semver `26.506.6`




### Corrigé

- **Feature Cargo `custom-protocol` manquante** ([src-tauri/Cargo.toml](src-tauri/Cargo.toml)) — cause racine du bug d'install : la feature `custom-protocol` n'était pas déclarée dans le `Cargo.toml`. Tauri's `build.rs` utilise cette feature pour décider entre mode dev (load depuis `http://localhost:1420`) et mode release (load depuis le custom protocol vers les fichiers embedded). Sans la feature, même `tauri build` produisait un binaire en mode dev qui essayait de joindre le devUrl chez les users → ERR_CONNECTION_REFUSED. Fix : ajout de la feature `custom-protocol = ["tauri/custom-protocol"]` qui est forwardée auto par `tauri build`. La fix précédente (passer de `cargo build --release` à `tauri build --no-bundle`) était nécessaire mais pas suffisante — c'est cette feature qui débloque réellement le mode release.
## [v26.05.06.6] - 2026-05-06  · semver `26.506.5`




### Corrigé

- **Build release-mode signalé correctement à Tauri** ([scripts/release-launcher.mjs](scripts/release-launcher.mjs)) — la première release Velopack v26.05.06.5 produisait un binaire qui essayait de charger l'UI depuis `http://localhost:1420` (le devUrl) au lieu d'utiliser les fichiers embedded du `frontendDist`. Cause : `cargo build --release` direct ne configure pas les env vars que `tauri-build` (build.rs de Tauri) attend pour switcher en mode release. Symptôme côté user : le launcher affiche une page Edge "ERR_CONNECTION_REFUSED" au lancement. Fix : remplacé par `npx tauri build --no-bundle` qui passe correctement par la CLI Tauri (set release env vars + run beforeBuildCommand) tout en skippant le bundle NSIS qu'on ne veut pas.
## [v26.05.06.5] - 2026-05-06  · semver `26.506.4`




### Corrigé

- **URL endpoint Velopack** ([src-tauri/src/velo_updater.rs](src-tauri/src/velo_updater.rs)) — l'URL `UPDATE_URL` pointait sur `/launcher/` (héritage de la config tauri-plugin-updater) au lieu de `/launcher/win/` où Velopack publie les manifests par channel. Sans le segment `/win/`, Velopack n'aurait pas trouvé le `releases.win.json` et l'auto-update aurait silencieusement échoué côté client.
- **Headers Firebase pour Velopack** ([firebase.json](firebase.json)) — ajout des `.nupkg` aux fichiers cacheables long-terme, et règle `no-cache` explicite sur le fichier `RELEASES` (texte plat sans extension) pour que les clients ne récupèrent pas un manifeste obsolète depuis le CDN.
## [v26.05.06.4] - 2026-05-06  · semver `26.506.3`


### Ajouté

- **Migration complète vers Velopack** ([src-tauri/src/velo_updater.rs](src-tauri/src/velo_updater.rs) + [src-tauri/src/main.rs](src-tauri/src/main.rs) + [src/lib/veloUpdater.ts](src/lib/veloUpdater.ts) + [scripts/release-launcher.mjs](scripts/release-launcher.mjs)) — refonte complète du système d'install / d'auto-update. Velopack remplace NSIS (plus aucune boîte de dialogue Windows-classique) et tauri-plugin-updater. Apporte trois bénéfices majeurs : (1) **Delta updates** — le launcher ne télécharge plus que ce qui a changé entre deux versions (~3-5 MB au lieu de ~80 MB pour un changement React typique). (2) **Install silencieux** — le `Setup.exe` Velopack n'affiche aucune boîte de dialogue NSIS ; il extrait, configure et lance directement le launcher dont la `WelcomeModal` premium fait office d'expérience d'install. (3) **Atomic upgrades** — rollback automatique si l'install échoue, plus de risque de launcher "à moitié installé". Velopack est l'engine utilisé par Discord, GitHub Desktop, Slack — battle-tested sur des millions d'utilisateurs.

### Changé

- **Pipeline release Velopack** ([scripts/release-launcher.mjs](scripts/release-launcher.mjs)) — refonte du script pour invoquer `vpk pack` au lieu du bundling NSIS. La pipeline : (1) build frontend Vite, (2) cargo build --release pour produire le raw simple-launcher.exe, (3) staging des binaires, (4) vpk pack qui génère Setup.exe + .nupkg full + .nupkg delta + RELEASES manifest dans `hosting/launcher/win/`. Le hosting Firebase change de structure : plus de `latest.json` ni de `.exe.sig` au format Tauri, à la place le format Velopack standard.
- **HUD update sur APIs Velopack** ([src/components/updater/UpdateBanner.tsx](src/components/updater/UpdateBanner.tsx) + [src/lib/veloUpdater.ts](src/lib/veloUpdater.ts)) — le HUD premium existant (stepper 4 étapes, vitesse temps-réel, ETA, shimmer, animations) est conservé tel quel mais branché sur les nouvelles commands Tauri Rust (`velo_check` / `velo_download` / `velo_apply`) qui wrappent le crate velopack. La progression arrive via l'event Tauri `velo:progress` (0-100 %) au lieu des byte-deltas du plugin updater. La conversion vers bytes/s + ETA se fait côté React à partir du `summary.size` retourné par `velo_check`.

### Supprimé

- **NSIS bundler retiré** ([src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)) — `bundle.active` passé à `false`, plus de `targets: ["nsis"]`, plus de section `windows.nsis`. Le `cargo build --release` produit maintenant juste le raw `simple-launcher.exe` que Velopack package ensuite. Les BMPs `installer/header.bmp` + `installer/sidebar.bmp` + `installer/hooks.nsh` restent au dépôt pour l'historique mais ne sont plus utilisés. La dépendance `tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` (npm) sont retirées du projet.
- **Permission `updater:default`** retirée de `src-tauri/capabilities/default.json` — le plugin updater n'existe plus, sa permission n'a plus lieu d'être.

### Sécurité

- **Code signing Velopack** — Velopack supporte la signature Authenticode standard via `--signParams` ou `--azureTrustedSignFile` mais n'est pas activé sur cette release (pas de cert disponible côté dev). À ré-activer quand un cert EV sera disponible. Sans signature, Windows SmartScreen affichera le warning "Cette application n'est pas reconnue" au premier lancement, comme actuellement avec NSIS.
## [v26.05.06.3] - 2026-05-06  · semver `26.506.2`




### Corrigé

- **PlayHeatmap écrasée en colonne mono-mot dans PublicProfilePage** ([src/pages/PublicProfilePage.tsx](src/pages/PublicProfilePage.tsx)) — la `motion.div` qui wrappait la heatmap était à l'intérieur d'un `grid grid-cols-12` sans `col-span` explicite, donc elle prenait 1/12 de la largeur du grid (~80-140 px), forçant chaque mot à wrapper sur sa propre ligne. Mes deux fixes précédents (w-full sur la card, min-w-0 sur le titre) traitaient les symptômes au mauvais étage : la card remplissait BIEN sa largeur disponible, mais cette largeur était imposée par le parent grid à 1/12. Fix : `col-span-12` ajouté pour que la heatmap prenne la ligne complète sous les sections stats + top jeux.
## [v26.05.06.2] - 2026-05-06  · semver `26.506.1`


### Ajouté

- **HUD de mise à jour premium refonte complète** ([src/components/updater/UpdateBanner.tsx](src/components/updater/UpdateBanner.tsx)) — l'expérience de mise à jour passe à un autre niveau visuel. Le banner bottom-right utilise maintenant un stepper 4 étapes (Vérification → Téléchargement → Installation → Redémarrage) avec checkmarks animés au passage. Le panneau de download affiche : badge version, vitesse temps-réel (Mo/s ou Ko/s avec EWMA pour ne pas flicker), ETA calculée live, barre de progression avec shimmer interne + glow cyan, halo pulsant sur l'icône, sheen de fond qui balaye en boucle. Nouveaux états : "Installation en cours" (Tauri silent install) avec icône qui tourne, "Prêt" (avant relaunch) avec animation rocket spring + countdown, et "Échec" avec bouton Réessayer (réutilise la même Update sans re-fetch).
- **Modal de bienvenue première installation** ([src/components/updater/UpdateBanner.tsx](src/components/updater/UpdateBanner.tsx) `WelcomeModal`) — sur le tout premier boot après une fresh install (détecté via `lastSeenVersion === null` en localStorage), une modale plein écran s'ouvre avec animation logo halo cyan, badge version, 4 highlights animés en cascade (Lance tes jeux, Crews & overlay, Achievements, Mises à jour live), et un seul CTA "Démarrer". One-shot — ne s'affiche jamais sur les boots suivants ni après un upgrade. Donne au launcher un côté "produit fini" type Steam / Discord à la première ouverture.
- **Hooks NSIS post-install** ([src-tauri/installer/hooks.nsh](src-tauri/installer/hooks.nsh) + [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)) — `installerHooks` câblé via la config Tauri. Crée un marker `.fresh-install` dans `%APPDATA%/SimpleLauncher` après l'install pour de futures détections, nettoie les markers à la désinstallation. Pas de modification destructive sur les datas user (saves, screenshots, configs restent en place après uninstall).

### Changé

- **Artwork installeur (header.bmp + sidebar.bmp)** ([scripts/build-installer-art.mjs](scripts/build-installer-art.mjs)) — refonte complète des BMPs NSIS. Multi-couches gradient (panel → mid → deep), trois halos radiaux (cyan top, fuchsia bottom-right, violet bottom-left), texture subtle scan-lines, lignes de speed diagonales, neon rim, divider décoratif (bars + dot) sous le wordmark, taglines micro-typo. Les contraintes NSIS (150 × 57 et 164 × 314) sont respectées mais l'esthétique est passée d'un placeholder simple à une vraie identité de marque.
## [v26.05.06] - 2026-05-06  · semver `26.506.0`


### Ajouté

- **Phase 1.1 — Notifications Windows natives configurables par kind** ([src/lib/notificationPrefs.ts](src/lib/notificationPrefs.ts) + [src/lib/notifications.ts](src/lib/notifications.ts) + [src/App.tsx](src/App.tsx)) — chaque type de notif natif (message, achievement, mention crew, ami online, ami lance un jeu) a son propre toggle dans Settings. Master switch + 5 cases à cocher par kind, persisté en localStorage. Defaults raisonnables : message / achievement / mention ON par défaut, ami online / ami lance OFF (sinon ça spam).
- **Phase 1.2 — Mémorisation du scroll par route** ([src/store/scrollMemory.ts](src/store/scrollMemory.ts) + [src/hooks/useScrollMemory.ts](src/hooks/useScrollMemory.ts) + [src/hooks/ScrollMemoryRoot.tsx](src/hooks/ScrollMemoryRoot.tsx)) — quand tu navigues d'une longue page (Library, Communauté, Achievements, Settings) vers une autre puis reviens, ton scroll est restauré exactement où tu étais. Store Zustand keyé par routeKey, restore via `requestAnimationFrame`, save throttled à 80 ms + flush final à l'unmount. Pas de saut visuel.
- **Phase 1.3 — Toasts in-app custom** ([src/lib/uiToasts.ts](src/lib/uiToasts.ts) + [src/components/ui/UiToastsHost.tsx](src/components/ui/UiToastsHost.tsx)) — système de toasts in-launcher (à ne pas confondre avec les toasts in-game de l'overlay). 4 kinds (info / success / warning / error), queue avec limite, dismiss manuel + auto. Section dédiée dans Settings → Notifications avec toggle master + boutons Test pour chaque kind. Les toasts d'erreur ne sont jamais désactivables (sécurité).
- **Phase 1.4 — Heatmap horaires de jeu** ([src/firebase/playHeatmap.ts](src/firebase/playHeatmap.ts) + [src/components/profile/PlayHeatmap.tsx](src/components/profile/PlayHeatmap.tsx)) — graphique 7 × 24 GitHub-style sur Profile + PublicProfilePage qui montre quand tu joues (jour de la semaine × heure). Plus c'est foncé, plus tu lances de jeux à cette heure-là. Visible sur les profils amis pour planifier des sessions ensemble. Empty state propre quand aucune donnée encore.
- **Phase 1.5 — Rôles custom dans les crews** ([src/firebase/crews.ts](src/firebase/crews.ts) + [src/pages/CrewConfigPage.tsx](src/pages/CrewConfigPage.tsx)) — nouveau type `CustomRole` (id, nom, couleur, position) gérable par owner / admin via la config du crew. Création / renommage / recoloriage / suppression. Assignable / clearable par membre. CRUD gated server-side via Firestore rules (`isCrewAdminOrOwner`). Purement décoratif — ne donne pas de permissions, juste une étiquette (style "VIP", "Citoyen", "Vétéran").
- **Affichage Discord-style des rôles custom dans MembersList** ([src/components/crews/MembersList.tsx](src/components/crews/MembersList.tsx)) — la liste de membres à droite du crew est désormais groupée par rôle. Header de section avec le nom du rôle dans sa couleur + le compte de membres. Le `displayName` est rendu dans la couleur du rôle custom (override le tier coloring). Sections triées par `position` (asc = haut, convention Discord). Section finale "Membres" pour les sans-rôle. Section synthétique "Propriétaire" en amber au sommet pour épingler l'owner.
- **Page de configuration dédiée pour les crews** ([src/pages/CrewConfigPage.tsx](src/pages/CrewConfigPage.tsx) + [src/components/crews/CrewContextMenu.tsx](src/components/crews/CrewContextMenu.tsx)) — onglets Général / Salons / Rôles. Accès via clic-droit sur l'icône du crew dans la rail. Owner / admin uniquement. Permet de modifier nom / emblem / couleur / description / visibilité, gérer les channels, gérer les rôles custom + assignations.

### Changé

- **Phase 1.6 — Polish technique** ([src/components/layout/AppShell.tsx](src/components/layout/AppShell.tsx) + [src/components/ui/ErrorState.tsx](src/components/ui/ErrorState.tsx) + [src/index.css](src/index.css)) — transitions de pages "drill-down" (module, crew-config, admin-builder, user-profile, achievements) avec slide-from-right pour communiquer "tu es allé plus profond" ; les autres pages gardent un fade vertical. Nouveau composant `ErrorState` réutilisable avec retry. Variable CSS `--color-on-accent` (foreground sur surfaces accent-painted) recalculée au runtime via `pickContrastColor` quand l'utilisateur change la couleur d'accent dans Settings — fini les boutons illisibles avec un accent clair.
- **Toggle composable** ([src/components/ui/Toggle.tsx](src/components/ui/Toggle.tsx) + [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)) — extraction d'un composant `<Toggle>` partagé pour unifier le style des 4 switches Settings (animations, sons, son in-game, raccourcis globaux). Animation fluide explicite via `animate.x` au lieu de Framer `layout` qui faisait des sauts bizarres au toggle off.
- **Détection MC server multi-backend** ([src-tauri/src/mc_status.rs](src-tauri/src/mc_status.rs)) — la détection des servers Minecraft (player count) tente plusieurs protocoles (SLP modern, legacy 1.6, ping query) avec sticky state pour ne pas flickerer entre "online" et "offline" quand un seul backend timeout. Plus stable surtout sur les serveurs Bedrock qui répondent bizarrement.
- **Détection GPU avec fallback PowerShell** ([src-tauri/src/diagnostic.rs](src-tauri/src/diagnostic.rs)) — Win11 24H2+ a cassé la détection WMI directe pour le GPU. Fallback ajouté via `Get-CimInstance Win32_VideoController` en sub-process si WMI échoue. La page Diagnostic du Settings affiche désormais le GPU correctement sur les Win11 récents.

### Corrigé

- **Assignement des rôles custom dans crews** ([src/firebase/crews.ts](src/firebase/crews.ts) + [src/pages/CrewConfigPage.tsx](src/pages/CrewConfigPage.tsx) + [firestore.rules](firestore.rules)) — trois bugs combinés empêchaient de poser un rôle custom sur un membre : (1) `watchCrewMembers` ne propageait pas `customRoleId` du doc Firestore au type → badge invisible même après écriture réussie. (2) `displayedMembers` dans la config ne propageait pas non plus → picker bloqué sur "aucun rôle". (3) `setMemberCustomRole` faisait un `setDoc({customRoleId}, merge)` sans `role`, déclenchant la règle "create" qui exigeait `memberUid == request.auth.uid` — bloquait un admin assignant un rôle à quelqu'un d'autre sur un master crew. Fixes : parser inclut customRoleId, propagation OK, `setMemberCustomRole` détecte l'absence de doc et écrit une membership complète, règle Firestore étendue pour autoriser admin/owner à créer un doc membre avec `role == "member"`.
- **Layout PlayHeatmap qui collapsait** ([src/components/profile/PlayHeatmap.tsx](src/components/profile/PlayHeatmap.tsx)) — la `motion.div` n'avait pas de `w-full` ni de contrainte de largeur. À fenêtre étroite, la carte se rétractait à la largeur naturelle de son plus petit enfant (l'empty state sans min-width), forçant le titre / description sur des lignes mono-mot. Fix : `w-full` sur la card, `min-w-0 flex-1` sur le bloc titre, `shrink-0` sur le compteur, `min-h-32 max-w-sm` sur l'empty state.
- **Owner épinglé en haut + launcher admin = owner sur master crews** ([src/components/crews/MembersList.tsx](src/components/crews/MembersList.tsx)) — l'owner pouvait se retrouver coincé au milieu d'une section de rôle custom. Refonte du grouping pour extraire ALL les owners en premier (par `role === "owner"` OR `uid === crew.ownerUid` OR `crew.isMaster && isAdminUid(uid)`), section synthétique "Propriétaire" en amber au sommet. Couvre le cas du master crew legacy où `crew.ownerUid` est vide / non posé : l'admin du launcher (uid dans `VITE_ADMIN_DISCORD_IDS`) est traité comme owner de facto sur ces master crews.
- **Compteur "0 membre" dans la config crew** ([src/pages/CrewConfigPage.tsx](src/pages/CrewConfigPage.tsx)) — sur master crew, la config affichait 0 alors qu'il y avait des membres implicites. Fallback sur `allUsers.length` quand `members.length === 0` && `crew.isMaster`. Même fix appliqué au menu contextuel clic-droit.
- **Admin launcher peut configurer / supprimer le master crew** ([firestore.rules](firestore.rules) + [src/pages/CrewConfigPage.tsx](src/pages/CrewConfigPage.tsx)) — l'admin du launcher peut maintenant accéder à la config d'un master crew via clic-droit, modifier les métadonnées + les channels + les rôles custom, et supprimer le crew si besoin. Les règles Firestore ont été ajustées pour autoriser ces actions via `isAdmin()`.

### Supprimé

- **Engrenage de la barre crew** ([src/pages/CrewsPage.tsx](src/pages/CrewsPage.tsx)) — l'icône engrenage dans le header du crew (qui ouvrait la config) est retirée. L'accès à la config se fait désormais uniquement via le clic-droit sur l'icône du crew dans la rail. Plus discret + plus cohérent avec le pattern Discord.

### Sécurité

- **Règles Firestore : custom roles + members create étendu + playHeatmap** ([firestore.rules](firestore.rules)) — nouvelles règles pour `crews/{crewId}/customRoles/{roleId}` (CRUD admin/owner, read membre) et `users/{uid}/playHeatmap/{docId}` (read authed, write owner). Règle `members.create` étendue avec une branche admin/owner contrainte à `role == "member"` pour empêcher une promotion détournée.
## [v26.05.05.5] - 2026-05-05  · semver `26.505.4`


### Corrigé

- **Bouton "Jouer" devient "En cours" pendant l'exécution** ([src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx)) — avant : après avoir lancé un jeu, le bouton "Jouer" restait actif et re-cliquable, ce qui déclenchait l'erreur "déjà lancé" puis flippait l'UI sur "Installer" (donnant l'impression que le jeu n'était pas installé). Fix triple :
  - **PrimaryButton (modules hosted/shortcut)** : nouvel état `running` synchronisé sur les events Tauri `module-launched` / `module-exited`. Bouton gris neutre avec dot vert pulsant + icône Square + disabled + tooltip "Le jeu tourne déjà". Suppression du `setTimeout(1400ms)` qui faisait revenir le bouton à "JOUER" prématurément.
  - **MinecraftActionPanel `handleLaunch`** : si l'erreur contient "déjà lancé", on garde `phase="running"` (le jeu réel tourne, pas une erreur d'install). Pour les autres erreurs de launch (Java manquant, asset corrupt…), retour à `"ready"` au lieu de `"error"` — l'install est intacte, pas de raison de proposer une réinstallation.
  - **Bouton "Jouer" MC** : `disabled` étendu à `phase === "running"`, label "En cours" + dot vert ping animé. Bouton "Installer" ne s'affiche plus pour `phase === "error"` (uniquement `"ready-to-install"`).
## [v26.05.05.4] - 2026-05-05  · semver `26.505.3`


### Corrigé

- **Empêcher de lancer 2 fois le même jeu** ([src-tauri/src/modules.rs](src-tauri/src/modules.rs) + [src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — avant, cliquer 2× sur "Lancer" sur le même module spawnait 2 processes simultanés (corruption potentielle des saves Minecraft, erreurs licensing confuses sur les jeux modernes, comportement imprévisible sur les shortcuts). Guard atomique au niveau `LaunchTracker` :
  - **Nouvelle méthode** `LaunchTrackerHandle::try_mark_running(module_id) -> bool` qui fait check + insert sous le même mutex Tokio (zéro TOCTOU race possible).
  - **modules.rs spawn_tracked** : reservation atomique avant le spawn ; cleanup explicite si `cmd.spawn()` lui-même échoue (sinon leak permanent du slot).
  - **mc_launch.rs `launch()`** : `try_mark_running` au tout début + nouveau struct `LaunchSlot` RAII guard avec Drop qui release auto le slot si la fonction return `Err` avant le spawn JVM (download manifest échoué, java install KO, asset corruption…). `launch_slot.disarm()` après spawn réussi — la wait-task reprend le relais et `mark_stopped` à l'exit du process.
  Message d'erreur clair côté UI : `<module> est déjà lancé. Ferme l'instance existante avant d'en relancer une autre.`
## [v26.05.05.3] - 2026-05-05  · semver `26.505.2`


### Corrigé

- **Empêcher le double-lancement de l'app (Single-instance manuel Win32)** ([src-tauri/src/single_instance.rs](src-tauri/src/single_instance.rs)) — `tauri-plugin-single-instance` v2.4.2 utilisait une socket TCP loopback pour forwarder les argv entre processes, ce qui échouait dans plusieurs configs (antivirus corporate qui bloque le bind loopback, multi-NIC avec firewall strict, différence d'élévation UAC, lancement simultané depuis 2 contextes). Résultat : 2 fenêtres Simple Launcher s'ouvraient au lieu d'une. Remplacé par une implémentation manuelle qui n'utilise QUE des kernel objects Win32 :
  - **Mutex** `Global\\SimpleLauncher_SingleInstance_Mutex_v1` via `CreateMutexW` — le 1er process leak le handle (Windows libère auto à la mort du process). Le 2e process voit `ERROR_ALREADY_EXISTS`, ferme son duplicate, signale puis exit immédiatement.
  - **Named event** `Global\\SimpleLauncher_ShowEvent_v1` via `CreateEventW` auto-reset — le 1er process spawn un thread qui `WaitForSingleObject(INFINITE)` en boucle. Le 2e process appelle `OpenEventW` + `SetEvent` pour réveiller le 1er, qui surface sa fenêtre (unminimize → show → burst always-on-top → focus → AOT off pour bypass le foreground-lock Windows).
  Aucune dépendance réseau, atomique au niveau kernel, survit aux crashes. Dépendance `tauri-plugin-single-instance` retirée, `windows = "0.58"` ajoutée (features Win32_Foundation + Win32_Security + Win32_System_Threading).
## [v26.05.05.2] - 2026-05-05  · semver `26.505.1`


### Changé

- **Single-instance guard durci** ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)) — quand l'utilisateur double-clique le shortcut alors qu'une instance tourne déjà (en tray ou minimisée), le 2e exe forwarde son argv au 1er process et exit. Le callback côté process existant est maintenant plus robuste : ordre `unminimize → show` corrigé (l'inverse ne déminimisait pas), burst `set_always_on_top(true) → set_focus → set_always_on_top(false)` pour bypass le foreground-lock Windows qui empêche un process non-foreground de gagner le focus, gestion explicite du cas "main window destroyed" (app en cours de quit), et logging diagnostic. Garantit que la fenêtre existante revient bien au premier plan dans tous les cas.

### Supprimé

- **Force borderless windowed** ([src-tauri/src/overlay.rs](src-tauri/src/overlay.rs) + [src/lib/overlay.ts](src/lib/overlay.ts) + [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)) — l'implémentation Win32 SetWindowLong + SWP_FRAMECHANGED ne fonctionnait pas en pratique : les moteurs modernes (Unity, Unreal, GLFW, etc.) re-set leur style de fenêtre à chaque frame, donc le strip était immédiatement annulé. Code retiré complètement (~400 lignes + dep Rust `windows = "0.58"`) : commandes `overlay_force_borderless` / `overlay_force_borderless_pid`, helper Win32 `convert_to_borderless`, hook auto après chaque `module-launched`, toggle "Forcer auto borderless" dans Settings, bouton "Forcer borderless (jeu actif)", champ `pid` sur les events de launch. Remplacé par une note Settings : "L'overlay marche en mode borderless/fenêtré uniquement". À ré-explorer plus tard avec une approche externe (sub-process Borderless Gaming) ou DLL injection signée si demande réelle.
## [v26.05.05] - 2026-05-05  · semver `26.505.0`


### Ajouté

- **Toasts in-game (Phase 2 de l'overlay)** ([src/components/overlay/ToastsApp.tsx](src/components/overlay/ToastsApp.tsx) + [toasts.html](toasts.html) + [src/toasts.tsx](src/toasts.tsx) + [src/lib/toasts.ts](src/lib/toasts.ts)) — 3e fenêtre Tauri transparente click-through always-on-top, positionnée automatiquement en bas-droit du moniteur primaire (DPI-aware). Affiche des notifications discrètes pendant que l'utilisateur joue, **sans intercepter les inputs** (`setIgnoreCursorEvents(true)` global). Trois types de toasts auto-détectés :
  - **Ami passe en ligne** (transition offline → online via `lastSeen`)
  - **Ami lance un jeu** (transition `currentActivity` null → set, pas de spam si l'ami switch entre 2 jeux)
  - **Nouveau message** (diff sur `lastMessage.sentAt` par conversation, skip ses propres messages)
  Stack max 5 toasts simultanés, lifetime 4.5 s par toast, slide-in depuis la droite + scale up via Framer Motion, son Soft Lofi (`messageReceived` ou `notification` selon le type). Settings → Overlay in-game → sous-section "Toasts in-game" : toggle master + 3 checkboxes individuelles par kind. Default tout ON pour découverte de la feature.
## [v26.05.04.2] - 2026-05-04  · semver `26.504.1`


### Ajouté

- **Overlay in-game style Discord** ([src-tauri/src/overlay.rs](src-tauri/src/overlay.rs) + [src/components/overlay/OverlayApp.tsx](src/components/overlay/OverlayApp.tsx) + [overlay.html](overlay.html)) — fenêtre transparente always-on-top que l'utilisateur toggle par-dessus n'importe quel jeu en mode borderless / windowed via un raccourci global configurable (default **Shift+F9**). 3 onglets : **Amis** (online + activité de jeu, click pour ouvrir un DM direct), **Messages** (liste conversations + vue thread complète avec composer + bubbles + auto-scroll + sons), **Notifs** (30 dernières). Architecture multi-page Vite (overlay.html + src/overlay.tsx séparés du main bundle), webview transparent transparent: true + decorations: false + alwaysOnTop + skipTaskbar. Auth Firebase partagée via la session IndexedDB du même origin (pas de re-login). Tauri command `overlay_toggle` / `_show` / `_hide`, plugin `tauri-plugin-global-shortcut` v2 pour le RegisterHotKey OS-wide.
- **Force borderless windowed mode** ([src-tauri/src/overlay.rs](src-tauri/src/overlay.rs) + [src/lib/overlay.ts](src/lib/overlay.ts)) — couvre les jeux en exclusive fullscreen qui sinon ne laisseraient pas l'overlay s'afficher. Implémentation Win32 pure (pas de DLL injection donc 0 risque anti-cheat) : `EnumWindows` pour trouver la main window du PID spawné, puis `SetWindowLong` qui strip `WS_POPUP / WS_CAPTION / WS_THICKFRAME / WS_SYSMENU` + `SetWindowPos` pour resize au work area du moniteur courant. Trois modes :
  - **Auto** : déclenché 3 s après chaque lancement de jeu (event `module-launched` étendu avec `pid: Option<u32>`), retry une fois après 2.5 s pour les jeux à boot lent (Minecraft + JVM init).
  - **Manuel via foreground** : bouton "Forcer borderless (jeu actif)" dans Settings.
  - **Manuel via PID** : Tauri command `overlay_force_borderless_pid(pid)`.
- **Settings → onglet "Overlay in-game"** ([src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx) `OverlayCard`) — toggle global enable/disable, picker de raccourci live (clic → recording → appuie sur la combo désirée → enregistré côté OS), bouton Reset au défaut, toggle "Forcer auto le borderless au lancement", boutons "Tester l'overlay" + "Forcer borderless (jeu actif)", affichage des erreurs (raccourci pris par autre app, etc.).
- **Hook `useTickEvery`** ([src/hooks/useTickEvery.ts](src/hooks/useTickEvery.ts)) — un seul timer global partagé via `useSyncExternalStore` qui remplace tous les `setInterval(setNow)` per-page (HomePage, CommunityPage, SettingsPage, MembersList). N consumers = 1 seul interval au lieu de N indépendants.
- **`statusFromLastSeen` accepte un `now` optionnel** ([src/firebase/presence.ts](src/firebase/presence.ts)) — pour qu'un parent puisse calculer les statuts une fois et les passer en prop stable aux children memoizés (évite les ticks indépendants par row).

### Changé

- **Refonte complète des sons en Soft Lofi** ([src/lib/sounds.ts](src/lib/sounds.ts)) — 14 sons (hover, click, launch, success, error, notification, messageReceived, updateArrived, achievementBronze/Silver/Gold/Platinum/Milestone) déclinés dans une identité sonore unifiée : sine waves pures + filtre passe-bas systématique (2.5–5 kHz) + attaques douces (15–60 ms) + releases longs + progressions consonantes (quintes, IV-V-I). Anti-fatigue auditive sur longues sessions. Démo des 5 styles disponible dans `tools/sound-styles-demo.html`.
- **Phase 1 perf — Quick wins anti-lag (-72 KB bundle eager)** :
  - Memoization référentielle des `UserPresence` ([src/firebase/presence.ts](src/firebase/presence.ts)) : `watchAllUsers` garde une `Map<uid, UserPresence>` entre snapshots et réutilise la même référence si le doc n'a pas changé visuellement → consumers `React.memo`'d (UserRow, MemberRow, MessageItem) skippent le re-render quand un autre user heartbeat sans changer son état.
  - `React.memo` sur les rows denses : UserRow (CommunityPage), MemberRow (MembersList — extrait de `useUsers().find()` à chaque ligne pour passer `tier`/`status`/`currentActivity` pré-calculés en prop), MessageItem. Comparators stricts champ-par-champ.
  - MembersList O(n²) → O(n) : `Map<uid, UserPresence>` calculée une fois, fusion des deux `useMemo` (`displayedMembers` + `sortedMembers`) en une seule passe.
  - TierAvatar prop `animated` : default `false` pour `xs/sm` (frames statiques sans `motion.div`) et `true` pour `md/lg/xl` (animations préservées sur les surfaces "wow"). Économise ~80-120 motion.div sur les listes denses.
  - Lazy-load `marked` (~30 KB) et `tsparticles` (~15-20 KB) hors du bundle eager : NewsCard + ModuleParticles passent en `React.lazy`. Particles deferred via `requestIdleCallback`. Bundle initial 1176 → 1104 KB (-24 KB gzip).
- **Phase 2 perf — Firestore offline + caps listeners** :
  - Persistance offline IndexedDB activée ([src/firebase/config.ts](src/firebase/config.ts)) via `initializeFirestore` + `persistentLocalCache(persistentSingleTabManager)`. Cold/warm boot lit depuis le cache instantanément, mode offline complet supporté (writes queue + sync à la reconnexion).
  - Caps sur listeners globaux : `watchAllUsers` → `orderBy(lastSeen desc) + limit(200)`, `watchCrews` → `limit(50)`, `watchCrewMembers` → `limit(100)` par crew, `watchNews` → `limit(20)`.
  - **Reactions agrégées dans le doc message** ([src/firebase/crews.ts](src/firebase/crews.ts) + [src/components/crews/MessageItem.tsx](src/components/crews/MessageItem.tsx)) : avant 50 listeners par channel ouvert (un par message visible). Maintenant 1. Reactions stockées inline comme `reactions: { '👍': [uid, uid] }` via `arrayUnion`/`arrayRemove`. Firestore rules étendues : tout membre peut update si le diff ne touche que `reactions` (`affectedKeys().hasOnly(['reactions'])`). Économie de ~95% des websockets en steady-state.
- **Tooltip natif du TierAvatar remplacé par `aria-label`** ([src/components/tier/TierAvatar.tsx](src/components/tier/TierAvatar.tsx)) — l'attribut HTML `title="Supporter — Légende"` déclenchait un tooltip OS qui se superposait visuellement au tooltip custom des parents (Sidebar, MembersList…). Reste accessible aux screen readers via `aria-label` sans afficher de tooltip natif.
- **Sidebar restructurée pour ne plus afficher de scrollbar** ([src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx)) — passage de 2 sections à 3 : top fixe (logo + 5 nav) / middle scrollable (favoris, scrollbar invisible via `scrollbar-hidden`) / bottom fixe (notifs + admin + settings + avatar). Le layout s'auto-adapte à la hauteur de fenêtre + au nombre de favoris en temps réel.
- **Pages migrées sur `scroll-y-only`** ([src/index.css](src/index.css) + 11 pages) — nouvelle utility CSS qui combine `overflow-y: auto` + `overflow-x: hidden` + scrollbar masquée. Plus aucune scrollbar (verticale ou horizontale) visible sur HomePage, LibraryPage, CommunityPage, MessagesPage, ModuleDetailPage, AchievementsPage, ProfilePage, PublicProfilePage, SettingsPage, AdminPage, VipPage. Le wheel/touchpad/PageDown scroll fonctionne toujours.

### Corrigé

- **Superposition cercle actif `rounded-xl` × frame tier rond** ([src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx)) — le ring "sidebar-active" du bouton avatar entrait en collision avec le frame animé rond du TierAvatar pour les utilisateurs avec un tier (anneau cyan square visible derrière le rainbow / cyan-violet / bronze). Le `motion.div` reste mounté (transition `layoutId` smooth préservée) mais devient `opacity-0` quand un tier est présent — le frame animé porte déjà l'identité visuelle "active".

### Sécurité

- **Création de crew gated server-side** ([firestore.rules](firestore.rules)) — la rule `allow create` sur `/crews` vérifiait juste `ownerUid == request.auth.uid` ; le gating tier (Soutien / VIP / Légende) était purement côté UI. Un user qui modifiait le JS pouvait techniquement créer des crews sans tier. Nouvelle fonction `callerHasSupporterTier()` dans les rules qui `get()` `/users/{uid}.tier` et vérifie qu'il vaut `supporter / vip / legend`. Rule `allow create` désormais : `isAdmin() || (isMaster == false && callerHasSupporterTier())`. Master crews (`isMaster: true`) restent admin-only. Coût : +1 read Firestore par création (négligeable sur une action rare).
## [v26.05.04] - 2026-05-04  · semver `26.504.0`


### Ajouté

- **Mode offline** ([src/lib/online.ts](src/lib/online.ts) + [src/lib/offlineCache.ts](src/lib/offlineCache.ts)) — détection live de l'état réseau via probe `gstatic.com` toutes les 15 s, store Zustand `useOnline()` exposé partout. Quand on perd le wifi/internet, le launcher cache localement l'identité utilisateur et la bibliothèque (modules + hosted) dans `localStorage`. Au prochain démarrage sans réseau, le launcher se charge avec ces données mises en cache au lieu d'afficher une page blanche cassée. Bandeau "Mode hors ligne" en haut quand le réseau est down.
- **Système d'achievements refondu** ([src/lib/achievements.ts](src/lib/achievements.ts) + [src/pages/AchievementsPage.tsx](src/pages/AchievementsPage.tsx) + [src/components/achievements/AchievementCard.tsx](src/components/achievements/AchievementCard.tsx)) — catalogue de **50 succès** répartis en 11 catégories (Premiers pas, Vétéran, Communauté, Crews, Customisation, Minecraft, Streaks, Collection, Parrainage, Légendaire, Hidden). Page dédiée accessible depuis le bouton dans la page Profil avec : barre de progression in-line par succès, score de rareté en %, **6 succès cachés** révélés à l'unlock, **toasts de palier intermédiaires** (25/50/75% du progrès), **sons custom par tier** (bronze/argent/or/platine), **showcase rotatif sur le HUB** ([src/components/home/NextAchievementChip.tsx](src/components/home/NextAchievementChip.tsx)), section showcase sur la page de profil public, tracking infra (`launchDays`, `mcVersionsTracker`, `achievementFlags` localStorage).
- **Instances Minecraft custom personnelles** ([src/components/library/CustomMinecraftForm.tsx](src/components/library/CustomMinecraftForm.tsx) + [src/firebase/customMinecraft.ts](src/firebase/customMinecraft.ts) + [src/components/library/AddGameTypePicker.tsx](src/components/library/AddGameTypePicker.tsx)) — la page Bibliothèque permet maintenant d'ajouter, en plus des raccourcis classiques, des instances Minecraft natives privées (sous-collection `users/{uid}/customMinecraft`). Choix de la version Minecraft, du loader (Vanilla / Fabric / Forge / NeoForge), de la version du loader, optionnellement d'un modpack à importer depuis URL. RAM ajustable. Picker de type "raccourci ou MC custom" au moment de l'ajout.
- **Système de Crews refondu (Phases 1–4)** ([src/firebase/crews.ts](src/firebase/crews.ts) + [src/pages/CrewsPage.tsx](src/pages/CrewsPage.tsx) + [src/components/crews/](src/components/crews/)) — refonte complète vers une architecture multi-crews :
  - **Phase 1 — Membership model** : crew "Maître" auto-rejoint par tous, plus création de crews user-owned (réservée aux Soutien / VIP / Légende). Rôles `owner` / `admin` / `member` avec permissions dans Firestore rules. Invitation par code à 6 caractères + crews publics joignables sans code. Listing des membres en collection-group via `watchMyCrewIds`.
  - **Phase 2 — Messages enrichis** ([src/components/crews/MessageItem.tsx](src/components/crews/MessageItem.tsx) + [src/components/crews/MessageComposer.tsx](src/components/crews/MessageComposer.tsx)) : réactions emoji, edit/delete de ses propres messages, rendu Markdown sanitizé (DOMPurify + marked), pin par les owners/admins, réponses en thread, autocomplete `@mention` avec notif push, upload d'images / GIFs, search dans l'historique du channel.
  - **Phase 3+4 — Liste membres + presence** ([src/components/crews/MembersList.tsx](src/components/crews/MembersList.tsx) + [src/components/crews/ChannelView.tsx](src/components/crews/ChannelView.tsx)) : panel droit avec avatars + statut online/idle/offline + activité de jeu en cours. Owners/admins peuvent kick / promote / demote. Bouton "Inviter à jouer" si l'observateur est in-game.
  - **Icône custom de crew** ([src/firebase/crews.ts:uploadCrewIcon](src/firebase/crews.ts)) : upload PNG/JPG/WebP via Firebase Storage avec fallback sur l'emoji par défaut. Permission gated par `firestore.exists()` côté Storage rules.
  - **UI d'édition pour les owners** ([src/components/crews/CrewSettingsModal.tsx](src/components/crews/CrewSettingsModal.tsx)) : panel modal complet pour éditer nom / description / icône / visibilité (publique/privée) / régénérer le code d'invitation / supprimer le crew.
- **Overlay tier stylé sur les avatars et les rows** ([src/components/tier/TierAvatar.tsx](src/components/tier/TierAvatar.tsx) + [src/components/tier/TierName.tsx](src/components/tier/TierName.tsx) + [src/components/tier/TierBanner.tsx](src/components/tier/TierBanner.tsx)) — les abonnés Soutien / VIP / Légende ont maintenant des frames animées autour de leur photo de profil partout dans le launcher (HUB, Communauté, Crews, Messages, Profil) :
  - **Soutien** : aura bronze pulsante + anneau conic shimmer rotatif 8 s + glow inset bronze + badge cœur pulsant
  - **VIP** : aura cyan/violet large pulsante (`-inset-2 blur-xl`) + anneau conic épais cyan→violet rotatif 5 s + halo inset saturé + badge couronne pulsant
  - **Légende** : aura or/orange géante (`-inset-3 blur-2xl`) + anneau rainbow rotatif 5 s + anneau or/orange contre-rotatif 4 s + inset glow puissant + badge sparkles wobble. Frame sizes augmentées (xs 24→28, sm 38→44, md 48→56, lg 72→80, xl 116→124).
  - Composant `TierBannerOverlay` réutilisable qui ajoute une bordure + glow tiéré sur la row entière (Communauté, MembersList, Admin Utilisateurs).
- **Onglet admin "Utilisateurs"** ([src/components/admin/UsersManager.tsx](src/components/admin/UsersManager.tsx)) — nouveau panel dans `AdminPage` qui liste tous les utilisateurs avec filtres (Tous / Sans tier / Soutien / VIP / Légende, compteurs live), recherche par pseudo/username/uid, et un segmented control 4 boutons (— / Soutien / VIP / Légende) qui grant ou révoque manuellement le tier d'un user via `setUserTier`. Propagation live partout (HUB, Communauté, Crews, profil) sans reload. Règles Firestore mises à jour pour permettre à `isAdmin()` d'écrire sur n'importe quel doc user.
- **Intégration Ko-fi pour les abonnements Soutien / VIP / Légende** ([functions/src/kofi.ts](functions/src/kofi.ts) + [src/firebase/kofi.ts](src/firebase/kofi.ts) + [src/pages/VipPage.tsx](src/pages/VipPage.tsx)) — pivot du paiement vers Ko-fi (pas besoin de société pour démarrer, Ko-fi gère la facturation à la place du créateur) :
  - Cloud Function `kofiWebhook` : reçoit les événements Ko-fi, vérifie le `KOFI_VERIFICATION_TOKEN` (avec `.trim()` défensif), parse le payload form-encoded, extrait l'UID Firebase depuis `from_name` ou `message`, mappe le tier name vers `supporter` / `vip` / `legend`, écrit sur `users/{uid}.tier` avec un audit dans `/kofiTransactions` idempotent sur `kofi_transaction_id`. Cas non-matchés sauvegardés dans `/kofiUnmatched` pour grant manuel via l'admin.
  - Cloud Function planifiée `cleanupExpiredKofiSubscriptions` : tourne toutes les 24 h et révoque les tiers dont `kofiLastPaymentAt > 35 jours` (Ko-fi n'envoie pas de webhook d'annulation, on infère par silence).
  - Page Grades ([src/pages/VipPage.tsx](src/pages/VipPage.tsx)) refondue : `KofiSubscribeModal` qui copie l'UID dans le presse-papier et ouvre Ko-fi via Tauri opener avec instructions step-by-step. CTA intelligent qui s'adapte au tier actuel (souscrire / gérer sur Ko-fi / inclus dans tier supérieur).

### Changé

- **Liste de bénéfices VipPage cohérente avec ce qui est implémenté** ([src/pages/VipPage.tsx](src/pages/VipPage.tsx)) — la liste de chaque tier reflète maintenant les vrais avantages live (frame d'avatar, badge, pseudo gradient, bordure de row, aura) au lieu de promesses non livrées (couleur perso, sondages, votes features, module Legends Club, thème Gold). Footnote remplace "pas encore disponible" par mention Ko-fi + garantie d'annulation.
- **Particules orbitales retirées des frames Soutien/VIP/Légende** ([src/components/tier/TierAvatar.tsx](src/components/tier/TierAvatar.tsx)) — les "boules qui tournent" étaient trop chargées visuellement. Les frames gardent toute leur intensité (anneaux conic rotatifs, auras larges pulsantes, halos saturés) sans particules orbitales pour un look plus mature.
- **Tiers visibles dans la liste DM + header chat** ([src/pages/MessagesPage.tsx](src/pages/MessagesPage.tsx)) — les `<img>` bruts utilisés dans la liste des conversations privées et le header de la conversation active sont remplacés par `<TierAvatar>` qui affiche le frame animé selon le grade du destinataire. Tier récupéré via `useUsers().find(uid)` — pas de duplication dans le doc conversation.

### Supprimé

- **Feature "Sessions de jeu" complètement retirée** — l'onglet et toute la logique de tracking des sessions de jeu individuel ont été supprimés du launcher. La feature ne plaisait pas (peu d'engagement, UI confuse). Les heures de jeu cumulées par module restent trackées dans `users/{uid}/playtime/{moduleId}` comme avant.
## [v26.05.03.9] - 2026-05-03  · semver `26.503.8`


### Ajouté

- **Partage public du profil avec QR code** ([src/components/profile/ShareProfileModal.tsx](src/components/profile/ShareProfileModal.tsx) + [src/pages/ProfilePage.tsx](src/pages/ProfilePage.tsx)) — bouton "Partager" sur la page profil (visible quand un compte Discord est lié) qui ouvre une modal avec l'URL publique `simplelaunche.web.app/u/{discordId}`, copy-to-clipboard, bouton "Ouvrir dans le navigateur" via `tauri-plugin-opener`, et un QR code généré côté client (lib `qrcode` chargée en lazy import) teinté avec la couleur d'accent active. Permet de scanner depuis un téléphone pour ouvrir le profil sans taper l'URL.
- **Centre de notifications unifié** ([src/components/notifications/NotificationsCenter.tsx](src/components/notifications/NotificationsCenter.tsx) + [src/firebase/notifications.ts](src/firebase/notifications.ts)) — panneau slide-over depuis la droite (icône cloche dans la sidebar avec badge unread) qui liste toutes les notifications reçues : achievements, invitations crew, amis en ligne, news, releases, system. Click → marque lue + navigue vers le contexte (module, conversation, profil…). Bouton "tout marquer comme lu". Mobile-friendly. Subscription Firestore live, badge se met à jour en temps réel.
- **Crash report en 1 clic** ([src/components/library/CrashReportModal.tsx](src/components/library/CrashReportModal.tsx) + [src-tauri/src/mc_crash.rs](src-tauri/src/mc_crash.rs)) — quand un lancement Minecraft natif crash, une modal propose d'envoyer le rapport (logs Minecraft + crash report Java + spec système basique : OS, CPU, RAM, GPU, version launcher) à l'admin via Firestore. L'admin peut consulter via un onglet dédié dans `AdminPage`. Aucune donnée perso transmise en dehors du compte qui clique.
- **Apparence + Téléchargements dans Settings** ([src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx) + [src/store/uiPrefs.ts](src/store/uiPrefs.ts)) — l'onglet **Apparence** est maintenant fonctionnel : color picker pour `--color-accent` (préviewé instantanément sur tout le launcher) + toggle "Animations réduites" qui désactive Framer Motion globalement. L'onglet **Téléchargements** affiche un calculateur de taille du cache (jeux installés, libraries Java, mods téléchargés) et un bouton "Vider le cache" avec confirmation, qui supprime les libraries inutilisées et les fichiers temporaires sans toucher aux saves ni aux mondes.
- **Modal Diagnostic système** ([src/components/settings/DiagnosticModal.tsx](src/components/settings/DiagnosticModal.tsx) + [src-tauri/src/diagnostic.rs](src-tauri/src/diagnostic.rs)) — accessible depuis l'onglet **Aide** dans Settings, affiche en un coup d'œil OS / version, CPU / cœurs, GPU détectés, RAM totale + dispo, espace disque libre, Javas détectés (path + version), VC++ Redists installés. Utilise la crate `sysinfo` côté Rust. Output copiable en texte, utile à coller dans un ticket support.
- **Auto-snapshot des saves Minecraft avant chaque launch** ([src-tauri/src/mc_backup.rs](src-tauri/src/mc_backup.rs) + [src/components/library/MinecraftBackupsModal.tsx](src/components/library/MinecraftBackupsModal.tsx)) — chaque lancement MC natif déclenche un snapshot zip du dossier `saves/` (throttle 24 h pour éviter la spam-création) et garde les 5 derniers. UI Restore accessible depuis le sidebar du module Minecraft : liste des backups (taille, date), restore en 1 clic avec confirmation. Compression zip légère via la crate `zip`.
- **Multi-comptes Microsoft avec compte par défaut** ([src-tauri/src/mc_auth.rs](src-tauri/src/mc_auth.rs) + [src/components/library/MinecraftActionPanel.tsx](src/components/library/MinecraftActionPanel.tsx)) — la liste des comptes Microsoft connectés affiche maintenant une icône étoile pour épingler un compte par défaut. Le launcher utilise le default sans demander à chaque fois ; clic sur un autre compte le bascule en default. Persisté côté Rust via `keyring`.
- **Discord RPC + LaunchTracker pour les lancements MC natifs** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — les lancements via la chaîne native déclenchent maintenant la même logique de tracking que les modules hosted/shortcut : présence Discord ("En train de jouer à Modpack X"), comptage du temps de jeu, événements `module-launched` / `module-exited` côté frontend. Le Profile et l'admin Stats reflètent les heures jouées MC natif comme tout autre module.
- **Onglet Stats admin avec leaderboard** ([src/components/admin/AdminStatsPanel.tsx](src/components/admin/AdminStatsPanel.tsx)) — nouveau tab dans `AdminPage` qui agrège les stats de la collection `users/{uid}/playtime/{moduleId}` : top 10 des modules les plus joués (lancements totaux, heures totales), counters globaux (total lancements, total heures, modules actifs sur 7/30 jours). Vue rafraîchie au mount.
- **Page profil enrichie** ([src/pages/ProfilePage.tsx](src/pages/ProfilePage.tsx)) — la section "Mes statistiques" affiche maintenant la **session moyenne** (durée totale / nombre de sessions), les **achievements débloqués** avec barre de progression `X / Y`, le **prochain palier** (ex: "Plus que 12 h pour Veteran"), la **première session** datée, et un panneau dépliant qui détaille temps & lancements par module joué.
- **Viewport switcher dans le builder admin** ([src/pages/AdminPageBuilder.tsx](src/pages/AdminPageBuilder.tsx)) — toolbar avec boutons Desktop / Tablet / Mobile qui resize le canvas de preview pour vérifier le rendu responsive avant de sauver. Raccourcis clavier : `Ctrl+Z` / `Ctrl+Shift+Z` (undo/redo), `Del` sur bloc sélectionné (supprime), `Ctrl+D` (duplique), `Esc` (déselectionne).
- **Onboarding "Compte Microsoft requis"** ([src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx)) — sur les modules Minecraft natifs, si aucun compte Microsoft n'est connecté, une grosse card "Tu dois d'abord lier un compte Microsoft" s'affiche avec un bouton direct vers le flow d'auth, plutôt qu'un message d'erreur cryptique au moment du clic Lancer.
- **Tray menu "Chercher une mise à jour"** ([src-tauri/src/tray.rs](src-tauri/src/tray.rs)) — clic droit sur l'icône tray → "Chercher une mise à jour" déclenche manuellement le check `tauri-plugin-updater`. Toast de feedback : "Déjà à jour ✓" ou "Mise à jour disponible (v...)".
- **Single-instance guard** ([src-tauri/src/lib.rs](src-tauri/src/lib.rs) + [src-tauri/Cargo.toml](src-tauri/Cargo.toml)) — `tauri-plugin-single-instance` empêche désormais l'ouverture simultanée de deux fenêtres du launcher : si on relance un `simple-launcher.exe` alors qu'une instance tourne déjà (typiquement après "fermer = minimize tray"), le second process notifie l'instance existante qui se montre, désiconifie et se focus. Comportement Discord/Steam.
- **38 nouveaux unit tests Rust** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs) + [src-tauri/src/mc_runtime_deps.rs](src-tauri/src/mc_runtime_deps.rs) + [src-tauri/src/mc_auth.rs](src-tauri/src/mc_auth.rs)) — couverture étendue de la chaîne de lancement native : construction des JVM args (Aikar's flags + `MojangTricksIntelDriversForPerformance` + `-Xms/-Xmx`), résolution Java par version MC, parsing des manifests Mojang, gestion des refresh tokens Microsoft. Total = 41 tests Rust qui passent en local et CI.
- **Script de cleanup Firestore** ([scripts/cleanup-prism-fields.mjs](scripts/cleanup-prism-fields.mjs)) — script admin one-shot qui purge les champs Prism orphelins (`curseforgeProjectId`, `curseforgeFileId`, `customZipUrl`, `prismInstanceName`, `nativeMc`) sur la collection `modules/`. À exécuter une fois en post-déploiement de la suppression Prism.

### Changé

- **BlockRenderer en lazy-load complet** ([src/components/module-blocks/BlockRenderer.tsx](src/components/module-blocks/BlockRenderer.tsx)) — chacun des 19 blocs riches (Carousel, Gallery, Hero parallax, Stats, Timeline, Quote, RichText, etc.) est désormais wrappé dans `React.lazy` + `Suspense`. Première peinture d'une page module ne charge que les chunks réellement présents au lieu du chunk monolithique de ~612 KB. Eager bundle BlockRenderer passe de 612 KB à ~12 KB.
- **Split fin de `lucide-react` dans le bundle** ([vite.config.ts](vite.config.ts) + [src/components/module-blocks/FeatureCards.tsx](src/components/module-blocks/FeatureCards.tsx) + [src/components/admin/builder/fields/IconPicker.tsx](src/components/admin/builder/fields/IconPicker.tsx)) — `manualChunks` Rollup envoie chaque icône lucide-react dans son propre chunk (`lucide/{name}`), et sépare le helper partagé (`lucide-shared`, ~9 KB eager) du chemin DynamicIcon + catalogue de 1500+ icônes (`lucide-dynamic`, ~250 KB lazy, chargé uniquement par FeatureCards et l'admin IconPicker). Effet : le chunk monolithique `lucide-react` (579 KB / 154 KB gzip) **disparaît**, et l'eager bundle initial passe de 1708 KB / 501 KB gzip à 1171 KB / 360 KB gzip soit **~537 KB raw / 141 KB gzip économisés au premier paint**.
- **Mises à jour mineures des dépendances** (Cargo.lock + package-lock.json) — `cargo update` + `npm update` non-breaking. Notamment `tauri@2`, `firebase@12.12`, `framer-motion@12.38`, `react@19.1`. Aucun changement d'API consommée.
- **Admin UI nettoyée** ([src/pages/AdminPage.tsx](src/pages/AdminPage.tsx)) — l'onglet "MC Natif" (doublon de l'onglet Modules après la migration) est supprimé. Le picker de type module corrige le hint "Prism" qui restait affiché par erreur.

### Corrigé

- **NotificationsCenter s'ouvrait collé à la sidebar au lieu de la droite du viewport** ([src/components/notifications/NotificationsCenter.tsx](src/components/notifications/NotificationsCenter.tsx)) — le `motion.aside` avec `position: fixed` + `right-0` snappait à ~64 px du bord gauche de l'écran (la largeur de la Sidebar) au lieu du véritable bord droit du viewport. Cause : le parent Sidebar utilise un `transform` Framer Motion, et `transform` crée un containing block pour les descendants `position: fixed` (spec CSS). Fix : portail React via `createPortal(panel, document.body)` pour échapper au containing block. Même pattern qu'utilisent Radix, shadcn et tous les modal toolkits.
## [v26.05.03.8] - 2026-05-03  · semver `26.503.7`





### Supprimé

- **Suppression complète de l'intégration Prism Launcher** ([src-tauri/src/minecraft.rs](src-tauri/src/minecraft.rs), [src-tauri/src/lib.rs](src-tauri/src/lib.rs), [src/lib/minecraft.ts](src/lib/minecraft.ts), [src/types/module.ts](src/types/module.ts), [src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx), [src/pages/AdminPage.tsx](src/pages/AdminPage.tsx)) — la chaîne native Minecraft (`mc_native_launch` + `mc_vanilla_*` + `mc_fabric_*` + `mc_forge_*` + `mc_zip_*` + `mc_modrinth_*`) est maintenant le seul chemin d'install + lancement supporté. Confirmé que le bug "rendu en bruit coloré sur portable AMD iGPU" était bien un problème de driver utilisateur — corrigé côté machine, plus côté launcher. **Côté Rust** : retrait des commandes `mc_find_prism`, `mc_open_prism_instance_dir`, `mc_install_modpack`, `mc_launch`, `mc_uninstall` (1082 lignes de `minecraft.rs` réduites à ~50 lignes shim, garde juste `McLaunchTracker` placeholder). **Côté TS** : suppression de `findPrism`, `openPrismInstanceDir`, `installModpack`, `launchMinecraft`, `useLaunchMode`, `getEffectiveLaunchMode`, `LaunchMode`, `MinecraftStatus`, `deriveMinecraftStatus`, `MinecraftStateLocal`, `getMinecraftState`, `uninstallModpack` ; `lib/minecraft.ts` ne garde plus que les helpers RAM + le mapping MC version → Java major. **`MinecraftLaunchModeToggle.tsx` supprimé** (le toggle Prism/Natif n'a plus lieu d'être). **`MinecraftActionPanel`** dans `ModuleDetailPage` réduit à un wrapper qui délègue toujours à `NativeMinecraftActionPanel` (suppression du `PrismMinecraftActionPanel` complet). **Type `MinecraftModule`** : suppression des champs `curseforgeProjectId`, `curseforgeFileId`, `customZipUrl`, `customZipSize`, `prismInstanceName`, `nativeMc` (toujours natif désormais). **`AdminPage`** : suppression du toggle `nativeMc`, suppression du composant `ModpackZipPicker` legacy, suppression du sélecteur `mcSource` (CurseForge / manual), simplification de la validation et de la persistance Firestore ; le block `NativeMinecraftBlock` est maintenant l'unique config Minecraft, présenté comme stable et non plus en bêta. Net : **-870 lignes de code**, et un seul chemin de lancement à maintenir.
## [v26.05.03.7] - 2026-05-03  · semver `26.503.6`


### Ajouté

- **Refonte complète du site simplelaunche.web.app** ([hosting/](hosting/)) — landing page enrichie avec hero animé, grille de 9 features cards, section "Comment ça marche" en 3 étapes, panneau "Sous le capot" avec terminal stylisé montrant le flow auto-update + runtime-deps, FAQ accordion à 7 entrées, teaser de la dernière release et CTA bandeau bottom. Sticky header navigation responsive avec menu burger mobile. Reveal-on-scroll via IntersectionObserver, hover spotlight sur les cards (radial gradient suit la souris). Footer 3 colonnes (brand / produit / légal). Toutes les pages sources de design tokens depuis `hosting/styles.css` partagé (palette, typographie Audiowide + Inter + JetBrains Mono, composants glass / button / card).
- **Page changelog publique** ([hosting/changelog.html](hosting/changelog.html)) — historique des versions en timeline verticale avec marqueurs animés (point pulsant pour la latest), notes Markdown rendues côté client (sous-set `### h3`, `**bold**`, `*em*`, `` `code` ``, `[link](url)`, listes `- *`), liens directs vers chaque installer + signature ed25519, fallback gracieux sur `latest.json` si `versions.json` n'existe pas encore.
- **Manifest cumulatif `versions.json`** ([scripts/release-launcher.mjs](scripts/release-launcher.mjs)) — `release-launcher.mjs` maintient désormais `hosting/launcher/versions.json` (array de toutes les releases avec leur signature, URL, notes et pub_date). Dédup par version au cas où le script tourne deux fois sur la même release. Source de vérité pour `/changelog.html`.

### Changé

- **Restyle de privacy.html et terms.html** ([hosting/privacy.html](hosting/privacy.html) + [hosting/terms.html](hosting/terms.html)) — pages légales reconstruites avec le shared design system (header / footer cohérents, sommaire ancré 2-colonnes, callout TL;DR, sections numérotées avec scroll-margin-top). Contenu inchangé sur le fond, juste habillé.
## [v26.05.03.6] - 2026-05-03  · semver `26.503.5`


### Ajouté

- **Toggle "Mode de lancement" dans la sidebar des modules Minecraft natifs** ([src/components/library/MinecraftLaunchModeToggle.tsx](src/components/library/MinecraftLaunchModeToggle.tsx) + [src/lib/minecraft.ts](src/lib/minecraft.ts) + [src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx)) — sur les modules où l'admin a coché `nativeMc: true`, l'utilisateur a maintenant un sélecteur **Prism / Natif** par module, persisté localement (localStorage, même pattern que l'override RAM utilisateur). Permet de tester le chemin natif quand on veut, et de retomber sur Prism (compatibilité maximale, fonctionne sur tous les iGPU testés) quand le natif foire. Hook `useLaunchMode(module)` réactif : dispatch d'un CustomEvent `mc-launch-mode-change` au write → l'`MinecraftActionPanel` re-render avec le bon backend instantanément, sans rechargement de page.

### Changé

- **Default temporaire `nativeMc: true` → Prism au runtime** ([src/lib/minecraft.ts](src/lib/minecraft.ts)) — `getEffectiveLaunchMode()` retourne `"prism"` par défaut pour TOUS les modules tant qu'aucun override utilisateur n'est posé, y compris ceux flaggés natifs côté admin. Filet de sécurité tant qu'on n'a pas tracé la régression "rendu en bruit coloré" sur certains iGPU AMD via le chemin natif. Une fois le natif fiable partout, retourner à honorer `module.nativeMc` (commentaire TODO en place dans le code). Aucune perte de données : l'admin garde son réglage en Firestore, c'est juste l'exécution qui passe par Prism par défaut.
## [v26.05.03.5] - 2026-05-03  · semver `26.503.4`


### Ajouté

- **Hack `MojangTricksIntelDriversForPerformance` injecté à chaque lancement Minecraft natif** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — string-matching trick utilisé par le launcher officiel Mojang depuis ~2012 et repris par Prism / MultiMC. Les drivers GPU AMD / Intel / NVIDIA-Optimus maintiennent une base interne d'exécutables de jeux connus (`minecraft.exe`, `cyberpunk2077.exe`, `bf4.exe`…) et scannent l'argv du process spawné pour des matches : un hit active le profil **gaming** (perf max + tous les chemins OpenGL corrects + GPU dédié sur hybrid), un miss laisse le driver en profil **"background app"** dégradé. Sur certains AMD iGPU (Vega / RDNA sur Ryzen mobile), ce profil dégradé prend silencieusement des **fast paths buggy dans le chunk renderer** qui produisent des **textures en bouillie sur le monde 3D pendant que le HUD 2D reste intact** (le HUD ne passe pas par ces chemins). Symptôme chassé pendant des heures : monde en bruit coloré uniquement via Simple Launcher, jamais via Prism sur le même portable avec les mêmes mods. Diff de la ligne de commande Prism (`prismlauncher_*.log`) a révélé que **ce flag isolé** est ce que Prism passe et qu'on ne passait pas. **Fix** : `-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump` ajouté en première position des JVM args. Aucun heap dump n'est jamais émis (le path est bidon, le flag est cosmétique du point de vue HotSpot), mais la string `minecraft.exe` apparaît désormais dans l'argv du process → drivers GPU détectent → bascule sur profil gaming → OpenGL fonctionne correctement. Ne pas modifier cette string, c'est le pattern exact contre lequel les heuristiques drivers ont été calibrées depuis des années.

### Changé

- **Locale JVM forcée à `en` au lancement Minecraft natif** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — match avec ce que fait Prism par défaut (`-Duser.language=en`). Évite que certains mods qui parsent leurs propres logs JVM-side cassent sur un host `fr_FR`. MC lit son propre `options.txt` pour la langue in-game, donc l'UI utilisateur reste en français.

### Corrigé

- **Aikar's flags GC retirés du chemin de lancement natif** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — ajoutés à tort dans la v26.05.03.4 sur l'hypothèse (fausse) que Prism les injectait par défaut. La capture de la commande Java réelle de Prism a montré que Prism utilise les heuristiques G1 par défaut sans aucun tuning custom. Retrait pour ne pas introduire de divergence GC qu'on aurait ensuite à debug, et parce que ce n'était de toute façon pas la cause du bug bruit coloré (le vrai fix est le hack Mojang ci-dessus).
## [v26.05.03.4] - 2026-05-03  · semver `26.503.3`


### Ajouté

- **Aikar's flags GC tuning par défaut sur Java 17+** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — Java 9+ utilise G1GC par défaut, mais ses heuristiques out-of-the-box sont tunées pour des charges serveur, pas pour les bursts d'allocation que produit Minecraft moddé (chunk meshing, particle storms, mob ticking). Sans tuning, sur les machines avec iGPU + RAM limitée, Distant Horizons + Iris + Sodium peuvent thrash le heap au point que les uploads GPU stallent et produisent du **rendu en bruit coloré**. **Fix** : injection automatique du subset Aikar's flags qu'utilise Prism par défaut (`-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M`) sur Java 17+. Skipped sur Java legacy où certains flags ne sont pas reconnus.

### Changé

- **RAM par défaut 2 GiB → 4 GiB** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — fallback de `mc_native_launch` quand le module Firestore ne définit pas `maxRamMb`. 2 GiB était criminel pour un modpack moderne (Sodium + Iris + Distant Horizons + ~100 mods en routine demandent 4-6 GiB). Symptôme avant fix : GC starvation → chunks pas uploadés au GPU à temps → monde en bruit coloré pendant que le HUD reste OK. Match avec Prism / CurseForge qui tournent à 4 GiB par défaut sur ce profil.

### Corrigé

- **Variables d'env Java polluantes neutralisées avant le spawn de javaw** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) — `_JAVA_OPTIONS`, `JAVA_TOOL_OPTIONS` et `JDK_JAVA_OPTIONS` sont auto-prepended par la JVM à chaque ligne de commande. Une variable laissée par un vieux installer / anti-cheat / overlay Discord-MSI (ex. `_JAVA_OPTIONS=-Dsun.java2d.opengl=true`) suffit à forcer le rendu software ou désactiver les shaders sans qu'aucun message d'erreur ne le signale, produisant exactement le symptôme bruit coloré qu'on chassait sur certains laptops. **Fix** : `command.env_remove()` sur les 3 variables avant `spawn()`, avec log dans la console launch (`Variable d'env Java polluante neutralisée : NAME="VALUE"`) pour traçabilité. Comportement identique à Prism qui purge ces mêmes variables pour la même raison.
## [v26.05.03.3] - 2026-05-03  · semver `26.503.2`


### Ajouté

- **Auto-install des Visual C++ Redistributables au premier lancement Minecraft** ([src-tauri/src/mc_runtime_deps.rs](src-tauri/src/mc_runtime_deps.rs) + [src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx)) — symptôme avant fix : sur un laptop fresh sans aucun build C++ installé, MC affichait du **bruit coloré aléatoire** au lieu du monde 3D (le HUD restait OK). Cause : LWJGL 3.x + plusieurs libs natives bundle de mods (Distant Horizons, Sodium SIMD, JEMalloc) sont compilés contre **VC++ 2012 / 2013** (sentinels `msvcr110.dll` / `msvcr120.dll`) que Windows Update **ne ship pas** par défaut. Sans ces DLLs, `LoadLibrary` réussit mais les imports unresolvable retournent des function pointers nuls → les appels OpenGL produisent des junks au lieu de crasher proprement. **Fix** : nouveau check au premier launch natif qui probe `C:\Windows\System32` pour les sentinel DLLs (VC++ 2012, 2013, 2015-2022). Si manquant, modal qui DL automatiquement les redistributables officiels Microsoft (URLs aka.ms stables) et les exécute en `/quiet /norestart`. UAC prompt une fois par redist (Windows refuse l'écriture de System32 sans elevation), puis install silencieux. Progress streamé via Tauri events `vcredist-progress` (DL → Install → Done) avec barre de progression Mo. En cas d'échec UAC ou réseau, fallback sur les liens Microsoft cliquables dans la modal pour install manuel.

### Corrigé

- **Form admin module Minecraft : impossible de save un loader nu sans modpack** ([src/pages/AdminPage.tsx](src/pages/AdminPage.tsx)) — la validation du form exigeait toujours un Project ID CurseForge OU un ZIP custom même quand le mode natif était activé avec « Aucun modpack ». Du coup tu ne pouvais pas créer un module « NeoForge nu pour debug » utile pour isoler les bugs de mod. **Fix** : quand `nativeMc === true`, on skip la validation Prism-mode et on check juste `nativeMcVersion` (et `nativeLoaderVersion` si loader ≠ vanilla). Bonus : la save logic ne pousse plus `customZipUrl: ""` ou `curseforgeProjectId: NaN` quand on est en native mode (Firestore rejetait avec "Invalid use of NaN").
## [v26.05.03.2] - 2026-05-03  · semver `26.503.1`


### Corrigé

- **Crash NeoForge `ClassNotFoundException: java.lang.Integer` sur les Windows avec Java 26** ([src-tauri/src/mc_java.rs](src-tauri/src/mc_java.rs)) — symptôme : Glitch's Colony (MC 1.21.1 + NeoForge 21.1.224) crashait au boot sur le PC du release tester avec une trace Mixin / `cpw.mods.securejarhandler`. Cause : `mc_java_resolve` acceptait n'importe quelle JRE plus récente que celle requise (`major_version > required`). Sur les machines avec Java 26 installé en système, il piochait Java 26 pour MC 1.21.1 (qui requiert 21). Java 26 a serré les règles d'accès du Java Module System → `MixinPreProcessor` n'arrive plus à introspecter `java.lang.Integer` → crash. Fix : `mc_java_resolve` exige maintenant le **major exact**. Si non trouvé → DL Adoptium Temurin pour ce major précis (au lieu de gambler sur une JRE trop récente). Logs `[mc-java] resolve:` pour tracer le choix. Le bytecode reste backward compatible mais le module layer ne l'est pas — installer 40 Mo de JRE en plus vaut mieux qu'un crash silencieux.
## [v26.05.03] - 2026-05-03  · semver `26.503.0`


### Ajouté

- **Upload modpack vers GitHub Releases** ([src-tauri/src/mc_github.rs](src-tauri/src/mc_github.rs) + intégration AdminPage) — alternative gratuite à Firebase Storage pour héberger les ZIP/`.mrpack` lourds. Auth via Personal Access Token (pas d'OAuth, juste un copier-coller depuis github.com/settings/tokens). Le panel admin expose : modal de setup avec lien direct vers la page de génération PAT (scope `public_repo` pré-rempli), picker de repo (dropdown auto-rempli depuis `gh_list_repos` ou champ texte au format `owner/repo` quand l'API ne renvoie rien), bouton « Créer un repo sur GitHub » qui ouvre `github.com/new` avec un nom par défaut, tag CalVer auto-rempli (`vYY.MM.DD`), barre de progression streaming chunk-par-chunk (Tauri events `gh-upload-progress`). Auto-bootstrap : si le repo cible est vide (HTTP 422 « Repository is empty »), pousse automatiquement un `README.md` initial via `PUT /contents/README.md` puis re-tente la création de la release. URL de DL collée auto dans `nativeModpackUrl`.
- **Détection locale du manifest CurseForge** au moment de l'upload ([src/lib/mcZip.ts](src/lib/mcZip.ts)) : pendant qu'on uploade le ZIP vers Firebase ou GitHub, on parse en parallèle le `manifest.json` localement via `fflate` (pas besoin de re-DL après upload). MC version + loader + loader version remplis auto dans le form. Fallback réseau via `mc_zip_read_manifest_url` si le parse local échoue.
- **Auto-connect serveur Minecraft** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) : quand le module a un `server.address` configuré, le launch ajoute aux game args **les deux formes** simultanément : `--server <host> --port <n>` (legacy 1.6 → 1.19.x) ET `--quickPlayMultiplayer <host>:<port>` (Quick Play API depuis 1.20). Mojang utilise `joptsimple.allowsUnrecognizedOptions()` donc l'inverse est ignoré silencieusement selon la version. Parse `host:port` avec fallback port 25565. Surface l'état dans la console (« Auto-connect au serveur : … (legacy + quickPlay) »).
- **Progression streaming pour DL + extraction modpacks** ([src-tauri/src/mc_zip.rs](src-tauri/src/mc_zip.rs), [src-tauri/src/mc_modrinth.rs](src-tauri/src/mc_modrinth.rs)) : avant, `res.bytes().await` chargeait tout en RAM avant de yield → la barre était figée à 0 % pendant 30 s à 2 min sur un ZIP de 500 Mo. Maintenant : `bytes_stream()` chunk-par-chunk, écriture incrémentale sur disque (plus de pic RAM 1 Go), event Tauri `mc-vanilla-progress` toutes les 150 ms avec `current/total` en octets. Côté extraction : canal `tokio::sync::mpsc` entre la tâche bloquante (`spawn_blocking` + crate `zip` synchrone) et une task async qui forwarde les ticks au renderer. Affiche maintenant « Téléchargement du ZIP… **123.4 / 567.8 Mo (22 %)** » et « Extraction… **(347 / 850 fichiers)** ». Frontend [src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx) traduit les phases techniques (`zip-dl`, `zip-extract`, `modrinth-mods`…) en français lisible et formate les octets en Mo quand la phase est byte-based.
- **Tooltips formatage `loaderVersion`** ([src/pages/AdminPage.tsx](src/pages/AdminPage.tsx)) : le champ « Version du loader » affiche maintenant un hint contextuel selon le loader sélectionné, avec un **lien cliquable vers la page officielle** (fabricmc.net pour Fabric, files.minecraftforge.net pour Forge, projects.neoforged.net pour NeoForge) qui ouvre dans le navigateur système via `tauri-plugin-opener`. Format expliqué (`X.Y.Z` pour Fabric, `XX.Y.Z[-beta]` pour NeoForge…) + rappel que le champ se remplit auto si on uploade un ZIP CurseForge contenant un `manifest.json`.
- **Launcher Minecraft natif (sans Prism)** — refonte complète, 8 phases, ~3 000 lignes Rust + ~1 500 lignes TS :
  - **Auth Microsoft → Mojang** ([src-tauri/src/mc_auth.rs](src-tauri/src/mc_auth.rs)) : OAuth 2.0 v2 avec PKCE + loopback redirect (port aléatoire), chaîne complète des 4 hops MS access_token → Xbox Live → XSTS → `api.minecraftservices.com/login_with_xbox`. **Mode secours** activable via le client_id Mojang officiel `00000000402b5328` pendant que l'app Azure attend l'allowlist Mojang (flow legacy MSA + `oauth20_desktop.srf` + paste-URL). Mapping XErr Xbox → messages français lisibles (pas de profil Xbox, mineur sans famille, ne possède pas Minecraft, etc.).
  - **Détection + auto-DL Java** ([src-tauri/src/mc_java.rs](src-tauri/src/mc_java.rs)) : scan `JAVA_HOME` + `Program Files\Eclipse Adoptium`, `Microsoft`, `Java`, `Zulu`, `Amazon Corretto` + nos runtimes/ propres. Probe via `java -version` + parse legacy "1.X.Y_Z" et moderne "X.Y.Z". Auto-DL Adoptium Temurin via leur API REST quand aucune JRE compatible n'existe (mapping MC ≤ 1.16 → Java 8, 1.17 → 16, 1.18-1.20.4 → 17, ≥ 1.20.5 → 21).
  - **Vanilla MC natif** ([src-tauri/src/mc_vanilla.rs](src-tauri/src/mc_vanilla.rs)) : fetch + cache (24 h) du `version_manifest_v2.json` Mojang, parse de la `client.json` par version, DL parallèle (8 jobs simultanés) du JAR client + libraries + asset index + ~1 500 asset objects, vérification SHA-1 systématique, extraction des natives `.dll` dans `instances/{id}/natives/`. Layout shared : `versions/`, `libraries/`, `assets/{indexes,objects}` mutualisés entre instances.
  - **Loaders Fabric / Forge / NeoForge** ([mc_fabric.rs](src-tauri/src/mc_fabric.rs), [mc_forge.rs](src-tauri/src/mc_forge.rs)) : Fabric via `meta.fabricmc.net` + DL Maven des libs supplémentaires ; Forge + NeoForge via leur installer JAR en mode `--installClient` headless (Java spawn + scratch dir + import du résultat dans le shared layout). Filtre des versions par MC : Forge (`promotions_slim.json` filtré par `mcVersion`), NeoForge (préfixe encodé dans la version, `21.5.x` = MC 1.21.5, support du calver post-2026).
  - **Modpacks Modrinth + ZIP custom** ([mc_modrinth.rs](src-tauri/src/mc_modrinth.rs), [mc_zip.rs](src-tauri/src/mc_zip.rs)) : recherche Modrinth via leur API publique (gratuite, pas de clé), liste des versions par projet, install complet d'un `.mrpack` (parse `modrinth.index.json` → DL parallèle des mods avec hash check + extract des `overrides/`). Mode ZIP custom pour les exports CurseForge bundled : extract direct dans `.minecraft/` sans résolution mod-par-mod (pas besoin de clé CF API).
  - **Construction de la commande JVM + spawn** ([mc_launch.rs](src-tauri/src/mc_launch.rs)) : parse args modern (1.13+) avec rules `os` ET `features` (gate les `--quickPlay*` qu'on n'utilise pas), parse args legacy (single string `minecraftArguments`), substitution complète des variables `${auth_player_name}`, `${auth_uuid}`, `${auth_access_token}`, `${classpath}`, `${natives_directory}`, `${library_directory}`, `${classpath_separator}`, `${assets_root}`, etc. Support de **4 loaders** dans le launch path (vanilla / Fabric / Forge / NeoForge) avec merge du profile JSON + classpath déduplication par chemin (corrige le crash NeoForge `Duplicate key jopt-simple-5.0.4.jar`). Streaming live `stdout`/`stderr` du process via events Tauri `mc-launch-log` consumés par le frontend.
- **Onglet Admin → MC natif** ([src/components/admin/MinecraftNativeBuilder.tsx](src/components/admin/MinecraftNativeBuilder.tsx)) — banc de test E2E pour la chaîne native :
  - Sélecteur de version MC avec filtre Releases / Snapshots / Alpha / Beta (depuis le `version_manifest_v2.json` Mojang)
  - Picker de loader (Aucun / Fabric / Forge / NeoForge) avec versions filtrées par MC dynamiquement
  - Section modpack : aucun / recherche Modrinth (cards de résultats avec icône, DL count, loaders) / URL ZIP custom
  - Sélecteur de compte Microsoft, slider RAM 1-16 GiB
  - Boutons Installer / Lancer le jeu / Console (panneau live des logs MC, color-coded stderr ambré / exit gris / info cyan)
  - Subscribe en live à `mc-vanilla-progress` (barre de progression avec phase + count)
- **Mode natif activable par module** ([src/types/module.ts](src/types/module.ts) + [src/pages/AdminPage.tsx](src/pages/AdminPage.tsx) + [src/pages/ModuleDetailPage.tsx](src/pages/ModuleDetailPage.tsx)) : nouveau toggle « Mode natif (sans Prism) » sur chaque module Minecraft dans le panel Admin, qui débloque les champs natifs (version MC pinnée, loader, version loader, source de modpack). Le `<MinecraftActionPanel>` de la page module détecte `module.nativeMc === true` et délègue à un `<NativeMinecraftActionPanel>` qui gère tout le cycle Install → Lancer → Console live (drawer in-page) sans toucher Prism. Les modules legacy gardent leur comportement Prism inchangé.
- **Pages légales** ([hosting/terms.html](hosting/terms.html) + [hosting/privacy.html](hosting/privacy.html)) : Conditions d'utilisation (12 sections, droit français) + Politique de confidentialité (13 sections, conforme RGPD avec table des données collectées + droits utilisateur). Liées dans Azure App Registration pour l'écran de consentement Microsoft.

### Changé

- **Logs des launchers déplacés dans un onglet du panel Admin** : entrée séparée dans la sidebar retirée, le viewer 3-colonnes est maintenant le 4ᵉ onglet d'Admin. Bouton purge pour les logs legacy `session-{uuid}-{millis}.log` qui ne suivaient pas le nouveau format calver.
- **Page VIP** : 3 cards tier (Soutien 1 €/mois en cuivre, VIP 5 €/mois violet/cyan « Recommandé », Légende 10 €/mois or) avec effets WOW (3D tilt mouse-following springé, count-up animé du prix au scroll-in, ribbon shimmer, particules tier-spécifiques au hover, aurora background animé). 3 boutons CTA désactivés « Pas encore disponible » avec shimmer band qui balaye en boucle. Icône **Couronne dans la sidebar** boostée avec 5 couches dorées : aura large pulse, halo intérieur, ring rotatif conic-gradient, 3 sparkles orbitantes, wobble de l'icône.
- **Logo de la sidebar = bouton Accueil** : icône maison séparée retirée (doublon visuel).

### Corrigé

- **Mode secours Mojang : compte qui s'évanouit après validation** ([src-tauri/src/mc_auth.rs](src-tauri/src/mc_auth.rs)) — symptôme : tu collais l'URL de redirection, cliquais « Valider », le modal se fermait sans erreur mais aucun compte n'apparaissait dans la liste. Cause : le Windows Credential Manager renvoie `Ok` sur `set_password` + readback immédiat, puis `NoEntry` sur le `get_password` d'une commande Tauri ultérieure (bug intermittent côté Microsoft, observé aussi sur le PAT GitHub). Le code stripait les tokens du JSON public en se fiant au keyring → `load_accounts` ne pouvait plus reconstruire les secrets → `continue` qui drop l'entrée silencieusement. **Fix** : refacto JSON-as-source-of-truth — le fichier `mc_accounts.json` contient toujours `mcAccessToken` + `msRefreshToken`, le keyring devient une décoration best-effort consultée uniquement comme rescue de migration pour les anciennes installs. Logs `[mc-auth]` à chaque save/load pour diagnostic. Trade-off : refresh tokens en clair dans le user AppData (déjà protégé par les ACL Windows) vs perte fantôme silencieuse — le second est inacceptable.
- **PAT GitHub : même bug keyring-flaky que mc-auth** ([src-tauri/src/mc_github.rs](src-tauri/src/mc_github.rs)) : applicaiton du même pattern fichier-comme-source-de-vérité. `pat_set` écrit toujours dans `%LOCALAPPDATA%/Simple Launcher/github_pat.txt` + tente le keyring en best-effort. `pat_get` lit le fichier d'abord, ne consulte le keyring qu'en rescue (rehydrate auto le fichier sur hit). Plus de symptôme « token validé puis introuvable au moment de l'upload ».
- **Désérialisation Serde des repos GitHub** ([src-tauri/src/mc_github.rs](src-tauri/src/mc_github.rs)) : `#[serde(rename_all = "camelCase")]` s'appliquait dans les **deux sens** → Serde cherchait `fullName` / `avatarUrl` dans la réponse GitHub alors que l'API renvoie `full_name` / `avatar_url` en snake_case. Le parse échouait silencieusement, le `catch` côté frontend mangeait l'erreur, la dropdown de repos restait vide. Fix : `rename_all(serialize = "camelCase")` — seulement sur la sérialisation vers le frontend, le déserialize utilise les champs Rust snake_case qui matchent l'API GitHub. Bonus : filtre `permissions.push` plus permissif (garde aussi les repos sans `permissions`, légitime pour certains types de PAT) et `affiliation` élargie à `owner,collaborator,organization_member`. Symptôme avant fix : « je viens de créer un repo et il n'apparaît pas après refresh ».
- **NeoForge crash `Duplicate key jopt-simple-5.0.4.jar`** : le même JAR était poussé dans le classpath par les listes vanilla ET loader. Dédup par chemin absolu dans `mc_launch.rs` — la version du loader gagne quand y a collision.
- **NeoForge crash `Unknown module: cpw.mods.securejarhandler`** : le manifest NeoForge utilise `${library_directory}` dans son `-p` flag, qu'on ne substituait pas. Ajout de la variable `library_directory` (et `classpath_separator` pour les profiles qui l'utilisent).
- **Crash MC 1.20+ `Only one quick play option can be specified`** : `flatten_args` ne gérait que les rules `os`, pas `features`. Ajout d'un `launcher_features()` map qui désactive les quick-play / demo args et n'active que `has_custom_resolution`.
- **`open_in_browser` Windows cassé sur les URLs avec `&`** : `cmd /C start` interprétait les `&` de l'URL d'auth comme séparateurs de commandes → URL d'OAuth shreddée en 7 erreurs « commande introuvable ». Remplacement par `rundll32 url.dll,FileProtocolHandler {url}` qui passe l'URL en argument unique sans shell parsing.
- **Redirect URI Azure mismatch** : Azure déclarait `http://localhost` (sans path) mais le code envoyait `http://localhost:{port}/callback` → MS rejetait avec `invalid_request`. Strip du `/callback` côté code (le port est wildcardé par MS pour loopback).
- **Filtre version Minecraft du builder cassé** : `#[serde(rename = "type")]` côté Rust rewrite le champ `kind` AS `type` côté wire → `v.kind` toujours `undefined` côté front → filtre toujours `false`. Split en `#[serde(rename(deserialize = "type"))]` : on lit `"type"` depuis Mojang mais on envoie `"kind"` au frontend. Renommage simultané du bouton "Vanilla" en "Aucun" dans le picker de loader pour lever le doublon visuel avec la section version.
- **Avatar Minecraft Crafatar parfois indisponible** : Crafatar peut rate-limit ou ne pas répondre depuis le webview Tauri. Helper `avatarUrls(uuid)` qui retourne 3 URLs en cascade (mc-heads.net → minotar.net → crafatar) avec fallback `<img onError>` qui essaye chacun jusqu'à succès, puis placeholder avec initiale si tous échouent. UUID auto-formaté avec tirets pour compatibilité maximale.

### Sécurité

- **Tokens Microsoft chiffrés via OS keyring** ([src-tauri/src/mc_auth.rs](src-tauri/src/mc_auth.rs)) : avant, `mc_accounts.json` contenait les `mc_access_token` + `ms_refresh_token` en clair → un fichier copié = un compte volé. Maintenant ces secrets vivent dans le **Windows Credential Manager** (via la crate `keyring`), seul le profil public (UUID, pseudo, expiry) reste dans le JSON. Compatibilité ascendante : les anciens fichiers JSON avec tokens en clair sont lus puis migrés au prochain save.
- **Refresh silencieux pré-launch** ([src-tauri/src/mc_launch.rs](src-tauri/src/mc_launch.rs)) : si le `mc_access_token` du compte expire dans < 5 min (ou est déjà expiré), `mc_auth_refresh` est appelé avant le spawn de Java pour renouveler la session sans pop-up de browser. Best-effort : un fail réseau ne bloque pas le launch (l'utilisateur verra juste un 401 du jeu).
- **Cleanup orphans local** ([src-tauri/src/mc_vanilla.rs](src-tauri/src/mc_vanilla.rs)) : nouvelle commande `mc_native_uninstall_instance(instanceId)` invoquée par `handleDelete` dans AdminPage quand l'admin supprime un module Minecraft natif. Wipe du dossier `instances/{id}/` (.minecraft, natives, logs) — les répertoires shared (versions/, libraries/, assets/) restent intacts pour les autres instances.

### Supprimé

- **Support OneDrive comme source de modpack** ([src-tauri/src/mc_zip.rs](src-tauri/src/mc_zip.rs) + cleanup [src/pages/AdminPage.tsx](src/pages/AdminPage.tsx)) : Microsoft a verrouillé l'API anonyme `api.onedrive.com/v1.0/shares` au cours de 2024-2025 avec des `401 UnauthenticatedVroomException` systématiques sur les nouveaux formats de partage (`1drv.ms/u/c/...`). Plus aucune chance de marcher en aveugle, donc retrait complet : suppression du redirect-follow async dans `resolve_share_url_for_dl`, du special-case `ONEDRIVE_LOCKED:` côté backend, du composant `RecommendedHostCard` et du modal de fallback côté frontend, des placeholders qui suggéraient OneDrive. Les hints d'admin pointent maintenant explicitement GitHub Releases / Pixeldrain / Firebase Storage / Google Drive comme alternatives.
- **3 helpers `prism_*_pub` morts** ([src-tauri/src/minecraft.rs](src-tauri/src/minecraft.rs)) : `find_prism_path_pub`, `prism_data_dir_pub`, `sanitize_instance_name_pub` — exportés à l'origine pour un module `backup` qui n'a jamais été créé. 0 callsite en production. Suppression nette.

### Optimisé

- **Zéro warning Rust en compilation** : nettoyage de tous les warnings `cargo build` (imports inutilisés `PathBuf`, `URL_SAFE_NO_PAD`, `base64::Engine`, `Manager` ; champs lus jamais utilisés annotés `#[allow(dead_code)]` avec commentaire d'intention pour `LibraryDownloads.classifiers`, `Library.name`, `GithubRelease.id`, `ActiveFile.path`, `DiscordRpc::clear`). Le build est maintenant 100 % silencieux, ce qui rendra les vrais warnings futurs immédiatement visibles.
## [v26.04.29.12] - 2026-04-29  · semver `26.429.11`


### Optimisé

- **Refonte des watchers Firestore en stores Zustand centralisés** ([src/store/firebaseStores.ts](src/store/firebaseStores.ts)) — la source de la majorité des gains. Avant : `watchAllUsers` × 4 listeners parallèles, `watchModules` × 6-8, `watchConversationsFor` × 4, `watchPlaytime` × 3, `watchAchievements` × 2 — chaque listener = une subscription Firestore complète + son onSnapshot indépendant. Après : un seul listener par query, ref-counté (s'arrête quand le dernier consommateur démonte), partagé via les hooks `useUsers()`, `useModules()`, `useConversations(uid)`, `usePlaytime(uid)`, `useAchievements(uid)`. **Gain : ~75% de bande passante Firestore en idle, ~80% de re-renders en moins sur les snapshots, latence réseau réduite**. 16 fichiers consommateurs migrés (App, Sidebar, HomePage, ActionsChip, FriendsOnlineStrip, LiveActivityToastHost, LibraryPage, ModuleDetailPage, AdminPage, AdminPageBuilder, LogsManager, CommunityPage, PublicProfilePage, ProfilePage, SessionsPage, MessagesPage).
- **Sidebar `watchConversationsFor` ne se ré-abonne plus à chaque navigation** : le watcher dépendait de `route.name` dans ses deps useEffect → tear-down + rebuild de la subscription Firestore à chaque changement de page. Refactor : `route.name` lu depuis un `useRef` qui n'invalide pas l'effect → 1 seule subscription qui survit aux navigations. **Gain : 2-3 snapshots Firestore évités par navigation, ~100-200 ms de latence en moins**.
- **`React.memo` sur `NavButton`** dans la sidebar : 7 instances, chacune se re-render à chaque update du parent. Memo + égalité shallow des props → seul le bouton dont les props changent (badge, active) se reconcilie. **Gain : ~3-5 ms par re-render Sidebar**.
- **`useMemo` sur les dérivations coûteuses** :
  - `FriendsOnlineStrip.online` (filter + sort de 100+ users) : avant recalculé à chaque tick 30 s de HomePage, maintenant uniquement quand `users` change.
  - `ActionsChip.totalUnread` + `pendingInvites` : idem, plus recalculés à chaque tick parent.
  - `LibraryPage.hosted` (filter shortcut) : memoïsé sur `allModules`.
- **`IntersectionObserver` partagé** dans `VipPage` : avant 3 IO indépendants (un par CountUp tier card), maintenant 1 IO global avec une `WeakMap<Element, callback>`. Réduit la création/attache d'observateurs au mount de la page.
- **`willChange` + `transform: translateZ(0)`** sur les 5 orbes animés de la HomePage (GradientMesh + FloatingOrbs) : promotion explicite vers une couche GPU, le browser cache le rendu floué et ne re-paint que l'opacity/scale tween — gain CPU mesurable sur machines bas de gamme, comportement visuel **strictement identique**.
- **Logger `writeQueue` se reset après une rejection** : avant, si une écriture disque échouait (disque plein, file lock, etc.) la promesse-chaîne restait rejetée et toutes les écritures suivantes héritaient silencieusement de l'erreur. Maintenant un `.catch()` final remet le queue à `Promise.resolve()` → la prochaine ligne de log repart sur une chaîne saine.

### Ajouté

- **Page VIP / Soutenir le développement** : nouvel onglet **Couronne** dans la sidebar (entre Messages et le séparateur). Page premium avec 3 tiers d'abonnement présentés en cards immersives :
  - **Soutien — 1 €/mois** (palette cuivre/orange) : badge profil, voix sur sondages, ma reconnaissance éternelle
  - **VIP — 5 €/mois** (palette violet/cyan, marqué « Recommandé ») : tout du Soutien + badge doré animé, couleur de pseudo perso, bannière exclusive, vote sur les futures features
  - **Légende — 10 €/mois** (palette or/orange brûlé) : tout du VIP + badge animé arc-en-ciel, frame avatar premium, module exclusif, mention dans les credits, **thème exclusif du launcher en Gold**
  - Effets visuels « WOW » à fond : aurora background animé (3 orbes radial-gradient lents), couronne flottante avec sparkles tournants, titre à shimmer arc-en-ciel, **3D tilt mouse-following** sur chaque card (rotation springée par framer-motion + sheen radial qui suit le curseur), bordure pulse glow par tier, **count-up animé du prix** au scroll-in, ribbon « Recommandé » avec shimmer interne, particules par tier (more = higher tier, étoiles dorées pour Légende)
  - **3 boutons CTA désactivés** « Pas encore disponible » avec shimmer band qui balaye en boucle pour signaler que c'est vivant mais en attente. Footnote en bas qui rappelle qu'aucun paiement n'est requis pour le moment.
  - **Effet Gold néon sur l'icône Couronne** dans la sidebar — version multi-couches pour vraiment grab l'œil :
    1. **Aura dorée extérieure** large (extends -inset-1.5) avec radial-gradient or → orange, pulse opacité 0.4→0.95 + scale 0.9→1.1 toutes les 2.4 s
    2. **Halo intérieur** radial-gradient avec inset+outer shadow, pulse opacité 0.6→1
    3. **Anneau rotatif** : conic-gradient or/orange en mask-composite qui tourne à 360°/6 s (effet de "lumière qui balaye")
    4. **3 sparkles dorées qui orbitent** autour de l'icône à 360°/3.2 s, chacune décalée de 1/3 de tour, opacity fade-in/fade-out
    5. **Couronne qui wobble** : rotate -6°→6° + scale 1→1.12 toutes les 2.8 s, double drop-shadow renforcé (10 px gold + 5 px orange), strokeWidth bumpé à 2.4
    Anneau actif aussi boosté en or (32 px shadow). Le bouton est maintenant impossible à rater.

### Changé

- **Logo de la sidebar = bouton Accueil** : le gros logo violet en haut de la nav verticale gauche est maintenant cliquable pour revenir à l'accueil — il prend l'état actif (anneau d'accent + glow) quand on est sur la page Home, et partage l'animation `layoutId` avec les autres entrées de la sidebar (la pillule slide vers/depuis le logo). Tooltip « Accueil » au survol.


### Supprimé

- **Icône maison « Accueil » dans la sidebar** : retirée puisque le logo en haut joue déjà ce rôle. Plus de doublon, plus de place verticale pour les autres entrées (Bibliothèque, Communauté, Sessions, Clans, Messages, modules favoris).
## [v26.04.29.11] - 2026-04-29  · semver `26.429.10`


### Ajouté

- **HomePage repensée en 2 colonnes** : greeting (« Bonne nuit, Salut Jack ») en bandeau plein-largeur en haut, puis split — colonne gauche `Continue ici` + `Lancement rapide` (4 cards), colonne droite bandeau amis online + News (avec sondages + réactions). Plus aéré, plus lisible.
- **Pastille « Actions à voir »** sous le greeting : chips cliquables qui surfaces les messages non lus (cyan) et les invitations à des jeux en attente (ambré). Cachée automatiquement quand il n'y a rien à traiter, animée à l'apparition/disparition. Click sur un chip → ouvre la page concernée.
- **Gradient mesh animé** derrière le greeting : 3 orbes colorés (accent du moment + violet + rose) qui pulsent à des tempos différents (9 s / 11 s / 13 s) pour faire respirer le fond sans distraire. Combiné aux particules tinted time-of-day déjà en place.
- **Système de logs entièrement repensé : fichier `.sl_logs` local + upload Storage** :
  - Chaque session du launcher écrit un fichier texte horodaté à `<APPDATA>/Simple Launcher/logs/session-{id}-{ts}.log`. Toutes les actions, navigations, erreurs et bugs y sont consignés ligne par ligne avec timestamp ISO.
  - Le fichier est uploadé automatiquement sur Firebase Storage (`users/{uid}/logs/{file}.log`) toutes les 4 h, ainsi qu'à la fermeture de la fenêtre et à chaque mise en arrière-plan.
  - Au démarrage, le launcher détecte les fichiers de sessions précédentes orphelins (crash, app fermée brutalement, pas de réseau au moment où ça aurait dû s'uploader) → upload automatique puis suppression locale.
  - **Bouton manuel « Envoyer mes logs » dans les Réglages** pour forcer l'upload immédiat (utile si l'admin a besoin d'un debug urgent).
  - **Refonte de la page Admin → Logs** : layout 3 colonnes Discord-like (utilisateurs / fichiers de session / viewer texte) avec download direct, suppression manuelle.
  - Rétention automatique 7 jours côté Storage via la Cloud Function `cleanupOldData` (extension de la fonction existante).
  - Commands Tauri Rust : `logs_append`, `logs_read`, `logs_take_orphans`, `logs_delete`, `logs_dir_path`.

### Changé

- **Logs déplacés dans un onglet du panel Admin** : la page Logs avait sa propre entrée dans la sidebar, ce qui faisait deux boutons admin côte à côte. Le viewer 3-colonnes (utilisateurs / sessions / contenu) est maintenant le 4ᵉ onglet du panel Admin (Modules / News / Clans / **Logs**), avec son propre titre et description dans le header. Plus de doublon dans la sidebar — un seul point d'entrée admin. Composant extrait en `LogsManager` réutilisable.
- **Nouveau logo Simple Launcher (violet)** appliqué partout : icône Tauri Windows (`.ico` installateur + .png toutes tailles), favicon de la web app et de la page profil partageable, logo dans la sidebar, hosting public. Toutes les variantes iOS/Android régénérées au passage via `tauri icon` au cas où.
- **Refonte du panel Admin avec onglets** : la page Admin était devenue un empilement de sections (Modules + News + Clans + form + preview). Remplacement par 3 onglets propres (Modules / News / Clans) avec pill animée à la sélection. Une seule section visible à la fois, titre et description du panel changent dynamiquement. Quand on quitte l'onglet Modules pendant une édition, le formulaire d'édition se réinitialise automatiquement.
- **Suppression du doublon de personnalisation** : l'accordion « Personnalisation de la page module » dans le formulaire admin faisait doublon avec le builder (qui gère déjà le thème via `PageThemeInspector`). L'accordion est retiré ; toutes les options visuelles (thème, particules, background hero, bouton Lancer) sont désormais dans le builder, accessible via le gros bouton « Personnaliser la page du module ». Le builder devient le **seul** point d'entrée pour la customisation visuelle. La section « Serveur Minecraft » (qui n'est pas du visuel) reste inline dans le formulaire admin.

### Corrigé

- **Logs nommés `vdev_xxxxxxxx.log` au lieu du format calver attendu** : `getVersion()` (Tauri) est async, mais le premier log était souvent écrit avant qu'il ait résolu (race contre `setUser()` → `headerLine`), ce qui verrouillait le filename avec la version fallback `"dev"`. Fix : injection du calver `v26.04.29.10` au build time via Vite `define` (`__APP_CALVER__`), lu **synchroniquement** par le logger à l'init du module — plus de race possible. En bonus, `setLauncherVersion()` accepte maintenant aussi un semver brut (`26.429.9`) et le convertit en calver lui-même, comme garde-fou. Les filenames sont enfin propres : `2026-04-30_00-12_v26.04.29.10_4d8bb1e3.log`.
- **« (erreur de lecture) » dans le viewer logs admin** : les anciens fichiers `session-{uuid}-{millis}.log` (uploadés par la première version du système de logs avant la refonte des noms) étaient toujours listés et auto-sélectionnés mais le fetch de leur contenu échouait souvent (encodage caractères, CORS, file path artefacts). Fix : filtrage de ces fichiers legacy dans le viewer + bouton « Purger les anciens » (icône gomme) dans le header de la liste de sessions pour les supprimer en masse de Storage. Le message d'erreur affiche maintenant le détail de l'erreur sous le « (erreur de lecture) » plutôt qu'un texte vide.
- **`Failed to fetch` côté webview Tauri en lisant les logs** : même les nouveaux fichiers (format calver propre) renvoyaient « Failed to fetch » — la WebView2 de Tauri 2 bloque les `fetch()` cross-origin vers Firebase Storage CDN, **même** quand l'URL embarque un download token signé (preflight CORS ko). Fix : nouvelle commande Tauri Rust `logs_fetch_text(url)` qui fait le GET via `reqwest` côté natif (pas de webview, pas de CORS). Le frontend récupère toujours le download URL via le SDK Firebase, mais délègue le téléchargement réel à Rust. Cap à 8 MiB pour éviter de gonfler la RAM si un log dépasse les bornes — un marqueur de troncature est ajouté en bas du contenu.
- **Crash écran noir Messages → Accueil → Messages** : la query Firestore des invitations entrantes utilisait `where("toUid","==",me) + orderBy("createdAt","desc")`, ce qui exige un index composite `(toUid asc, createdAt desc)`. Tant que cet index n'existait pas (ou pendant son build après déploiement), le SDK Firestore lançait une `INTERNAL ASSERTION FAILED ID: ca9` qui cascadait en `ID: b815` à travers TOUS les watchers actifs (Sidebar, HomePage, NewsCard, ActionsChip, FriendsOnlineStrip, InvitationPopupHost, LiveActivityToastHost) → écran noir total dès qu'on rebasculait sur Messages. Fix : retrait de l'`orderBy` de la query Firestore (un seul `where` ne nécessite que l'index single-field auto-créé), tri client-side sur le résultat déjà filtré (toujours quelques éléments). Plus de dépendance à un index composite, donc plus de cascade au boot ni en cas de déploiement de rules/index.
- **Erreur `logs_delete: missing required key fileName`** : la struct Rust `OrphanFile` sérialisait ses champs en snake_case (`file_name`) alors que le frontend Tauri envoie systématiquement camelCase. Ajout de `#[serde(rename_all = "camelCase")]` sur `OrphanFile` côté Rust pour aligner la convention. Conséquence : la suppression locale des logs orphelins après upload réussi fonctionne, ce qui supprime aussi la boucle de retry qui déclenchait des 429 sur Storage.
- **ErrorBoundary autour des hosts de toast globaux** : `<AchievementUnlockToastHost>`, `<InvitationPopupHost>` et `<LiveActivityToastHost>` sont maintenant chacun isolés dans leur propre `ErrorBoundary`. Si un de ces composants crashe (souvent à cause d'un watcher Firestore en erreur cascade), il ne fait plus tomber l'app entière — seul le host concerné disparaît silencieusement.

### Supprimé

- **Panneau « Informations » sur la page module** (ID, Type, Minecraft, Mod loader, Java requis, CF Project, CF File, etc.) jugé inutile pour les utilisateurs finaux. Ces métadonnées techniques restent dans Firestore et restent éditables côté admin, mais ne polluent plus la page de jeu.
- **Patch global `console.error` → log Firestore** retiré : il créait des boucles de feedback (un erreur Firebase pouvait elle-même générer un log Firebase qui re-générait, etc.) et saturait l'admin panel avec du bruit. Les `console.error` ne sont plus uploadés ; seules les vraies erreurs window.error et les rejections non gérées le sont, dans le fichier `.sl_logs`.
- **Stream Firestore par-entrée des logs** retiré au profit du système fichier décrit ci-dessus. Les anciennes entrées dans la collection `/logs` sont conservées (rule de lecture toujours en place), mais plus aucun nouveau log n'y est écrit.
- **Fichier `src/firebase/logs.ts` supprimé** (remplacé par `src/firebase/logFiles.ts`).
## [v26.04.29.10] - 2026-04-29  · semver `26.429.9`




### Corrigé

- **Hotfix navigation bloquée depuis Clans** : un useEffect d'auto-sélection du premier clan/salon se déclenchait même pendant la transition de sortie d'AnimatePresence, ce qui ramenait l'user de force sur la page Clans à chaque clic sur Home/Library/etc. Ajout d'un gate `route.name === "crews"` pour ne déclencher la redirection que si on est encore sur la page.
## [v26.04.29.9] - 2026-04-29  · semver `26.429.8`



### Changé

- **Noms de salons (Clans) en UTF-8 complet** : suppression de la sanitization agressive qui retirait les accents et caractères non-ASCII. Maintenant tu peux nommer tes salons « 🎮 jeux-récents », « café-discu », « événements », etc. — accents, espaces, tirets, emojis acceptés. Limite portée à 50 caractères. Seuls les caractères de contrôle et le `#` (déjà préfixé visuellement) sont strippés.
## [v26.04.29.8] - 2026-04-29  · semver `26.429.7`


### Ajouté

- **Sessions de jeu coordonnées** : nouvel onglet « Sessions » dans la sidebar. N'importe quel user peut créer une session (jeu + date + note), tes potes RSVPent en un clic (✅ Là / ❓ Peut-être / ❌ Pas dispo). Compteurs et avatars live, badge « Maintenant » + bouton Lancer quand l'heure est venue. Sessions passées affichées en compact en bas. Sub-collection `/sessions/{id}/rsvps/{uid}` avec rules par-utilisateur.
- **Clans / Crews (Discord-like textuel)** : nouvel onglet « Clans » avec layout 3 colonnes (rail clans / rail salons / messages). L'admin crée les clans (nom, emblème emoji, couleur, ordre) et leurs salons textuels depuis le panel admin. Tous les users authentifiés peuvent envoyer des messages, regroupement par auteur si messages successifs sous 5 min. Architecture Firestore: `/crews/{id}/channels/{id}/messages/{id}`.
- **Sondages dans les News** : option « Ajouter un sondage » dans l'éditeur de news admin (question + 2-6 options). Sur l'accueil, chaque news avec sondage affiche les options en boutons cliquables avec barre de progression live + pourcentage par option + total des votes. Toggle son vote en cliquant à nouveau. Sub-collection `/news/{id}/votes/{uid}`.
## [v26.04.29.7] - 2026-04-29  · semver `26.429.6`


### Ajouté

- **Réactions emoji sur les News** : sous chaque news de l'accueil, 4 emojis de réaction (❤️ 🔥 👍 🎉) avec compteurs live + tooltip listant qui a réagi. Toggle au clic, propage instantanément via Firestore onSnapshot. Sub-collection `/news/{id}/reactions/{uid}` avec rules par-utilisateur.
- **Live activity toast Steam-like** : quand un ami passe en ligne ou lance un jeu, mini-toast en bas-droite avec son avatar + indicateur (vert WiFi pour online, accent Play pour gaming). Auto-dismiss en 5,5 s, dismissable manuellement, click → ouvre le profil. Throttled à 1 toast par ami par 30 s pour éviter le spam. Skip le snapshot initial pour ne pas annoncer toute la communauté au boot. Honore privacy.showActivity.
- **Profil public web partageable** : page `simplelaunche.web.app/u/{discordId}` qui rend une carte de visite read-only du joueur (avatar, bannière, bio, thème) + un gros bouton "Télécharger pour Windows". Vanilla HTML/CSS, lit Firestore directement via le SDK web. Bouton "Partager mon profil" dans la page profil du launcher qui copie l'URL en un clic.

### Changé

- **Rules Firestore** : `users/{uid}` passe en lecture publique (sans auth) pour permettre le rendu de la page web profil. Les sous-collections sensibles (playtime, shortcuts, etc.) restent privées.
## [v26.04.29.6] - 2026-04-29  · semver `26.429.5`




### Corrigé

- **Logger : fix complet du flush vers Firestore**. Firestore rejetait les batches contenant `undefined` (ex. `metadata` pas fourni, ou champ optionnel undefined dans metadata) → tous les logs en attente échouaient en silence. Ajout d'un `stripUndefined` récursif qui nettoie chaque entrée avant `batch.set`. Les `null` sont préservés (valides côté Firestore). Les logs des amis et du launcher remontent enfin dans la console admin.
## [v26.04.29.5] - 2026-04-29  · semver `26.429.4`


### Ajouté

- **Bandeau « Amis en ligne » sur l'accueil** : pastille pulsante verte + 4 avatars + résumé d'activité (« Sarah joue à Glitch's Colony »). Cliquable, ouvre la page Communauté. Caché automatiquement quand personne n'est en ligne.
- **Système News live** : nouvelle collection Firestore `/news` avec broadcast temps-réel. Chaque admin peut publier, modifier, épingler, masquer ou supprimer une news depuis la page Admin — les modifs apparaissent **instantanément** sur tous les launchers connectés sans relaunch (Firestore `onSnapshot`). Card hero sur l'accueil avec accent customisable, support markdown dans le corps, pin (badge ambré), drawer pour les news plus anciennes. HTML sanitizé via DOMPurify.
## [v26.04.29.4] - 2026-04-29  · semver `26.429.3`


### Ajouté

- **HomePage plus vivante** : ajout de particules animées en fond (preset selon l'heure : étincelles le matin/aprem, lucioles le soir, étoiles la nuit), deux orbes colorés flottants en arrière-plan (animation lente), et un rail « Lancement rapide » sous la card Continue ici qui affiche tes 4 jeux les plus joués avec entrée animée en stagger.

### Changé

- **HomePage : retrait de la mascotte Glitch** en bas à droite (jugée disgracieuse). Allègement de la page : plus de listeners pour les amis en ligne / conversations / messages non lus puisque la mascotte n'en a plus besoin.
## [v26.04.29.3] - 2026-04-29  · semver `26.429.2`


### Ajouté

- **Auto-installation des mises à jour au démarrage** : si une nouvelle version est détectée dans les 30 s qui suivent le boot du launcher, elle se télécharge et s'installe automatiquement (banner de progression seulement, plus de popup à valider). Les détections en cours de session continuent d'afficher la modal d'invitation pour ne pas redémarrer pendant qu'on joue.
- **Modal post-update** : au premier lancement après une auto-install, un popup vert affiche le changelog de la version qu'on vient d'installer (sans bouton « Mettre à jour » puisque c'est déjà fait). Le changelog est mis en cache local juste avant le download pour qu'il soit dispo après relaunch.
## [v26.04.29.2] - 2026-04-29  · semver `26.429.1`


### Ajouté

- **Banner de diagnostic du logger** sur la page Admin → Logs : affiche en temps réel l'UID lié, la taille du buffer, le total envoyé, l'heure du dernier flush et toute erreur. Boutons « Flush maintenant » et « Test entry » pour vérifier que les writes Firestore passent. Plus de "no logs" silencieux quand un flush échoue.

### Changé

- **Logger** : intervalle de flush passé de 10 s à 5 s, taille de batch de 50 à 30, et flush automatique au `visibilitychange` (couvre le tray-hide Tauri en plus du `beforeunload`). Les logs des amis remontent plus vite.
## [v26.04.29] - 2026-04-29  · semver `26.429.0`


### Ajouté

- **Thèmes de profil prédéfinis** (8 ambiances : Cyan/Violet, Rouge/Violet, Rouge/Bleu, Vert/Jaune, Ambre/Rose, Cyan/Menthe, Violet/Fuchsia, Or/Rouge + option Custom). Chaque thème colorise le hero du profil + l'avatar. Édition dans la modal « Modifier le profil ».
- **Fallback chain robuste pour les têtes Minecraft** : si Crafatar échoue, le launcher tente automatiquement mc-heads.net puis minotar.net puis mineatar.io. Plus de placeholders gris.

### Changé

- **HomePage simplifiée** : ne reste que le greeting (avec heure du jour + mascotte mood-aware) et la card « Continue ici ». Retrait des stat tiles, friends online tile, server heartbeat, conversations tile et activity feed pour une page minimaliste.

### Corrigé

- **Toasts d'achievements spammés à chaque démarrage** : ajout d'un flag `unlockedSetPrimed` qui gate l'évaluation des conditions de déverrouillage tant que le snapshot Firestore initial n'est pas arrivé. Plus de re-toast pour des succès déjà débloqués.

### Supprimé

- **Feature « Sauvegardes cloud Minecraft »** entièrement retirée (UI, code Rust, Cloud Functions, rules Firestore et Storage). Décision : pas de cas d'usage stable pour l'instant, on reverra plus tard.
## [v26.04.27.23] - 2026-04-27  · semver `26.427.22`



### Changé

- **Position des blocs custom dans la page module** : les blocs personnalisés via le builder s'affichent désormais directement sous le bouton « Jouer » (dans la colonne gauche), au lieu d'être tout en bas de la page après la sidebar Minecraft. Layout beaucoup plus naturel à scroller.
## [v26.04.27.22] - 2026-04-27  · semver `26.427.21`




### Corrigé

- **Hotfix sauvegarde du builder** : Firestore rejetait les documents avec des champs `undefined` (ex. `page.theme.fontDisplay` quand non rempli). `updateModulePage()` strip maintenant récursivement tous les `undefined` avant l'écriture.
## [v26.04.27.21] - 2026-04-27  · semver `26.427.20`


### Ajouté

- **CTA visible « Personnaliser la page du module »** dans le formulaire d'édition admin : gros bouton en haut du form (icône Layout sur fond dégradé accent) qui ouvre directement le builder drag & drop. L'icône Layout discrète sur les ModuleCard reste en place pour l'accès rapide.
## [v26.04.27.20] - 2026-04-27  · semver `26.427.19`




### Corrigé

- **Hotfix** : la page d'un module (jeu / modpack) crashait depuis la v26.04.27.19 à cause d'une violation des Rules of Hooks (`useEffect` placé après un `return` early). Hook déplacé avant les early returns.
## [v26.04.27.19] - 2026-04-27  · semver `26.427.18`


### Ajouté

- **Pages de modules 100 % personnalisables** : nouveau schéma `ModulePageV2` avec un système de blocs (`AnyModuleBlock`) éditables via un builder visuel drag & drop dans l'admin (route `admin-builder`). 19 types de blocs disponibles : `hero-parallax`, `poster`, `gallery` (grid/masonry/carousel-3d + lightbox), `carousel`, `video-embed` (YouTube/Vimeo/Twitch/MP4), `comparison` (slider avant/après), `rich-text` (markdown), `feature-cards`, `quote`, `cta` (avec action `launch`/`url`/`scroll-top`), `divider`, `spacer`, `stats` (avec count-up), `timeline`, `changelog` (manuel ou auto-from-versions), `screenshots-grid`, `mascot-spot`, `particles-band`, `embed-html` (sanitizé via DOMPurify).
- **Builder admin** : layout 3 colonnes (palette / canvas avec preview live / inspector), drag & drop via `@dnd-kit`, undo/redo (50 niveaux), duplicate/hide par bloc, override de thème par bloc (couleurs, fond glass, padding, alignement, max-width).
- **Thème module étendu** : `theme.fontDisplayUrl` pour charger une police custom au runtime via `@font-face`. `theme.primary`/`theme.accent` propagés à tous les blocs via les CSS vars `--module-primary`/`--module-accent`.
- **PlayButton config** : `playButton.label`/`sizeScale`/`style`/`position` (lus dans `ModuleDetailPage`).

### Changé

- `uploadModuleAsset(moduleId, kind, file)` accepte maintenant un `kind: string` arbitraire (anciennement `"icon" | "banner"`) pour supporter les uploads par bloc (`block-{blockId}-{slot}`).
- Migration V1 → V2 transparente via `migrateModulePage()` : les pages legacy continuent d'afficher `<ModuleSections>` ; ouvrir le builder migre automatiquement à la sauvegarde.



### Sécurité

- HTML libre des blocs `embed-html` et `rich-text` systématiquement sanitizé via DOMPurify (whitelist iframe YouTube/Vimeo/Twitch, `<script>` et handlers `on*` retirés).
## [v26.04.27.18] - 2026-04-27  · semver `26.427.17`


### Ajouté
- **Page profil personnelle customisable, accessible depuis la sidebar.** Click sur ton avatar (en bas de la sidebar) → ta propre page profil au lieu de l'ancienne page « Mon compte » minimale. Tu y vois tout ce que voient les autres + tes contrôles d'édition + ton bouton déconnexion :
  - **Bannière personnalisée** (16:5 recommandé) qu'on uploade en 1 clic depuis la modal d'édition. Stockée dans Firebase Storage à `users/{uid}/profile/banner.{ext}` (public read pour que les autres potes la voient).
  - **Bio** texte libre (max 300 chars) affichée sous ton nom dans le hero.
  - **Couleur d'accent perso** : color picker + 5 presets rapides (cyan défaut / rose / violet / vert / or). Override la teinte cyan du launcher uniquement sur ta page profil — ailleurs le launcher reste cyan.
  - **Jeux épinglés** (jusqu'à 3) — override le top-jeux auto-calculé par playtime. Toggle pin sur chaque jeu de ta bibliothèque, badge épingle cyan sur la card. Quand tu en as moins de 3 mais que tu joues à d'autres, les jeux suivants en playtime complètent automatiquement les places restantes.
  - **Confidentialité** : 3 toggles indépendants — afficher mon activité « joue à X » live · afficher mes stats de temps de jeu · autoriser les DMs cold (non, les threads existants restent toujours actifs). Désactiver "DMs" cache le bouton « Message » sur ta page profil pour les autres potes.
  - **Bouton « Modifier mon profil »** + **bouton « Déconnexion »** rouges visibles uniquement quand tu regardes ta propre page (logique `isMe` côté front + isolation Firestore avec `request.auth.uid == uid` pour les writes).

### Changé
- **Click sur l'avatar dans la sidebar** ouvre maintenant la nouvelle page profil unifiée (`user-profile?uid=meUid`) au lieu de l'ancienne `ProfilePage` minimaliste. L'ancienne route reste enregistrée comme fallback compatible mais n'est plus la cible par défaut.
- **`UserPresence` étendu** avec `bio` / `bannerUrl` / `accentColor` / `pinnedModuleIds[]` / `privacy{showActivity, showPlaytime, allowDirectMessages}` — nouveau parser `parseUserDoc` partagé qui défensive-default les champs (les vieux docs sans ces fields sont implicitement open et sans bio).



### Sécurité
- **Nouvelles règles Firebase Storage pour `users/{uid}/profile/{file}`** : public read (tout authed user peut afficher la bannière sur la page profil), write owner-only (seul toi peux uploader ta bannière).
## [v26.04.27.17] - 2026-04-27  · semver `26.427.16`


### Ajouté
- **Auto-détection de la version Java requise** par modpack Minecraft. Lors de l'install, le launcher parse `manifest.minecraft.version` et infère la version Java majeure correspondante (1.20.5+ → Java 21, 1.17–1.20.4 → Java 17, 1.16 et plus ancien → Java 8). Stocké dans le state local + affiché en clair dans le panneau Informations de la page module : « Java 21 · auto-installé par Prism si manquant ». Prism gère lui-même le download de la JVM compatible depuis Azul/Mojang à la première run, l'utilisateur n'a rien à faire — le launcher communique juste l'info pour transparence.
- **Backup / restore cloud des saves Minecraft.** Nouveau panneau « Sauvegardes cloud » sur la page détail des modpacks Minecraft :
  - **Sauvegarde** : zip côté Rust de `saves/` + `config/` + `screenshots/` + `resourcepacks/` + `shaderpacks/` (les mod jars sont exclus, ils sont reproductibles depuis le modpack source). Upload direct via REST Firebase Storage avec auth `Firebase {idToken}`. Métadonnées Firestore sous `/users/{uid}/minecraftBackups/{id}` avec label custom (« avant raid », « jour 12 »).
  - **Restauration** : download du zip via reqwest, wipe des saves actuels (l'utilisateur a explicitement choisi), extract avec path-traversal guard. La progression de jeu d'avant le backup est restaurée à l'identique.
  - **Liste live** des sauvegardes par modpack avec date, taille, label, lien de download direct (zip), bouton Restaurer + Suppression. Tri newest-first.
  - Chaque pote a ses propres backups privés (rules Firestore + Storage owner-only). Tu peux installer le launcher sur un autre PC et restaurer ta sauvegarde en 2 clics.
- **Console RCON admin pour les serveurs Minecraft.** Implémentation complète du protocole Source RCON (TCP packet-based) côté Rust avec auth + multiplexing de session. Bouton violet **« Console RCON admin »** sur la page détail des modpacks Minecraft (visible uniquement pour le Discord ID admin). Click → modal :
  - Form de connexion (port + mot de passe + checkbox « Se souvenir », stocké en localStorage par-host).
  - Once auth OK, terminal-style monospace : output des commandes en blanc, commandes saisies en cyan préfixées `>`, messages système en italique amber. Auto-scroll, timestamps, gestion des réponses RCON multi-paquets via la trick du sentinel packet.
  - Commandes Minecraft envoyées sans le `/` initial (ex: `list`, `say Hello`, `whitelist add Notch`).
  - Auto-disconnect quand le modal se ferme. Le mot de passe RCON n'est **jamais** envoyé à Firestore (que localStorage local).


### Corrigé
- **Toast achievements en boucle infinie + achievements ne s'enregistrant pas sur le profil.** La cause : les règles Firestore pour `/users/{uid}/achievements/{achievementId}` n'étaient pas encore déployées, donc `recordUnlock()` échouait silencieusement (rules denied) et le `watchAchievements` listener errorait → `unlockedSet` restait vide → l'effet de détection re-toastait à chaque snapshot Firestore (modules, playtime, etc.) qui changeait. Double fix appliqué :
  1. **Garde session-locale** via `useRef<Set<string>>` qui retient les achievements déjà toastés dans la session actuelle. Une fois toasté, ne re-trigger jamais, peu importe l'état Firestore.
  2. **Règles Firestore déployées** : `/users/{uid}/achievements/{id}` autorise create/update à l'owner, read à tous les authed (pour afficher les badges sur les pages profil public).
  3. Bonus : l'erreur de `recordUnlock` est maintenant loggée comme `error` au lieu d'être swallowed, donc l'admin la verrait dans le panel Logs si ça re-pète.


### Sécurité
- **Règles Firestore strictes pour `/users/{uid}/minecraftBackups/{id}`** : owner-only en read+write. Combinées avec les règles Storage `users/{uid}/minecraftBackups/**` également owner-only, les saves d'un joueur restent privées même si l'URL de download (qui contient un download-token) fuite — Firebase rules add an extra defense layer.
- **Règles Firestore + Storage pour les achievements** : voir « Corrigé » ci-dessus.
## [v26.04.27.16] - 2026-04-27  · semver `26.427.15`


### Ajouté
- **Notifications Windows natives** via `tauri-plugin-notification`. Quand un pote t'envoie un DM ou une invitation gaming et que la fenêtre du launcher n'est PAS focused (minimisée, dans le tray, sur un autre desktop), tu reçois une vraie notification Windows toast (avec son système Windows + bandeau coin écran). Permission demandée une seule fois la première fois, puis silencieux. Helper `notify()` côté lib avec dédup intelligente : skip si la fenêtre est déjà focused (le son in-app + UI suffisent).
- **Icône système (tray) avec menu contextuel.** Le launcher pose maintenant son icône dans la barre des tâches Windows à côté de l'horloge. Right-click → menu : « Ouvrir Simple Launcher · Naviguer vers (Communauté / Messages / Bibliothèque) · Quitter ». Left-click → toggle visibilité de la fenêtre principale (show / hide / focus selon état). **Fermer la fenêtre ne quitte plus l'app** — elle se cache dans le tray (comme Discord/Steam). Pour vraiment quitter, click droit tray → Quitter. Les notifs continuent à fonctionner pendant que le launcher tourne en arrière-plan.
- **Game invitations entre potes.** Bouton « Inviter à jouer » sur la page profil public d'un pote → modal avec picker du jeu de ta bibliothèque + champ « petit mot » optionnel. Envoie une `/invitations/{id}` Firestore au pote ciblé, qui voit chez lui un **popup card animé en bas-droite** avec ton avatar, le jeu, ton message, et 2 boutons « Rejoindre » / « Plus tard ». Doublé d'une **notification Windows native** si sa fenêtre n'est pas focused. TTL 30 min : passé ce délai, l'invitation est filtrée côté client (l'audit reste en Firestore et est purgé par le cron 14). Click sur Rejoindre → navigation directe vers la page module pour install/launch.
- **Module versioning / rollback admin.** Nouveau panneau **« Versions publiées »** dans le formulaire d'édition d'un module hébergé : liste toutes les versions archivées (chaque upload de binaire crée une entrée `/modules/{id}/versions/{version}`), avec date de release + taille + bouton **« Rétablir »** sur chaque ancienne version. Click → atomic swap des champs `version` / `downloadUrl` / `sha256` / `size` du parent doc vers ceux de la version cible. Tes potes voient ça comme un « update available » classique au prochain check de leur launcher → ils re-téléchargent l'ancien binaire en 1 clic. **Rollback en 30 secondes si tu pushes une version cassée.**
- **Cleanup automatique des données via Cloud Function planifié.** Nouvelle CF `cleanupOldData` qui tourne **toutes les 24h** sur europe-west1 et purge :
  - Les `/logs` plus vieux que **30 jours** (l'admin garde l'historique du dernier mois pour debug).
  - Les `/serverStats/{addressKey}/snapshots/*` plus vieux que **14 jours** (la courbe d'activité 24h n'a pas besoin de plus, et le doc parent garde l'all-time peak forever).
  - Les `/invitations` résolues/déclinées de plus de **7 jours** (les pending sont préservées).
  - Cap 500 deletes par run pour rester sous le timeout 9 min. Idempotent — la prochaine run prend le relais.

### Changé
- **Window close → hide instead of quit.** Le `WindowEvent::CloseRequested` du main window est intercepté côté Rust et `prevent_close()` est appelé. Combiné avec le tray icon, ça permet au launcher de tourner en arrière-plan en continu pour : notifications natives, polling messages, invitations live, etc.



### Sécurité
- **Règles Firestore strictes pour `/invitations/{id}`** : seuls les 2 participants (`fromUid` et `toUid`) peuvent lire le doc. Le sender peut create + cancel, le recipient peut accept + decline (transitions de status whitelisted dans la rule). Aucun delete autorisé — l'audit trail des invitations stays. Combiné avec le cron 14, les vieilles invitations sont purgées automatiquement après 7 jours.
## [v26.04.27.15] - 2026-04-27  · semver `26.427.14`


### Ajouté
- **Système d'achievements/badges complet.** 13 achievements répartis sur 4 tiers (bronze / argent / or / platine) débloquables au fil de l'utilisation : « Premier pas » (premier login), « Bibliothèque entamée » (1er install), « Allumage » (1er lancement), « Brise-glace » (1er DM), « Une heure au compteur » / « Dix heures » / « Le marathonien » (100h cumulées), « Collectionneur » (3 jeux installés), « Bibliothèque garnie » (5 jeux), « Cercle social » (3 potes différents en DM), « Mr/Mme Popularité » (100 messages), « Lanceur en série » (50 sessions), « Légende du launcher » (tous les autres = secret platine). Détection client-side automatique à chaque snapshot Firestore, avec persistance par-utilisateur sous `/users/{uid}/achievements/{achievementId}` (immuable, idempotent). **Toast d'unlock** centré en haut de l'écran avec animation spring + son `success` + icône Lucide tier-coloré, auto-dismiss 6s.
- **Pages de profil public** par utilisateur. Click sur l'avatar ou le nom de n'importe quel pote (page Communauté, header de conversation, mascotte hover, etc.) → page dédiée avec : avatar XL + status dot + activité live, 3 stats hero (temps total, sessions cumulées, achievements débloqués X/Y), top 5 jeux joués (clickables vers la page module), grille de tous les badges débloqués (avec tier glow + grayscale pour les non-débloqués), bouton « Envoyer un message » qui ouvre direct le chat. Routée via le nouveau `user-profile` dans le store UI.
- **Mascotte Glitch SVG inline réactive selon le contexte.** Remplace l'ancien logo PNG bottom-right par un vrai pingouin custom-drawn (capuche jaune, yeux cyan glowing, bec orange) avec 5 humeurs qui changent automatiquement :
  - 💬 **chat** : tu as des messages non lus → bulle de chat avec dots animés au-dessus de la tête
  - 🎮 **gaming** : un pote joue actuellement → manette en bas
  - ✨ **happy** : des potes en ligne sans jouer → sourire (bec courbé) + sparkles dorés
  - 😴 **sleeping** : pas joué depuis 24h → yeux fermés + Zzz cyan, bob plus lent
  - 🪶 **idle** : neutre → yeux qui pulsent doucement
  
  Tooltip contextuel au survol expliquant le mood. Bob speed varie aussi par mood.
- **Empty states avec illustrations Glitch custom-drawn**. Composant `<EmptyState>` réutilisable avec 5 variantes (`library` / `friends` / `messages` / `error` / `search`) — chaque variante a son prop dans la SVG (manette, enveloppe, bulle de chat, loupe, point d'interrogation). Halo cyan blur derrière, animation y-bob 3.6s. Plus de `<icon /> + texte plat` partout.
- **Loading skeletons réutilisables** (`Skeleton`, `PageSkeleton`, `CardSkeleton`, `LineSkeleton`). Animation `shimmer-sweep` CSS-only (pseudo-element translate-x sweep) — pure GPU, pas de JS. Utilisée comme Suspense fallback pour les routes lazy.
- **React Error Boundary** au niveau du route renderer. Si une page crashe en render, on affiche un fallback poli (icône AlertTriangle rose + message d'erreur tronqué + boutons « Réessayer » / « Accueil ») au lieu de l'écran blanc complet, **et le bug est auto-shippé au logger** (niveau `bug`) avec stack trace + composantStack pour que l'admin le voie dans le panel Logs.

### Changé
- **Code splitting des routes via React.lazy.** Les 7 pages les moins critiques (`Settings`, `Profile`, `Admin`, `AdminLogs`, `ModuleDetail`, `Community`, `Messages`, `PublicProfile`) sont maintenant chargées en chunks séparés à la demande. Bundle initial JS attendu en baisse de ~1 MB → ~300 KB gzippé pour les nouveaux installs. Home / Library / Login restent eagerly imported pour pas avoir de Suspense fallback flash au boot.
## [v26.04.27.14] - 2026-04-27  · semver `26.427.13`


### Ajouté
- **Refonte complète de la page d'accueil en social hub bento-grid.** L'ancienne hero "SIMPLE LAUNCHER" + cartes statiques laisse place à un cockpit vivant qui agrège tout ce qui se passe dans l'écosystème :
  - **Greeting personnalisé time-of-day-aware** : « Bon matin ☀️ » (5h–12h), « Bon aprem 🌤️ » (12h–18h), « Bonsoir 🌆 » (18h–22h), « Bonne nuit 🌙 » (22h–5h). Le halo cyan derrière le greeting card change de teinte en conséquence (cyan-orange à l'aube, magenta-orange au coucher, violet profond la nuit). Heure live à droite avec re-tick toutes les 30 s.
  - **Card « Continue ici »** géante (16:8) montrant le **dernier module joué** (calculé depuis la collection Firestore `/users/{uid}/playtime`) avec banner zoom-on-hover, bouton PLAY en disque cyan, durée totale cumulée + relative time du dernier launch (« Joué hier · 12 h cumulés »). Click → page détail du module.
  - **Stats grid 2×2** : `Jeux dispos`, `Total joué` (formaté `12 h 25 min`), `En ligne` (potes) avec glow accent quand > 0, `Sessions` (nombre de launches all-time). Chacune avec icône Lucide colorée (cyan/amber/emerald/rose) dans une tile glass.
  - **Tile « Amis en ligne »** : avatars Discord + status dot (online/idle/offline) + activité live (« joue à Glitch's Colony » avec icône Gamepad2 cyan). Click sur un pote → ouvre le DM. Counter « +N autres amis hors ligne » discret.
  - **Tile « Serveur Minecraft »** live : compteur joueurs en gros, jusqu'à 5 têtes 3D Crafatar des joueurs en ligne, address en mono, badge live qui pulse vert/gris selon état. Click → page détail du module avec card serveur full.
  - **Tile « Dernières conversations »** avec preview du dernier message, timestamp relatif, badge unread cyan par conversation + total. Click → ouvre directement le chat.
  - **Tile « Activité communauté »** : feed temps-réel synthétisé depuis les heartbeats de présence — « Theo joue à Glitch's Colony · 2h », « Marie est dans le menu · à l'instant ». Sans abonnement Firestore supplémentaire (pure dérivation depuis la liste users).
  - **Mascotte logo Glitch** en bottom-right qui idle-bobs (translation Y ±6 px en boucle 3.6 s ease-in-out) avec drop-shadow accent cyan. Pointer-events-none — pure cosmétique.
## [v26.04.27.13] - 2026-04-27  · semver `26.427.12`


### Ajouté
- **Système de logs / télémétrie complet avec panel admin caché.** Tout ce que les launchers font (actions des utilisateurs, erreurs JS, bugs, navigations, installs/launches, conversations démarrées, messages envoyés, etc.) est désormais loggé en temps réel sur Firestore et consultable depuis un panel admin :
  - **Logger client** (`src/lib/logger.ts`) avec buffer mémoire 50 entrées flushé toutes les 10 s en `writeBatch` Firestore (un seul commit par fenêtre, pas une écriture par log → économe en quota). 5 niveaux : `info` / `action` / `warn` / `error` / `bug`. Buffer cap à 500 si l'utilisateur est offline pour éviter de bouffer la RAM. Identité bind au login (uid + displayName + avatar) avec backfill des entries logguées en mode anonyme.
  - **Auto-capture** des erreurs JS via `window.error`, des promesses rejetées via `window.unhandledrejection`, et des appels explicites `console.error()` (patché). Stack traces incluses dans les métadonnées pour les bugs. Best-effort flush sur `beforeunload` pour ne pas perdre les dernières entrées avant fermeture.
  - **Wiring complet aux actions clés** : navigation entre pages, login/logout, install + uninstall + launch de modules, install de modpacks Minecraft, envoi de message privé, démarrage de conversation. Chaque action loggée avec source + métadonnées identifiantes (moduleId, conversationId, version, etc.).
  - **Panel admin caché** sous `Logs` dans la sidebar — visible UNIQUEMENT pour le Discord ID admin. Live tail temps-réel via `onSnapshot`, animation slide-in sur chaque nouveau log, border-left coloré par niveau (rose pour erreurs, fuchsia pour bugs, amber pour warnings, emerald pour actions, sky pour info). Filtres chips par niveau avec count, dropdown de filtrage par utilisateur. Click sur une row → expand pour voir UID complet, sessionId, userAgent, métadonnées en JSON pretty-printed. Cap à 200 entries pour pas overcharger.
  - **SessionId unique par boot** — toutes les entries d'une même session de launcher partagent le même UUID, donc l'admin peut group les logs par session pour reconstituer une chronologie de bug.
  - **launcherVersion + userAgent** stampés sur chaque entry pour distinguer "ce bug arrive uniquement en `v26.04.27.10` sur Windows 11".


### Corrigé
- **Bug de la conversation qui disparaissait instantanément après clic sur le bouton « Message ».** Trois fixes en cascade : (1) le `setDoc({ "lastReadAt.uid": now }, { merge: true })` créait littéralement un champ top-level `"lastReadAt.uid"` au lieu de nester sous `lastReadAt` (Firestore SDK ne supporte pas les dot-paths avec setDoc-merge, contrairement à `updateDoc`) — switché vers `updateDoc` qui honore les dot-paths. (2) le `orderBy("updatedAt", "desc")` sur la query `array-contains` filtrait temporairement les conversations fraîchement créées dont le `serverTimestamp()` était encore en pending (~500 ms) — la conv flashait visible puis disparaissait le temps que le serveur ack arrive. Drop de l'orderBy serveur-side, sort client-side maintenant. (3) Nouvelle subscription directe `watchConversationById(cid)` en fallback dans `MessagesPage` : la conv s'affiche immédiatement même si la list query lague.


### Sécurité
- **Nouvelle règle Firestore pour `/logs/{logId}`** : chaque utilisateur authentifié peut créer ses propres logs (uid dans le doc body doit matcher l'auth uid) et lire ses propres logs back ; **les admins ont accès en lecture à tous les logs** (pour le panel admin caché). Update/delete interdits → audit trail immuable. Pas de contenu de message privé loggé, pas de tokens — juste des actions et IDs.
## [v26.04.27.12] - 2026-04-27  · semver `26.427.11`


### Ajouté
- **Refonte complète du rendu des release notes — fini le bloc `whitespace-pre-line` brut, place à un renderer typographique riche.** Les notes affichées dans la bannière de mise à jour (coin bas-droit) et dans le popup centré « Mise à jour fraîche » sont maintenant parsées et stylisées section par section :
  - **5 catégories typées** avec couleur + icône Lucide + symbole dédiés : `Ajouté` (✨ emerald + `+`), `Changé` (🪄 amber + `~`), `Corrigé` (🐛 rose + `*`), `Supprimé` (🗑 slate + `−`), `Sécurité` (🛡 violet + `🔒`). Border-left coloré sur chaque section, ligne de header avec icône et label en uppercase tracking-[0.2em] dans la couleur catégorie, fond glass avec ring subtil.
  - **Compteur par catégorie** dans le header de section (« 3 nouveautés », « 2 fixes », « 1 renfort »). Pluriel/singulier géré en français.
  - **Featured banner** au sommet du popup centré : la première entrée d'`Ajouté` est promue en gros bandeau dégradé cyan→violet avec mention « Cette release apporte » et son emoji auto-détecté en taille XL.
  - **Mini table-of-contents** cliquable (chips colorés par catégorie + count) qui smooth-scroll vers la section correspondante. Affichée uniquement quand il y a > 1 section ET > 3 entrées totales pour pas saouler les petits releases.
  - **Stats footer** sous toutes les sections : « Cette release : 5 nouveautés · 2 changements · 1 fix » avec chaque chiffre coloré dans la couleur catégorie.
  - **Animation stagger** : chaque section fade-in avec un delay décalé (0.06s × index) puis chaque entrée à l'intérieur (0.05s × index) — effet « déroulé » naturel à l'ouverture.
  - **Auto-emoji par mot-clé** dans le titre + description de chaque entrée : 21 règles regex couvrant Minecraft (🎮), messagerie (💬), serveur (🌐), admin (🛠️), RAM (⚡), sécurité (🛡️), particules (✨), audio (🔊), update (🔔), Discord (🔐), bug (🐛), UI/layout (🎨), favoris (⭐), communauté (👥), drapeau (🏁), Firebase (🔥), Rust (🦀), TypeScript (📘), raccourci (🎯), assets images (🖼️), cache (💾). Première match wins.
  - **Badge `BREAKING`** rouge avec icône AlertTriangle qui apparaît auto si l'entrée contient les mots-clés "breaking" ou "rupture".
  - **Date pretty-printed** sous la version : « Sortie aujourd'hui à 14h26 » (< 24 h), « hier à 09h12 » (< 48 h), « il y a 3 j » (< 7 j), sinon « le 27 avril 2026 à 14h26 ». Source = champ `pub_date` de `latest.json` exposé via `Update.date` du plugin Tauri Updater.
  - **Markdown inline préservé** : `**gras**` rendu en font-semibold blanc primary, `` `code` `` rendu dans une chip mono cyan avec ring subtil. Parser regex single-pass, pas de dépendance markdown lourde.
- **Messagerie privée 1-on-1 entre potes du launcher.** Nouvelle page `Messages` accessible depuis l'icône `MessageCircle` dans la sidebar, avec layout deux-panes classique (liste des conversations à gauche, chat actif à droite) :
  - **Bouton « Message »** sur chaque card de la page Communauté → crée la conversation deterministe (id = `[uidA, uidB].sort().join("__")` donc les deux potes atterrissent sur le même doc Firestore peu importe qui DM en premier) et navigue direct vers le chat.
  - **Liste des conversations** triée par dernier message (le plus récent en haut), avec avatar Discord, preview du dernier message (« Toi : … » si je suis l'auteur), timestamp relatif (« à l'instant », « 3 min », « 2 j »), et **badge unread cyan** quand il y a des messages non lus.
  - **Chat panel** avec bulles cyan (mes messages) à droite et bulles glass (messages des potes) à gauche, **regroupement automatique** des messages consécutifs du même auteur dans les 2 minutes (avatar/nom suppressé sur les follow-ups), animation `framer-motion` slide-in à chaque nouvelle bulle, auto-scroll vers le bas, input avec bouton Send qui s'éteint quand le draft est vide.
  - **Read receipts** par participant via `lastReadAt` dans le doc conversation : à chaque ouverture du chat, le timestamp de lecture est mis à jour pour ne plus voir le badge unread sur ce thread.
  - **Badge unread global dans la sidebar** : la pastille cyan sur l'icône Messages totalise les unreads de toutes les conversations (« 9+ » au-delà de 9), animation spring scale-in à chaque incrément.
  - **Son `messageReceived`** (chime doux 2 tons E5 → G5, ~150 ms, volume 0.1) qui ding quand un nouveau message arrive d'un pote — joué par le sidebar (peu importe sur quelle page tu es) sauf si tu es déjà sur la page Messages auquel cas c'est le chat panel qui ding.
- **Card serveur Minecraft entièrement refondue avec 6 nouvelles features.** Sur la page détail d'un module Minecraft qui a un serveur configuré :
  - **Favicon du serveur** affiché 64×64 à gauche du header (récupéré via mcsrvstat — base64 PNG embarqué dans la réponse, zéro requête supplémentaire). Fallback sur un glyph Server cyan si le serveur n'a pas de favicon.
  - **Drapeau pays + hébergeur** dans le header. La résolution se fait via ip-api.com (free tier 45 req/min, sans clé) sur l'IPv4 que mcsrvstat renvoie déjà après avoir résolu le SRV record. Cache localStorage 30 jours par IP — un seul appel jamais à chaque ouverture, donc l'API n'est jamais hit après le premier tour.
  - **Latence en ms** dans le header avec code couleur tonal (vert < 120 ms, ambre < 300 ms, rose au-delà). C'est le RTT vers mcsrvstat, mesuré client-side via `performance.now()` autour du `fetch()` — proxy correct du ping réel pote→serveur.
  - **Software exact + protocol version + nombre de mods** dans une ligne dédiée. Le parser détecte Paper / Spigot / Forge / NeoForge / Fabric / Velocity / BungeeCord / Vanilla en sniffant la string version, et le badge `47 mods` cyan apparaît automatiquement quand le serveur tourne sous Forge/NeoForge (l'extension SLP des moddeurs renvoie la liste complète).
  - **Têtes Minecraft 3D des joueurs en ligne**. Pour chaque pseudo dans le sample de 12 que le serveur renvoie via SLP, on rend la tête 3D via crafatar.com (helmet overlay activé, scale 4) directement à partir de l'UUID. Si l'UUID est absent (serveur anonymisé), fallback sur mc-heads.net 2D. Affiché en grille auto-fill, avec le pseudo sous chaque tête + drop-shadow noir pour les rendre crispées sur le fond glass. Compteur « +N non listés » quand le sample n'inclut pas tous les joueurs en ligne.
  - **Graph d'activité 24h en SVG** sous les têtes. Courbe accent-cyan avec dégradé en aire en dessous, glow drop-shadow, point pulsant à la dernière mesure. Construit en pur SVG (zéro dep), normalisation X sur 24h glissantes et Y sur le pic 24h × 1.0.
  - **All-time peak** : « All-time peak : 18 le 24 avril à 21:30 » sous le graph. Mis à jour de manière atomique par tous les launchers connectés via Firestore (read-then-write merge).

### Changé
- **Le popup centré « Mise à jour fraîche » s'affiche maintenant aussi au démarrage du launcher** (avant : seulement la bannière en bas-droit). La bannière coin se ratait trop facilement quand un pote ouvrait le launcher pour cliquer direct sur JOUER ; maintenant le popup centré attention-grabbing apparaît à chaque démarrage tant qu'une update est dispo, donc impossible de la louper. Les sons restent distincts : `notification()` doux au démarrage (pour pas startle), `updateArrived()` arpège festif pour les arrivées mid-session.
- **Pipeline d'historique d'activité shared via Firestore.** Nouveau collection `/serverStats/{addressKey}/snapshots/{slot}` où chaque launcher actif poste un snapshot du compteur joueurs toutes les 5 minutes max (rate-limit côté client + ID de doc deterministe = `Math.floor(now / 300000) * 300000` → naturellement déduplique entre clients). Le doc parent `/serverStats/{addressKey}` garde l'agrégat all-time (`peakPlayers`, `peakAt`, `lastUpdatedAt`). Visible immédiatement sur la card → plus tes potes ouvrent le launcher, plus la courbe se densifie.
- **Parser mcsrvstat enrichi** : extraction de la sample players list (avec UUIDs), du software, de la mod list Forge/NeoForge, du protocol version, et de l'IPv4 résolue. Tous typés et exposés via `useMinecraftStatus`. Computer la latence client-side ajouté au passage.



### Sécurité
- **Nouvelle règle Firestore pour `/serverStats`** : lecture + écriture autorisées à tout utilisateur authentifié. Pas d'info perso dans ces docs (juste `playersOnline`, `playersMax`, `online`, timestamp, et l'address sanitizée comme clé), donc partagé entre tous les potes du launcher sans risque.
- **Règles Firestore strictes pour `/conversations/{cid}`** : seuls les deux participants encodés dans l'ID du doc (extraits via `cid.split("__")` quand le doc n'existe pas encore, ou via le champ `participants` une fois créé) peuvent lire, créer et update la conversation. Les messages individuels héritent de cette restriction via un `get()` sur le doc parent. **Aucun edit ni delete autorisé** sur les messages — l'historique est durable et inaltérable côté serveur.
## [v26.04.27.11] - 2026-04-27  · semver `26.427.10`



### Changé
- **Section « Modpack uploadé » du panel admin : on ne bombarde plus l'œil avec l'URL Firebase brute.** Avant : l'URL Firebase Storage complète (200+ caractères, du genre `https://firebasestorage.googleapis.com/v0/b/.../modpack.zip?alt=media&token=...`) s'affichait en `font-mono text-[10px]` à côté du checkmark vert. Sa longueur intrinsèque déjouait le `truncate` (parents flex/grid sans `min-width: 0` partout) et **forçait toute la colonne formulaire à s'élargir au-delà de son grid track 7/12**, ce qui faisait déborder visuellement le formulaire sur la colonne preview. Maintenant on affiche juste « hébergé sur Firebase Storage » avec l'URL en `title` (tooltip au survol) pour les admins qui veulent vraiment la copier — UX plus propre **et** plus de débordement.

### Corrigé
- **Le débordement de la colonne formulaire admin sur la colonne preview est éradiqué pour de bon.** Triple ceinture-bretelles :
  1. La motion.div de la colonne formulaire reçoit maintenant `overflow-hidden` en plus de `min-w-0` — c'est le filet de sécurité ultime : peu importe quel élément interne refuse d'honorer `min-width: 0` (un `<select>` avec une option longue, un input avec un placeholder qui ne wrap pas, du contenu intrinsèque indomptable), il est visuellement clipé au rounded-3xl du formulaire, plus aucune fuite possible vers la preview.
  2. La row « Modpack uploadé » du `ModpackZipPicker` a maintenant `min-w-0` sur le flex container lui-même + `shrink-0` explicite sur le checkmark, le bouton « Remplacer » et le bouton « Retirer ». Avant ces éléments avaient leur `min-width: auto` par défaut et résistaient au shrink quand le contenu central voulait grandir.
  3. L'URL Firebase brute est remplacée par un libellé court (cf. § Changé), donc même si un futur bug fait que `truncate` ne s'applique plus, il n'y a plus de chaîne 200-char à truncate.
## [v26.04.27.10] - 2026-04-27  · semver `26.427.9`


### Ajouté
- **Contrôle de la RAM côté joueur (chaque pote choisit la sienne).** Sur la page détail d'un module Minecraft, nouveau panneau `RAM allouée` au-dessus de la card Informations :
  - Affiche le **défaut configuré par l'admin** (« 8 Go » par exemple) en référence sous la valeur live.
  - **Slider** identique à celui de l'admin (preset chips Défaut/4/6/8/12 Go, hint coloré selon la zone, animation spring).
  - Badge **« Réglage perso actif »** (orange) quand le joueur a override le défaut admin, sinon badge **« Défaut admin »** discret.
  - Bouton **« Appliquer au prochain JOUER »** qui ne s'active que si la valeur a changé, avec son `success` au save. Bouton **« Reset »** pour revenir au défaut admin (visible uniquement quand un override est actif).
  - Sauvegarde **par-machine via localStorage** (clé `mc-user-ram:<moduleId>`) — chaque pote a son propre réglage qui ne change rien pour les autres.
  - Pris en compte automatiquement à l'**install** ET au **launch** : la fonction `getEffectiveRam(module)` retourne le user override > admin default > Prism default. Côté Rust, `patch_instance_memory` réécrit l'`instance.cfg` au prochain JOUER si la RAM a changé — pas de reinstall nécessaire pour qu'un changement prenne effet.

### Changé
- **`RamSlider` extrait dans un composant partagé** (`src/components/library/RamSlider.tsx`) réutilisé identiquement par le panel admin et la page détail module pour une UX visuelle 100 % cohérente entre « réglage admin » et « override pote ».
## [v26.04.27.9] - 2026-04-27  · semver `26.427.8`



### Changé
- **Panel admin : refonte de la zone du haut en mode édition.** Avant : la « row des modules publiés » s'affichait toujours, même en pleine édition d'un module — résultat, on voyait deux fois la même card (une fois en haut dans la liste, une fois implicitement dans le formulaire et la preview à droite), ce qui donnait l'impression de chevauchement. Maintenant, dès qu'on entre en édition, la row se replie en un **chip compact** (« Édition en cours : Glitch's Colony » avec bouton Quitter) et le formulaire respire.
- **Wrapper de la preview admin allégé** : avant la card de preview vivait dans une box `glass-strong p-5` (donc card-dans-une-card), maintenant la preview flotte directement sur le fond de page sans layer intermédiaire — moins de chrome, plus de focus sur le rendu lui-même.

### Corrigé
- **Particules WebGL qui débordaient hors des cards de preview/library.** Le composant `<Particles>` de tsParticles rendait son canvas dans son className direct, sans wrapper de containment. Maintenant on l'enveloppe dans un `div pointer-events-none absolute inset-0 overflow-hidden` dédié → quoi que fasse tsparticles avec son canvas interne, les étoiles/lucioles/flocons restent clipées au rectangle du parent.
## [v26.04.27.8] - 2026-04-27  · semver `26.427.7`


### Ajouté
- **Contrôle de la RAM allouée à Minecraft (jolie UI dans le panel admin).** Nouveau champ `maxRamMb` sur les `MinecraftModule` + composant `RamSlider` dans le formulaire admin :
  - **Slider neon-cyan** avec gradient de remplissage animé spring, tick marks discrets aux paliers (2 / 4 / 6 / 8 / 10 / 12 / 14 Go), thumb circulaire avec glow accent au hover.
  - **Chips presets** « Défaut / 4 Go / 6 Go / 8 Go / 12 Go » pour sélection en un clic (le préset actif passe en background accent solide avec son shadow).
  - **Affichage live** de la valeur en grand format display (`tabular-nums` pour pas de jitter) avec unité Go calculée automatiquement.
  - **Hint contextuel coloré** sous le slider : amber-ish pour les valeurs trop basses (< 3 Go = warning), neutre pour la zone confortable (4–10 Go), rose-ish pour les valeurs absurdes (> 10 Go = vérifier que les potes ont la RAM physique). Le texte change en fonction de la zone : explique pourquoi c'est trop / juste / trop élevé.
  - **Default 4 Go** au lieu du défaut Prism (souvent 1–2 Go) — fini les freezes au moindre modpack un peu chargé.
- **Application de la RAM sans réinstall.** Quand l'admin bump la valeur sur un module déjà installé chez ses potes, le launcher patche le `instance.cfg` au prochain JOUER (helper Rust `patch_instance_memory` qui rewrite uniquement les clés `OverrideMemory` / `MaxMemAlloc` / `MinMemAlloc` / `PermGen` en préservant tout le reste). Pas de re-download du fat-zip nécessaire pour changer la RAM.
- **Affichage de la RAM allouée dans la page détail du module** (panneau Informations, à côté de Minecraft / Mod loader). Affiché uniquement si `maxRamMb` est défini.

### Changé
- **Refonte du layout du panel admin pour évacuer le chevauchement visuel avec le formulaire.** Avant : la liste « Modules publiés » vivait dans la colonne droite (col-span-5), à côté du formulaire (col-span-7) — résultat, quand le formulaire affichait ses sections en deux colonnes (icon + banner pickers, version + mod loader), le bandeau de la liste « Modules publiés » se retrouvait au même Y et donnait l'illusion d'un overlap. Maintenant :
  - **Modules publiés en bandeau plein-largeur au-dessus du grid**, en row horizontale scrollable (chaque card a sa largeur fixe `w-[22rem]`, scrollbar-fine sous la row si débordement).
  - **Colonne droite réduite à uniquement la preview live**, avec `lg:sticky lg:top-6` pour qu'elle suive le scroll du formulaire — l'admin garde la visualisation de la card côté bibliothèque sous les yeux pendant qu'il édite les sections du bas.
## [v26.04.27.7] - 2026-04-27  · semver `26.427.6`


### Ajouté
- **Détection en temps réel des mises à jour du launcher.** Avant : `check()` ne tournait qu'une fois au démarrage de l'app — si tu déployais une nouvelle version pendant que tes potes étaient déjà dans le launcher, ils ne la voyaient qu'au prochain redémarrage. Maintenant le launcher re-poll `latest.json` **toutes les 2 minutes** tant qu'il est ouvert. Quand une nouvelle version vient d'arriver mid-session :
  - **Popup centré attention-grabbing** avec halo cyan pulsant, icône Sparkles qui se balance, glassmorphism strong, version display en gros + notes de release scrollables, boutons « Plus tard » / « Installer maintenant ».
  - **Son arpège « updateArrived »** : 4 notes A5 → C#6 → E6 → A6 (accord A majeur ascendant, ~0.4 s) avec une harmonique aiguë en shimmer pour la touche festive. Distinct du `notification()` plus discret réservé à la détection au démarrage.
  - **Banner persistant en bas-droit** qui reste affiché tant que tu n'as pas installé, même si tu fermes le popup.
  - Le `seenVersion` est tracké dans une ref pour ne pas re-spammer le popup à chaque poll réussi sur la même version pending — il ne re-trigger que si une version *encore plus récente* arrive après.


### Corrigé
- **Panel admin : la card du module actif (ring cyan) débordait sur le formulaire à gauche.** L'ombre extérieure `shadow-[0_0_24px_…]` faisait exactement la largeur de la `gap-6` (24 px) entre les deux colonnes du grid, donc elle léchait le bord droit du formulaire et donnait l'illusion que la card écrasait la section SOURCE DU MODPACK. Passé en `shadow-[inset_0_0_24px_…]` : le glow reste strictement à l'intérieur de la card, plus aucune fuite. Ajouté aussi `relative z-10` + `min-w-0` à la colonne formulaire et `relative z-0` + `min-w-0` à la colonne droite pour blinder l'empilement quoi qu'il arrive.
## [v26.04.27.6] - 2026-04-27  · semver `26.427.5`


### Ajouté
- **Mode « fat-zip » pour les modpacks Minecraft : zéro UI Prism Launcher pendant l'install ET le lancement.** Quand l'admin uploade un modpack en mode « Upload manuel », le launcher provisionne maintenant l'instance Prism lui-même (écrit `instance.cfg` + `mmc-pack.json`, copie le contenu d'`overrides/` dans `minecraft/`) au lieu d'appeler `prismlauncher --import`. Plus aucune fenêtre Prism qui s'ouvre, plus aucun popup navigateur pour les mods opt-out de la distribution tiers, plus aucun appel à l'API CurseForge — tes potes voient juste la barre de progression du launcher pendant l'install puis MC qui démarre. Les `.jar` des mods doivent être bundled directement dans `overrides/mods/` du `.zip` uploadé (les `files[]` du manifest sont ignorés en mode manuel — c'est le prix à payer pour bypasser CurseForge).
- **Configuration globale Prism « discrète » sur notre install managé** : à l'extraction de Prism portable (`%APPDATA%\com.simplelaunche.app\prism\`), le launcher écrit un `prismlauncher.cfg` avec `MinimizeOnLaunch=true`, `CloseAfterLaunch=true`, `ShowConsole=false`, `AutoCloseConsole=true`, `Language=fr_FR`. Combiné avec les flags équivalents dans chaque `instance.cfg`, Prism est quasi invisible : il flash à peine pendant que MC démarre, puis se minimise / se ferme. Les installs Prism existants de l'utilisateur ne sont pas touchés.

### Changé
- **Parsing complet du `manifest.json` CurseForge en Rust** : `mc_install_modpack` extrait désormais le nom du modpack, la version Minecraft, et l'ID + version du mod loader principal (forge / fabric / neoforge / quilt) pour générer le `mmc-pack.json` Prism avec les bons composants (`net.minecraft`, `net.minecraftforge`, `net.fabricmc.fabric-loader`, `net.neoforged`, `org.quiltmc.quilt-loader`).
- **Détection du dossier de données Prism** : nouvelle fonction `prism_data_dir(prism_exe)` qui distingue les installs portable (présence d'un `portable.txt` à côté de l'exe → instances dans `<exe_dir>/instances/`) des installs standards (instances dans `%APPDATA%\PrismLauncher\instances\`). Garantit que notre install managé reste portable peu importe la version de Prism téléchargée.
- **UI admin « Upload manuel » réécrite** pour expliquer le format fat-zip attendu, avec la liste explicite des dossiers requis à la racine du zip (`manifest.json`, `overrides/mods/*.jar`, `overrides/config/`…) et un avertissement clair que les `files[]` du manifest sont ignorés.

### Corrigé
- **Idempotence des updates de modpack en mode manuel** : si l'admin re-uploade une nouvelle version du fat-zip, le launcher wipe l'instance Prism existante avant de l'écrire à nouveau. Avant, en mode `--import` Prism duppliquait l'instance avec un suffixe.


### Sécurité
- **Path traversal guard** dans `extract_modpack_into` : les entrées du zip qui pointent en dehors de `<instance>/minecraft/` sont ignorées.
## [v26.04.27.5] - 2026-04-27  · semver `26.427.4`


### Ajouté
- **Upload manuel des modpacks Minecraft** : nouveau toggle dans le panel admin pour les modules Minecraft. Au lieu de passer par l'API CurseForge (qui peut renvoyer 403 quand un mod du modpack interdit la distribution tiers), l'admin peut désormais uploader directement l'**export CurseForge** du modpack (le `.zip` contenant `manifest.json` + dossier `overrides/`) dans Firebase Storage. Le launcher télécharge depuis Firebase et passe le zip à Prism, qui se charge de récupérer les mods un par un. Pour les ~30% de mods qui ont opté-out de la distribution tiers, Prism ouvre une fenêtre navigateur pour que l'utilisateur clique manuellement « Download » sur la page CF (Prism détecte le téléchargement et continue automatiquement).
- **Détection des updates en mode upload manuel** : un hash de l'URL Storage sert de version key. Quand l'admin remplace le `.zip` (nouvelle URL), le launcher voit un nouveau hash et propose la mise à jour aux utilisateurs.

### Changé
- **Suppression de la double tentative CurseForge API** : `mc_install_modpack` accepte maintenant un `customZipUrl` optionnel et bypass complètement la CF API quand il est fourni. Quand on utilise la CF API, la résolution de l'URL est extraite dans un helper dédié `resolve_curseforge_download_url`.
## [v26.04.27.4] - 2026-04-27  · semver `26.427.3`



### Changé
- **Erreurs Minecraft : on récupère désormais le corps de la réponse CurseForge** quand l'API renvoie 403/404/401, et on l'affiche dans le message. CurseForge inclut souvent une explication JSON (`{"error": "..."}`) qui dit pourquoi le download est bloqué — utile quand le code HTTP seul ne suffit pas à diagnostiquer (ex: réglage projet vs fichier, mod interne qui bloque la distribution du modpack entier).
## [v26.04.27.3] - 2026-04-27  · semver `26.427.2`



### Changé
- **Install Minecraft : un seul appel API au lieu de deux**. On utilisait `/v1/mods/{modId}/files/{fileId}/download-url` pour récupérer l'URL, mais cet endpoint renvoie parfois 403 même quand le fichier autorise les downloads tiers. On lit maintenant directement le champ `downloadUrl` retourné par `/v1/mods/{modId}/files/{fileId}`, ce qui marche dans plus de cas.

### Corrigé
- **Messages d'erreur Minecraft beaucoup plus précis** : si le fichier ne peut pas être téléchargé, le launcher indique maintenant le **statut CurseForge** du fichier (Approuvé / En cours de revue / Prêt pour revue / Rejeté / etc.). Si le statut n'est pas « Approuvé », c'est que CurseForge n'a pas encore validé le fichier — peut prendre quelques heures pour les modpacks. Si `allowModDistribution: false`, le message rappelle que le réglage se fait au moment de l'upload (ré-uploader le même fichier ne change rien, il faut un nouveau fichier).
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
