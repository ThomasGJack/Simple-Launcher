import { Accordion, type FaqItem } from "../components/Accordion";
import { ANCHORS } from "../lib/anchors";

const ITEMS: FaqItem[] = [
  {
    highlight: true,
    q: "C'est quoi Simple Games exactement ?",
    a: (
      <>
        <p>
          <strong>Simple Games</strong> c'est le crew (la communauté) qui vit à
          l'intérieur de Simple Launcher. Techniquement c'est un{" "}
          <em>master crew</em> dans le launcher — un clan Discord-style auquel{" "}
          <strong>tous les utilisateurs sont auto-membres</strong> dès leur
          premier login. Tu n'as rien à faire pour le rejoindre, et tu ne peux
          pas le quitter.
        </p>
        <p style={{ marginTop: "0.6em" }}>
          C'est l'endroit où on parle des modpacks, où on annonce les events,
          où on partage des screenshots, où on fait des sondages. Comme un
          Discord serveur principal, sauf que c'est intégré au launcher donc
          pas besoin de jongler entre 2 apps.
        </p>
      </>
    ),
  },
  {
    highlight: true,
    q: "Je peux créer mon propre crew, séparé de Simple Games ?",
    a: (
      <>
        <p>
          Oui — tout utilisateur ayant un{" "}
          <strong>tier Soutien / VIP / Légende</strong> (via Ko-fi) peut créer
          ses propres crews privés ou publics. Tu choisis emblème, couleur,
          channels, rôles custom, code d'invitation.
        </p>
        <p style={{ marginTop: "0.6em" }}>
          Simple Games reste accessible en parallèle, c'est pas l'un ou
          l'autre. Les crews publics sont listés dans la section "Découvrir" —
          n'importe qui peut les rejoindre. Les privés se rejoignent uniquement
          via code d'invitation que tu partages.
        </p>
      </>
    ),
  },
  {
    q: 'Pourquoi Windows me dit "Cette application n\'est pas reconnue" ?',
    a: (
      <>
        <p>
          Le launcher est <strong>signé numériquement</strong> pour la
          vérification d'auto-updates (ed25519), mais pas avec un certificat{" "}
          <strong>Microsoft Code Signing</strong> commercial (~300 €/an), donc
          SmartScreen marque chaque .exe peu téléchargé comme suspect par
          défaut.
        </p>
        <p style={{ marginTop: "0.6em" }}>
          Sur l'écran bleu, clique <strong>"Informations complémentaires"</strong>{" "}
          puis <strong>"Exécuter quand même"</strong>. Une fois installé, les
          mises à jour suivantes passent en silence — elles sont validées par
          signature ed25519 directement dans le launcher, sans intervention de
          Windows.
        </p>
      </>
    ),
  },
  {
    q: "Comment on importe un modpack Minecraft ?",
    a: (
      <>
        <p>Trois sources possibles, configurables côté admin du module :</p>
        <p style={{ marginTop: "0.6em" }}>
          <strong>CurseForge</strong> — colle l'ID du projet, le launcher pull
          la dernière version
          <br />
          <strong>Modrinth</strong> — colle l'URL du <code>.mrpack</code>
          <br />
          <strong>ZIP manuel</strong> — héberge un <code>.zip</code>{" "}
          CurseForge-style et colle l'URL
        </p>
        <p style={{ marginTop: "0.6em" }}>
          Le launcher détecte la version Minecraft + le loader (Fabric / Forge
          / NeoForge) depuis le manifest et installe tout automatiquement (mods,
          configs, resourcepacks, shaderpacks).
        </p>
      </>
    ),
  },
  {
    q: "Mes données restent-elles privées ?",
    a: (
      <>
        <p>
          Oui. Le launcher ne collecte <strong>aucune donnée</strong> à des
          fins commerciales. Les seules choses qui partent côté serveur :
        </p>
        <p style={{ marginTop: "0.6em" }}>
          • <strong>Login Discord</strong> (OAuth, ton id Discord et avatar)
          <br />• <strong>Login Microsoft</strong> (uniquement pour Minecraft,
          géré par Microsoft directement)
          <br />• <strong>Achievements et stats</strong> de jeu (uniquement si
          tu joues à un module qui les active)
          <br />• <strong>Présence Discord</strong> (si tu actives le Rich
          Presence)
        </p>
        <p style={{ marginTop: "0.6em" }}>
          Tous les tokens d'auth sont stockés dans{" "}
          <strong>Windows Credential Manager</strong> côté local, jamais en
          clair. Voir <a href="/privacy.html" className="text-accent underline">/privacy.html</a>.
        </p>
      </>
    ),
  },
  {
    q: "Mac ou Linux ?",
    a: (
      <>
        <p>
          Pas pour l'instant. Le launcher est <strong>Windows-only</strong>{" "}
          car le runtime Tauri qu'on utilise dépend de la WebView native de
          chaque OS, et plein de chemins critiques (auto-install des
          redistributables VC++, hooks Discord RPC, tray Win32) sont écrits
          côté Windows.
        </p>
        <p style={{ marginTop: "0.6em" }}>
          Un portage est techniquement possible mais pas dans la roadmap
          court terme.
        </p>
      </>
    ),
  },
  {
    q: "C'est open-source ?",
    a: (
      <p>
        Le projet est <strong>privé</strong> à ce stade — pas de repo public ni
        de mécanisme de PR pour l'instant. Si t'es intéressé pour bosser dessus
        ou rapporter un bug, contacte le crew directement depuis les channels
        Simple Games dans le launcher (après install + login).
      </p>
    ),
  },
  {
    q: "Combien d'espace disque ça prend ?",
    a: (
      <>
        <p>
          Le launcher seul : <strong>~30 MB</strong> installé. Chaque module
          Minecraft pèse ce que pèse son modpack (souvent{" "}
          <strong>1 à 4 GiB</strong> avec mods + assets téléchargés). Le
          launcher partage les libraries entre instances quand c'est possible
          (libraries Java vanilla, assets Mojang).
        </p>
        <p style={{ marginTop: "0.6em" }}>
          Tu peux désinstaller un module à tout moment, ça libère le disque
          proprement.
        </p>
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id={ANCHORS.faq} className="section">
      <div className="container-narrow">
        <div className="text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            FAQ
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Les questions qu'on nous pose.
          </h2>
        </div>

        <div className="mt-12">
          <Accordion items={ITEMS} />
        </div>
      </div>
    </section>
  );
}
