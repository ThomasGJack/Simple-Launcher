import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Library,
  Users,
  MessageSquare,
  Trophy,
  Settings,
  Bell,
  User,
  Star,
  Gamepad2,
  Sparkles,
  Castle,
  Hash,
  Pin,
  Mic,
  Send,
  Calendar,
  Lock,
  Palette,
  Sliders,
} from "lucide-react";
import { TitleBarMockup } from "../components/TitleBarMockup";
import { ANCHORS } from "../lib/anchors";

/**
 * Section 08 — LauncherTour. Un faux écran launcher avec sidebar
 * cliquable qui change de vue au clic. 6 vues : Accueil, Bibliothèque,
 * Crews, Messages, Profil, Achievements, Paramètres. Chaque vue est
 * un mockup HTML/CSS qui montre concrètement ce que le launcher fait
 * — beaucoup plus parlant qu'une description textuelle.
 */

type ViewKey =
  | "home"
  | "library"
  | "crews"
  | "profile"
  | "achievements"
  | "settings";

type ViewDef = {
  key: ViewKey;
  label: string;
  icon: typeof Home;
  badge?: string;
  desc: string;
};

const VIEWS: ViewDef[] = [
  {
    key: "home",
    label: "Accueil",
    icon: Home,
    desc: "Hub de session — qui joue à quoi, dernières news, achievement le plus proche.",
  },
  {
    key: "library",
    label: "Bibliothèque",
    icon: Library,
    desc: "Tous les modules installables — modpacks officiels du crew, raccourcis Steam, instances Minecraft custom.",
  },
  {
    key: "crews",
    label: "Crews",
    icon: Users,
    badge: "★",
    desc: "Channels Discord-style. Le crew maître Simple Games + tes propres clans privés.",
  },
  {
    key: "profile",
    label: "Profil",
    icon: User,
    desc: "Ton avatar, bio, achievements, heatmap, modules épinglés. URL publique partageable /u/ton-id.",
  },
  {
    key: "achievements",
    label: "Achievements",
    icon: Trophy,
    desc: "39 badges à débloquer avec rareté en %. Bronze, argent, or, platine. Certains sont secrets.",
  },
  {
    key: "settings",
    label: "Paramètres",
    icon: Settings,
    desc: "Apparence, RAM Java par module, comptes Discord/Microsoft, overlay in-game (Shift+F9), diagnostic.",
  },
];

export function LauncherMockup() {
  const [active, setActive] = useState<ViewKey>("home");

  // Auto-cycle des vues : toutes les 6 secondes, avance à la suivante
  // (pause si l'utilisateur a cliqué dans les 8 dernières secondes)
  const [lastClickAt, setLastClickAt] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastClickAt < 8000) return;
      setActive((current) => {
        const idx = VIEWS.findIndex((v) => v.key === current);
        const next = (idx + 1) % VIEWS.length;
        return VIEWS[next].key;
      });
    }, 6000);
    return () => clearInterval(interval);
  }, [lastClickAt]);

  const activeView = VIEWS.find((v) => v.key === active) ?? VIEWS[0];

  return (
    <section id={ANCHORS.launcher} className="section relative overflow-hidden">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Visite guidée
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Le launcher,{" "}
            <span className="text-glow-accent text-accent">en vrai</span>.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Clique sur une rubrique pour voir ce qui s'y passe. Chaque page a
            sa fonction et son thème — le launcher n'est pas qu'une fenêtre de
            téléchargement.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto mt-14 max-w-6xl"
        >
          <div className="overflow-hidden rounded-2xl bg-bg-base shadow-[0_30px_120px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08]">
            <TitleBarMockup />

            <div className="relative grid h-[520px] grid-cols-[210px_1fr]">
              {/* Sidebar — onglets cliquables */}
              <div className="flex flex-col gap-1 border-r border-white/[0.04] bg-bg-soft p-3">
                {VIEWS.slice(0, 5).map((v) => (
                  <SidebarTab
                    key={v.key}
                    view={v}
                    active={active === v.key}
                    onClick={() => {
                      setActive(v.key);
                      setLastClickAt(Date.now());
                    }}
                  />
                ))}
                <div className="mt-auto flex flex-col gap-1">
                  <SidebarTab
                    view={VIEWS[5]}
                    active={active === "settings"}
                    onClick={() => {
                      setActive("settings");
                      setLastClickAt(Date.now());
                    }}
                  />
                </div>
              </div>

              {/* Zone vue */}
              <div className="relative overflow-hidden bg-gradient-to-br from-bg-base via-bg-soft to-bg-base">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.25 }}
                    className="absolute inset-0"
                  >
                    {active === "home" && <HomeView />}
                    {active === "library" && <LibraryView />}
                    {active === "crews" && <CrewsView />}
                    {active === "profile" && <ProfileView />}
                    {active === "achievements" && <AchievementsView />}
                    {active === "settings" && <SettingsView />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Description du panneau actif sous le mockup */}
          <motion.div
            key={active + "-desc"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-5 flex items-center justify-center gap-3 text-sm"
          >
            <activeView.icon className="size-4 text-accent" />
            <span className="text-fg-muted">{activeView.desc}</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function SidebarTab({
  view,
  active,
  onClick,
}: {
  view: ViewDef;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition " +
        (active
          ? "bg-accent/10 text-fg-primary ring-1 ring-accent/20"
          : "text-fg-muted hover:bg-white/[0.03] hover:text-fg-primary")
      }
    >
      <view.icon
        className={"size-4 " + (active ? "text-accent" : "")}
        strokeWidth={1.8}
      />
      <span className="flex-1">{view.label}</span>
      {view.badge && (
        <span
          className="rounded-full bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-gold)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_28%,transparent)]"
          style={{ lineHeight: 1 }}
        >
          {view.badge}
        </span>
      )}
    </button>
  );
}

// ─── Vues mockées ──────────────────────────────────────────────────

function HomeView() {
  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-4 p-6">
      {/* Hero "qui joue maintenant" */}
      <div className="rounded-2xl bg-bg-overlay p-5 ring-1 ring-white/[0.06] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-accent">Maintenant</div>
            <h3 className="mt-1 font-display text-2xl text-fg-primary">
              4 membres en jeu
            </h3>
            <p className="mt-1 text-xs text-fg-muted">
              Sur Create: Astral · session démarrée il y a 1h
            </p>
          </div>
          <div className="flex -space-x-2">
            {["#00d4ff", "#a855f7", "#fcd34d", "#4ade80"].map((c, i) => (
              <div
                key={i}
                className="grid size-9 place-items-center rounded-full ring-2 ring-bg-base font-display text-xs text-bg-base"
                style={{ background: c }}
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid news + next achievement */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl glass p-4">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-fg-dim">
            <Bell className="size-3" /> News du crew
          </div>
          <h4 className="font-display text-sm text-fg-primary">
            Modpack Vault Hunters dispo
          </h4>
          <p className="mt-1 text-xs text-fg-muted">
            Nouveau modpack ajouté par l'admin. Roguelike RPG, ~150 mods. 12
            réactions · 4 commentaires.
          </p>
        </div>
        <div className="rounded-xl bg-[color-mix(in_srgb,var(--color-gold)_5%,transparent)] p-4 ring-1 ring-[color-mix(in_srgb,var(--color-gold)_22%,transparent)]">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[var(--color-gold)]">
            <Sparkles className="size-3" /> Prochaine étoile
          </div>
          <h4 className="font-display text-sm text-fg-primary">
            Marathon — 50h sur un module
          </h4>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] text-fg-dim">
              <span>34h sur Create: Astral</span>
              <span className="font-display text-[var(--color-gold)]">68 %</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[var(--color-gold)]"
                style={{ width: "68%" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LibraryView() {
  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-accent">
            Bibliothèque
          </div>
          <h3 className="mt-1 font-display text-2xl text-fg-primary">
            9 modules installés
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {["Tous", "Officiels", "Local", "Mon MC"].map((tab, i) => (
            <span
              key={tab}
              className={
                "rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] " +
                (i === 0
                  ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                  : "text-fg-muted")
              }
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 overflow-hidden">
        {[
          {
            name: "Create: Astral",
            tag: "Forge",
            color: "from-cyan-500/30 to-purple-500/20",
            v: "v1.20.1",
          },
          {
            name: "All The Mods 10",
            tag: "NeoForge",
            color: "from-emerald-500/25 to-teal-500/15",
            v: "v1.21",
          },
          {
            name: "Vault Hunters",
            tag: "Modpack",
            color: "from-fuchsia-500/30 to-pink-500/20",
            v: "Nouveau",
          },
          {
            name: "Vanilla 1.21",
            tag: "Vanilla",
            color: "from-amber-500/20 to-orange-500/15",
            v: "v1.21",
          },
          {
            name: "CS2",
            tag: "Local",
            color: "from-slate-500/25 to-zinc-500/15",
            v: "Steam",
          },
          {
            name: "Mon labo MC",
            tag: "Mon MC",
            color: "from-emerald-500/25 to-cyan-500/15",
            v: "Custom",
          },
        ].map((mod, i) => (
          <div
            key={i}
            className={
              "relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br " +
              mod.color +
              " ring-1 ring-white/[0.06]"
            }
          >
            <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent" />
            <div className="absolute left-2 top-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-base/80 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.08]">
                {mod.tag}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <div className="text-[11px] font-semibold text-fg-primary line-clamp-1">
                {mod.name}
              </div>
              <div className="mt-0.5 text-[10px] text-fg-muted">{mod.v}</div>
              <div className="mt-2 grid place-items-center rounded-md bg-accent py-1 text-[10px] font-bold uppercase tracking-wider text-bg-base">
                Jouer
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CrewsView() {
  return (
    <div className="grid h-full grid-cols-[180px_1fr] p-0">
      {/* Liste des crews */}
      <div className="flex flex-col gap-1 border-r border-white/[0.04] bg-bg-soft/50 p-3">
        <div className="mb-1 px-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          Mes crews
        </div>
        <CrewItem
          name="Simple Games"
          icon={Castle}
          iconColor="#fcd34d"
          active
          subtitle="217 membres"
          isMaster
        />
        <CrewItem
          name="Modpack Lab"
          icon={Sparkles}
          iconColor="#a855f7"
          subtitle="12 membres"
        />
        <CrewItem
          name="Speedrun Crew"
          icon={Trophy}
          iconColor="#00d4ff"
          subtitle="6 membres"
        />
      </div>

      {/* Vue channel */}
      <div className="grid grid-cols-[140px_1fr] overflow-hidden">
        <div className="flex flex-col gap-0.5 border-r border-white/[0.04] bg-bg-soft/30 p-3">
          <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            Channels
          </div>
          {[
            { name: "annonces", pinned: true },
            { name: "général", active: true },
            { name: "modpacks" },
            { name: "events" },
            { name: "screenshots" },
            { name: "support" },
          ].map((ch) => (
            <div
              key={ch.name}
              className={
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] " +
                (ch.active
                  ? "bg-accent/10 text-fg-primary"
                  : "text-fg-muted")
              }
            >
              {ch.pinned ? <Pin className="size-3" /> : <Hash className="size-3" />}
              <span>{ch.name}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 overflow-hidden p-4">
          <Message
            user="Alastor"
            color="#fcd34d"
            text="Quelqu'un dispo pour Vault Hunters ce soir ?"
            time="20:14"
          />
          <Message
            user="Naya"
            color="#a855f7"
            text="Yes je rejoins dans 10 min, faut que je finisse mon donjon"
            time="20:15"
          />
          <Message
            user="goule"
            color="#00d4ff"
            text="Je lance le serveur, vous pouvez join sur l'IP du module"
            time="20:16"
          />
          <div className="mt-auto flex items-center gap-2 rounded-xl bg-bg-overlay px-3 py-2 ring-1 ring-white/[0.06]">
            <Mic className="size-3.5 text-fg-muted" />
            <input
              className="flex-1 bg-transparent text-xs text-fg-primary outline-none placeholder:text-fg-dim"
              placeholder="Écris un message dans #général…"
              readOnly
              value=""
            />
            <Send className="size-3.5 text-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CrewItem({
  name,
  icon: Icon,
  iconColor,
  active,
  subtitle,
  isMaster,
}: {
  name: string;
  icon: typeof Castle;
  iconColor: string;
  active?: boolean;
  subtitle: string;
  isMaster?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] " +
        (active ? "bg-white/[0.04] text-fg-primary" : "text-fg-muted")
      }
    >
      <div
        className="grid size-7 shrink-0 place-items-center rounded-md ring-1 ring-white/[0.08]"
        style={{ background: `${iconColor}22` }}
      >
        <Icon className="size-3.5" style={{ color: iconColor }} strokeWidth={2} />
      </div>
      <div className="flex-1 leading-tight">
        <div className="flex items-center gap-1 text-fg-primary">
          {name}
          {isMaster && <span className="text-[var(--color-gold)]">★</span>}
        </div>
        <div className="text-[9px] text-fg-dim">{subtitle}</div>
      </div>
    </div>
  );
}

function Message({
  user,
  color,
  text,
  time,
}: {
  user: string;
  color: string;
  text: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="grid size-7 shrink-0 place-items-center rounded-full font-display text-[10px] text-bg-base"
        style={{ background: color }}
      >
        {user[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold" style={{ color }}>
            {user}
          </span>
          <span className="text-[9px] text-fg-dim">{time}</span>
        </div>
        <p className="mt-0.5 text-xs text-fg-primary">{text}</p>
      </div>
    </div>
  );
}

function ProfileView() {
  return (
    <div className="grid h-full p-6">
      <div className="overflow-hidden rounded-2xl bg-bg-overlay ring-1 ring-white/[0.06]">
        {/* Banner */}
        <div className="relative h-20 bg-gradient-to-br from-cyan-500/30 via-purple-500/20 to-amber-400/20" />

        <div className="relative px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div
              className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 font-display text-2xl text-bg-base ring-4 ring-bg-soft"
            >
              G
            </div>
            <div className="pb-1">
              <h3 className="font-display text-lg text-fg-primary">goule</h3>
              <p className="text-xs text-fg-muted">@goule · ★ Crew maître</p>
            </div>
            <div className="ml-auto pb-1 text-right">
              <div className="text-xs text-fg-dim">URL publique</div>
              <div className="font-mono text-[10px] text-accent">/u/discord_306...</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Achievements" value="24/39" />
            <Stat label="Heures jouées" value="412h" />
            <Stat label="Streak actuel" value="7 jours" />
          </div>

          {/* Heatmap mini */}
          <div className="mt-4 rounded-xl glass p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent">
              <Calendar className="size-3" /> Heatmap personnelle
            </div>
            <div className="grid grid-cols-24 gap-px" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
              {Array.from({ length: 7 * 24 }).map((_, i) => {
                const intensity = Math.random();
                let level = 0;
                if (intensity > 0.85) level = 4;
                else if (intensity > 0.7) level = 3;
                else if (intensity > 0.5) level = 2;
                else if (intensity > 0.3) level = 1;
                const opacity = [0.04, 0.15, 0.35, 0.6, 0.9][level];
                return (
                  <div
                    key={i}
                    className="aspect-square rounded-[1px]"
                    style={{ background: `rgba(0, 212, 255, ${opacity})` }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
      <div className="font-display text-lg text-fg-primary">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-fg-dim">{label}</div>
    </div>
  );
}

function AchievementsView() {
  const items = [
    { tier: "platinum", color: "#e0aaff", title: "Marathonien", unlocked: true },
    { tier: "gold", color: "#fcd34d", title: "Bibliothèque garnie", unlocked: true },
    { tier: "gold", color: "#fcd34d", title: "Cabinet de curiosités", unlocked: false, pct: 70 },
    { tier: "silver", color: "#cbd5e1", title: "Maître raccourcis", unlocked: true },
    { tier: "silver", color: "#cbd5e1", title: "Time à 100h", unlocked: false, pct: 42 },
    { tier: "bronze", color: "#fb923c", title: "Premier pas", unlocked: true },
    { tier: "bronze", color: "#fb923c", title: "Lien établi", unlocked: true },
    { tier: "bronze", color: "#fb923c", title: "Tu as du style", unlocked: false, pct: 0 },
  ];
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-accent">Achievements</div>
          <h3 className="mt-1 font-display text-2xl text-fg-primary">
            <span className="text-[var(--color-gold)]">24</span> / 39 débloqués
          </h3>
        </div>
        <div className="font-display text-3xl text-[var(--color-gold)] text-glow-gold">
          61%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((a, i) => (
          <div
            key={i}
            className={
              "flex items-center gap-3 rounded-xl p-3 ring-1 transition " +
              (a.unlocked
                ? "bg-white/[0.04] ring-white/[0.1]"
                : "bg-white/[0.02] ring-white/[0.05]")
            }
          >
            <div
              className="grid size-9 shrink-0 place-items-center rounded-lg ring-1"
              style={{
                background: a.unlocked ? `${a.color}22` : "rgba(255,255,255,0.04)",
                borderColor: a.unlocked ? a.color : "rgba(255,255,255,0.06)",
              }}
            >
              {a.unlocked ? (
                <Star className="size-4" style={{ color: a.color }} fill={a.color} strokeWidth={0} />
              ) : (
                <Lock className="size-3.5 text-fg-dim" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={"text-xs font-medium " + (a.unlocked ? "text-fg-primary" : "text-fg-muted")}>
                {a.title}
              </div>
              {!a.unlocked && a.pct !== undefined && a.pct > 0 && (
                <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full bg-accent" style={{ width: `${a.pct}%` }} />
                </div>
              )}
              <div className="mt-0.5 text-[9px] uppercase tracking-wider" style={{ color: a.color }}>
                {a.tier}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="grid h-full grid-cols-[180px_1fr] p-0">
      <div className="flex flex-col gap-0.5 border-r border-white/[0.04] bg-bg-soft/50 p-3">
        <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          Catégories
        </div>
        {[
          { icon: Palette, label: "Apparence", active: true },
          { icon: Sliders, label: "Performance" },
          { icon: User, label: "Comptes" },
          { icon: Bell, label: "Notifications" },
          { icon: Gamepad2, label: "Overlay" },
          { icon: MessageSquare, label: "Diagnostic" },
        ].map((s, i) => (
          <div
            key={i}
            className={
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] " +
              (s.active
                ? "bg-accent/10 text-fg-primary"
                : "text-fg-muted")
            }
          >
            <s.icon className="size-3" />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 overflow-hidden p-5">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-accent">Apparence</div>
          <h3 className="mt-1 font-display text-xl text-fg-primary">
            Couleur d'accent
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            "#00d4ff",
            "#fcd34d",
            "#a855f7",
            "#ff4d8d",
            "#4ade80",
            "#fb923c",
            "#818cf8",
          ].map((c) => (
            <button
              key={c}
              className="size-9 rounded-lg ring-2 ring-offset-2 ring-offset-bg-base transition"
              style={{
                background: c,
                ringColor: c === "#00d4ff" ? c : "transparent",
              } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
          <div>
            <div className="text-sm text-fg-primary">Animations réduites</div>
            <div className="text-xs text-fg-muted">Désactive les transitions</div>
          </div>
          <div className="grid h-6 w-10 place-items-end rounded-full bg-white/[0.08] p-0.5">
            <div className="size-5 rounded-full bg-fg-muted" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-accent/10 p-4 ring-1 ring-accent/20">
          <div>
            <div className="text-sm text-fg-primary">Sons UI Lo-fi</div>
            <div className="text-xs text-fg-muted">Hover, clic, lancement</div>
          </div>
          <div className="grid h-6 w-10 place-items-start rounded-full bg-accent p-0.5">
            <div className="size-5 rounded-full bg-bg-base" />
          </div>
        </div>
      </div>
    </div>
  );
}
