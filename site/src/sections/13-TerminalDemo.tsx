import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";

/**
 * Section 13 — Terminal "live" qui défile en boucle. Anime un
 * typewriter par caractère sur 4 scénarios représentatifs : install
 * du launcher, login Discord, install d'un modpack, push d'une
 * release Velopack. Démontre concrètement ce qui se passe en
 * coulisse — l'envers du décor du launcher.
 */

type LineType = "com" | "pmt" | "ok" | "err" | "nu" | "str";

type Line = {
  type: LineType;
  text: string;
};

type Scenario = {
  title: string;
  subtitle: string;
  lines: Line[];
};

const SCENARIOS: Scenario[] = [
  {
    title: "Premier lancement",
    subtitle: "L'utilisateur installe le launcher pour la première fois",
    lines: [
      { type: "com", text: "# Bootstrap Velopack — install atomique" },
      { type: "pmt", text: "[setup] Extracting bundle to %LOCALAPPDATA%/SimpleLauncher" },
      { type: "pmt", text: "[setup] Creating Start Menu + Desktop shortcuts" },
      { type: "pmt", text: "[setup] Registering single-instance mutex" },
      { type: "ok", text: "✓ Install done in 2.4s" },
      { type: "com", text: "# Launch + auto-update check" },
      { type: "pmt", text: "[updater] GET https://simplelaunche.web.app/launcher/win/RELEASES" },
      { type: "ok", text: "✓ Already up-to-date · v26.05.06.16" },
      { type: "pmt", text: "[ui] Opening main window · 1280×800" },
    ],
  },
  {
    title: "Login Discord",
    subtitle: "OAuth + auto-membership Simple Games",
    lines: [
      { type: "com", text: "# Discord OAuth — loopback HTTP local" },
      { type: "pmt", text: "[oauth] Opening browser → discord.com/oauth2/authorize" },
      { type: "pmt", text: "[oauth] Listening on http://localhost:14257/callback" },
      { type: "pmt", text: "[oauth] Received code, length 32" },
      { type: "com", text: "# Échange via Cloud Function discordAuth" },
      { type: "pmt", text: "[fn] POST europe-west1/discordAuth" },
      { type: "pmt", text: "[fn] Discord /users/@me OK · id=306118713537462273" },
      { type: "pmt", text: "[fn] Firebase signInWithCustomToken" },
      { type: "ok", text: "✓ Logged in as goule · uid=discord_306118..." },
      { type: "com", text: "# Auto-add to master crew" },
      { type: "pmt", text: "[crews] Adding to master crew \"Simple Games\"" },
      { type: "ok", text: "✓ Bienvenue dans le crew." },
    ],
  },
  {
    title: "Install modpack",
    subtitle: "Vault Hunters — Forge 1.20.1 + 152 mods",
    lines: [
      { type: "com", text: "# User clicks INSTALLER on Vault Hunters" },
      { type: "pmt", text: "[mc-vanilla] Fetch version_manifest_v2.json" },
      { type: "pmt", text: "[mc-vanilla] Download MC 1.20.1 libs · 287 MB" },
      { type: "pmt", text: "[mc-vanilla] Download assets · 1142 / 4267" },
      { type: "ok", text: "✓ Vanilla 1.20.1 installed" },
      { type: "pmt", text: "[mc-forge] Run Forge installer JAR --installClient" },
      { type: "ok", text: "✓ Forge 47.2.0 installed" },
      { type: "pmt", text: "[mc-zip] Stream-extract VaultHunters.zip · 152 mods" },
      { type: "pmt", text: "[mc-zip] Configs / shaderpacks / resourcepacks copied" },
      { type: "ok", text: "✓ Modpack ready · 4.2 GB on disk" },
      { type: "com", text: "# JRE auto-detect via Adoptium" },
      { type: "pmt", text: "[mc-java] Required Java 17 — found Temurin-17.0.11" },
      { type: "ok", text: "✓ Click PLAY anytime." },
    ],
  },
  {
    title: "Push d'une release",
    subtitle: "Pipeline Velopack delta · ~3-5 MB par MAJ",
    lines: [
      { type: "com", text: "# npm run release:launcher" },
      { type: "pmt", text: "[release] Reading [Unreleased] from CHANGELOG.md" },
      { type: "pmt", text: "[release] tauri build --no-bundle · target/release/" },
      { type: "ok", text: "✓ simple-launcher.exe built · 12.4 MB" },
      { type: "pmt", text: "[velopack] vpk pack --packId SimpleLauncher --delta BestSpeed" },
      { type: "pmt", text: "[velopack] Producing full.nupkg · 11.8 MB" },
      { type: "pmt", text: "[velopack] Producing delta.nupkg · 3.2 MB" },
      { type: "pmt", text: "[velopack] Writing RELEASES manifest" },
      { type: "ok", text: "✓ Pack ready in hosting/launcher/win/" },
      { type: "com", text: "# firebase deploy --only hosting" },
      { type: "pmt", text: "[firebase] Uploading 4 new files · 3.5 MB" },
      { type: "ok", text: "✓ Deploy complete · all clients update on next launch" },
    ],
  },
];

const TYPING_SPEED_MS = 18;
const LINE_PAUSE_MS = 80;
const SCENARIO_PAUSE_MS = 2200;

export function TerminalDemo() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "lineDone" | "scenarioDone">(
    "typing",
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const scenario = SCENARIOS[scenarioIdx];
  const currentLine = scenario.lines[lineIdx];
  const renderedLines = scenario.lines.slice(0, lineIdx);
  const currentText = currentLine ? currentLine.text.slice(0, charIdx) : "";

  // Typewriter loop
  useEffect(() => {
    if (phase !== "typing") return;
    if (!currentLine) return;
    if (charIdx >= currentLine.text.length) {
      // Line done — pause then advance
      const t = setTimeout(() => setPhase("lineDone"), LINE_PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCharIdx((c) => c + 1), TYPING_SPEED_MS);
    return () => clearTimeout(t);
  }, [phase, charIdx, currentLine]);

  useEffect(() => {
    if (phase !== "lineDone") return;
    if (lineIdx + 1 < scenario.lines.length) {
      setLineIdx((l) => l + 1);
      setCharIdx(0);
      setPhase("typing");
    } else {
      setPhase("scenarioDone");
    }
  }, [phase, lineIdx, scenario.lines.length]);

  useEffect(() => {
    if (phase !== "scenarioDone") return;
    const t = setTimeout(() => {
      setScenarioIdx((s) => (s + 1) % SCENARIOS.length);
      setLineIdx(0);
      setCharIdx(0);
      setPhase("typing");
    }, SCENARIO_PAUSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Auto-scroll dans la fenêtre terminal au fur et à mesure
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [lineIdx, charIdx]);

  return (
    <section className="section relative overflow-hidden">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            En coulisses
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Ce qui{" "}
            <span className="text-glow-accent text-accent">se passe</span>{" "}
            quand tu cliques.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Quatre scénarios qui tournent en boucle : installation du launcher,
            connexion Discord, install d'un modpack, push d'une release. Tout
            ce qui était en commande manuelle ailleurs, ici c'est juste un
            clic.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto mt-14 max-w-4xl"
        >
          <div className="overflow-hidden rounded-2xl bg-bg-base ring-1 ring-white/[0.08] shadow-[0_30px_120px_-20px_rgba(0,0,0,0.6)]">
            {/* Top bar terminal */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] bg-bg-soft px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-fg-muted">
                <TerminalIcon className="size-3.5" />
                <span>simple-launcher · {scenario.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {SCENARIOS.map((_, i) => (
                  <span
                    key={i}
                    className={
                      "h-1 w-6 rounded-full transition " +
                      (i === scenarioIdx ? "bg-accent" : "bg-white/[0.1]")
                    }
                  />
                ))}
              </div>
            </div>

            {/* Subtitle */}
            <div className="border-b border-white/[0.04] bg-bg-soft/50 px-5 py-2 font-mono text-[11px] text-fg-dim">
              # {scenario.subtitle}
            </div>

            {/* Body */}
            <div
              ref={containerRef}
              className="h-80 overflow-y-auto bg-bg-base px-5 py-4 font-mono text-[13px] leading-[1.7]"
              style={{ scrollBehavior: "smooth" }}
            >
              {renderedLines.map((line, i) => (
                <RenderedLine key={`${scenarioIdx}-${i}`} line={line} />
              ))}
              {currentLine && (
                <RenderedLine
                  line={{ ...currentLine, text: currentText }}
                  cursor={phase === "typing"}
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function RenderedLine({ line, cursor = false }: { line: Line; cursor?: boolean }) {
  const colorMap: Record<LineType, string> = {
    com: "text-fg-dim",
    pmt: "text-accent",
    ok: "text-success",
    err: "text-danger",
    nu: "text-[var(--color-gold)]",
    str: "text-[var(--color-gold)]",
  };
  return (
    <div className={colorMap[line.type]}>
      {line.text}
      {cursor && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent" />}
    </div>
  );
}
