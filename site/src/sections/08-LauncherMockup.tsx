import { motion } from "framer-motion";
import {
  Home,
  Library,
  Users,
  MessageSquare,
  Trophy,
  Settings,
  Bell,
  Star,
  Gamepad2,
} from "lucide-react";
import { TitleBarMockup } from "../components/TitleBarMockup";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { ANCHORS } from "../lib/anchors";

/**
 * Section 08 — Mockup du launcher en lui-même. Faux écran avec
 * TitleBar custom + sidebar nav + zone module (banner + glass
 * details). Démontre l'esthétique de l'app sans avoir à uploader des
 * captures d'écran.
 */
export function LauncherMockup() {
  return (
    <section id={ANCHORS.launcher} className="section relative overflow-hidden">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Sous le capot
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Léger, signé, et{" "}
            <span className="text-glow-accent text-accent">pas un Electron</span>.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Construit en Tauri 2 (Rust + WebView native). Résultat : un installer
            de 5 MB, un footprint mémoire à un chiffre, et l'auto-update via
            Velopack en delta packages (~3-5 MB par release).
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto mt-16 max-w-6xl"
        >
          {/* Frame de la "fenêtre" launcher */}
          <div className="overflow-hidden rounded-2xl bg-bg-base shadow-[0_30px_120px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08]">
            <TitleBarMockup />

            <div className="relative grid h-[460px] grid-cols-[200px_1fr]">
              {/* Sidebar mockup */}
              <div className="flex flex-col gap-1 border-r border-white/[0.04] bg-bg-soft p-3">
                <SidebarItem icon={Home} label="Accueil" />
                <SidebarItem icon={Library} label="Bibliothèque" active />
                <SidebarItem icon={Users} label="Crews" badge="3" />
                <SidebarItem icon={MessageSquare} label="Messages" />
                <SidebarItem icon={Trophy} label="Achievements" />
                <div className="mt-auto flex flex-col gap-1">
                  <SidebarItem icon={Bell} label="Notifications" badge="•" />
                  <SidebarItem icon={Settings} label="Paramètres" />
                </div>
              </div>

              {/* Zone module mockup */}
              <div className="relative overflow-hidden">
                <div className="absolute inset-0">
                  <AnimatedBackground />
                </div>
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, rgba(7,9,13,0.2) 0%, rgba(7,9,13,0.85) 100%), url('https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=70')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />

                <div className="relative flex h-full flex-col justify-end p-10">
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-cyan-500/15 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300 ring-1 ring-cyan-500/30 backdrop-blur">
                    <Gamepad2 className="size-3" />
                    Officiel · Forge
                  </span>
                  <h3 className="mt-3 font-display text-3xl text-fg-primary">
                    Create: Astral
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-fg-muted">
                    Modpack expert progression. ~200 mods, 60+ heures de
                    contenu. Auto-connect serveur dédié au launch.
                  </p>
                  <div className="mt-6 flex items-center gap-4">
                    <div className="inline-flex items-center gap-3 rounded-2xl bg-accent px-7 py-3.5 font-display text-sm uppercase tracking-[0.18em] text-bg-base shadow-[0_0_36px_var(--color-accent-glow)]">
                      <Star className="size-4 fill-bg-base" strokeWidth={0} />
                      Jouer
                    </div>
                    <div className="text-xs text-fg-muted">
                      <div className="font-display text-fg-primary">v1.20.1</div>
                      <div>4.2 GB · 217 joueurs</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tech stack chips */}
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TechChip
              tag="Backend"
              tech="Rust + Tauri 2"
              desc="Tout le launch path Minecraft, l'install Java, le tray, l'auto-update Velopack vivent en Rust."
            />
            <TechChip
              tag="UI"
              tech="React 19 + Tailwind 4"
              desc="Framer Motion pour les transitions, Zustand pour l'état, GSAP/tsParticles pour les particules."
              accent="purple"
            />
            <TechChip
              tag="Cloud"
              tech="Firebase"
              desc="Firestore (modules + users), Storage (assets), Hosting CDN. Cloud Functions Discord OAuth + Ko-fi."
              accent="gold"
            />
            <TechChip
              tag="Update"
              tech="Velopack delta"
              desc="Delta packages signés ed25519 (~3-5 MB). Install atomique avec rollback. Aucune popup Windows."
              accent="pink"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active = false,
  badge,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition " +
        (active
          ? "bg-accent/10 text-fg-primary ring-1 ring-accent/20"
          : "text-fg-muted")
      }
    >
      <Icon className={"size-4 " + (active ? "text-accent" : "")} strokeWidth={1.8} />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold text-accent">
          {badge}
        </span>
      )}
    </div>
  );
}

function TechChip({
  tag,
  tech,
  desc,
  accent = "cyan",
}: {
  tag: string;
  tech: string;
  desc: string;
  accent?: "cyan" | "purple" | "pink" | "gold";
}) {
  const accentClass = {
    cyan: "bg-accent/15 text-accent ring-accent/30",
    purple: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
    pink: "bg-pink-500/15 text-pink-300 ring-pink-500/30",
    gold: "bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] text-[var(--color-gold)] ring-[color-mix(in_srgb,var(--color-gold)_28%,transparent)]",
  }[accent];

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] ring-1 " +
            accentClass
          }
        >
          {tag}
        </span>
        <strong className="text-sm text-fg-primary">{tech}</strong>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">{desc}</p>
    </div>
  );
}
