import { motion } from "framer-motion";
import {
  Check,
  Hammer,
  Compass,
  Castle,
  Globe,
  Bot,
  Trophy,
  Users,
  PackagePlus,
  Smartphone,
  Headphones,
  GitBranch,
  Sparkles,
  Cloud,
} from "lucide-react";

/**
 * Section 14 — Vision & Roadmap. Trois colonnes : ce qui marche
 * aujourd'hui, ce qui est en construction, ce qui est prévu plus
 * loin. Donne au visiteur une idée du projet dans le temps + de
 * l'ambition.
 */

type Item = {
  icon: typeof Check;
  title: string;
  body?: string;
};

const PRESENT: Item[] = [
  {
    icon: Castle,
    title: "Crew maître Simple Games",
    body: "Tous les utilisateurs auto-membres dès le login Discord.",
  },
  {
    icon: PackagePlus,
    title: "Installation Minecraft auto",
    body: "Vanilla, Fabric, Forge, NeoForge + import Modrinth / CurseForge.",
  },
  {
    icon: Trophy,
    title: "39 achievements + heatmap",
    body: "Statistiques publiques, profils partageables /u/{id}.",
  },
  {
    icon: GitBranch,
    title: "Auto-update Velopack",
    body: "Delta packages 3-5 MB, signature ed25519, zéro popup Windows.",
  },
];

const BUILDING: Item[] = [
  {
    icon: Users,
    title: "Crews privés pour les supporters",
    body: "Channels custom, rôles colorés, codes d'invitation, modération.",
  },
  {
    icon: Bot,
    title: "Bot Discord ↔ launcher",
    body: "Annoncer les sessions multi sur Discord, sync présence inversée.",
  },
  {
    icon: Cloud,
    title: "Hébergement de monde MC",
    body: "Server Minecraft jouable directement dans le launcher, RCON intégré.",
  },
  {
    icon: Sparkles,
    title: "Builder de modules public",
    body: "Drag-drop visuel pour designer une page de jeu (en cours côté admin).",
  },
];

const FUTURE: Item[] = [
  {
    icon: Smartphone,
    title: "Application mobile companion",
    body: "Voir le crew online, recevoir les notifs, pas la partie launcher.",
  },
  {
    icon: Headphones,
    title: "Voice rooms intégrés",
    body: "Salon vocal par module sans dépendre d'un Discord externe.",
  },
  {
    icon: Globe,
    title: "Versions Mac et Linux",
    body: "Tauri 2 le supporte. La chaîne Minecraft demande du travail.",
  },
  {
    icon: Compass,
    title: "Découverte modpacks publics",
    body: "Liste des packs joués par les autres crews + import en un clic.",
  },
];

export function Vision() {
  return (
    <section className="section relative overflow-hidden">
      {/* Glow doré subtil en arrière-plan */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 30%, rgba(252,211,77,0.05), transparent 60%)",
        }}
      />

      <div className="container relative">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow eyebrow-gold">
            <span className="eyebrow-dot" />
            Vision · Roadmap
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Ce qui existe.{" "}
            <span className="text-fg-muted">Ce qui se construit.</span>{" "}
            <span
              style={{
                background: "linear-gradient(90deg, var(--color-gold), var(--color-gold-strong))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Ce qu'on imagine.
            </span>
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Le launcher évolue chaque semaine — releases tagguées calver
            (YY.MM.DD.S) avec changelog public, idées portées par le crew. Pas
            de promesse de date, juste une direction claire.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          <Column
            label="Présent"
            sublabel="Ça marche, c'est déployé"
            color="cyan"
            icon={Check}
            items={PRESENT}
            delay={0}
          />
          <Column
            label="En construction"
            sublabel="Branches actives"
            color="purple"
            icon={Hammer}
            items={BUILDING}
            delay={0.1}
          />
          <Column
            label="Futur"
            sublabel="Idées qu'on veut explorer"
            color="gold"
            icon={Compass}
            items={FUTURE}
            delay={0.2}
          />
        </div>

        {/* Footer mini : la philosophie */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto mt-14 max-w-3xl rounded-2xl glass p-6 text-center"
        >
          <p className="text-sm leading-relaxed text-fg-muted">
            <span className="font-display text-[var(--color-gold)]">
              ★ Une chose qu'on ne fera pas
            </span>{" "}
            : facturer une fonctionnalité de jeu. Tout ce qui touche au
            gameplay (modules, install, lancement, modpacks) restera{" "}
            <strong className="text-fg-primary">gratuit</strong>. Les tiers
            Soutien / VIP / Légende débloquent uniquement de la décoration et
            la création de crews privés.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function Column({
  label,
  sublabel,
  color,
  icon: Icon,
  items,
  delay,
}: {
  label: string;
  sublabel: string;
  color: "cyan" | "purple" | "gold";
  icon: typeof Check;
  items: Item[];
  delay: number;
}) {
  const colorClasses = {
    cyan: {
      ring: "ring-accent/30",
      iconBg: "bg-accent/15 text-accent",
      label: "text-accent",
    },
    purple: {
      ring: "ring-fuchsia-500/30",
      iconBg: "bg-fuchsia-500/15 text-fuchsia-300",
      label: "text-fuchsia-300",
    },
    gold: {
      ring: "ring-[color-mix(in_srgb,var(--color-gold)_28%,transparent)]",
      iconBg:
        "bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] text-[var(--color-gold)]",
      label: "text-[var(--color-gold)]",
    },
  }[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      className={`relative rounded-2xl p-6 glass ring-1 ${colorClasses.ring}`}
    >
      <div className="mb-6 flex items-center gap-3">
        <div className={`grid size-10 place-items-center rounded-xl ring-1 ${colorClasses.iconBg} ${colorClasses.ring}`}>
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div>
          <div className={`text-xs uppercase tracking-[0.2em] font-semibold ${colorClasses.label}`}>
            {label}
          </div>
          <div className="text-[11px] text-fg-dim">{sublabel}</div>
        </div>
      </div>

      <ul className="flex flex-col gap-4">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <item.icon className={`size-4 shrink-0 mt-0.5 ${colorClasses.label}`} strokeWidth={2} />
            <div>
              <div className="text-sm font-medium text-fg-primary">{item.title}</div>
              {item.body && (
                <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {item.body}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
