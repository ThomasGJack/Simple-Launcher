import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, FileText, ShieldCheck } from "lucide-react";
import { PlayButton } from "@/components/ui/PlayButton";
import { ANCHORS } from "../lib/anchors";

/**
 * Section 11 — Download CTA. Section large, dégradé radial cyan,
 * gros PlayButton réutilisé du launcher (sons neutralisés via le
 * stub mockSounds aliasé). Affiche la version courante fetched depuis
 * /launcher/versions.json.
 */

type VersionInfo = {
  displayVersion?: string;
  version?: string;
  pub_date?: string;
};

export function DownloadCta() {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch("/launcher/versions.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((arr) => {
        if (Array.isArray(arr) && arr.length > 0) {
          setInfo(arr[0]);
        }
      })
      .catch(() => {
        /* offline / dev — fail silently */
      });
  }, []);

  const display = info?.displayVersion ?? (info?.version ? `v${info.version}` : "v?");
  const date = info?.pub_date
    ? new Date(info.pub_date).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const handleDownload = () => {
    window.location.href = "/download/SimpleLauncher-Setup.exe";
  };

  return (
    <section id={ANCHORS.download} className="section relative overflow-hidden">
      {/* Background radial doré */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 50%, rgba(0,212,255,0.18), transparent 60%), radial-gradient(ellipse 40% 60% at 30% 30%, rgba(252,211,77,0.1), transparent 60%)",
        }}
      />
      {/* Grille discrète */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black 25%, transparent 75%)",
        }}
      />

      <div className="container relative">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="eyebrow eyebrow-gold"
          >
            <span className="eyebrow-dot" />
            Prêt ?
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-5 font-display text-[clamp(36px,6vw,72px)] leading-[1.05] text-fg-primary"
          >
            Rejoins{" "}
            <span
              className="text-glow-gold"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-gold), var(--color-gold-strong))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              le crew.
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-lg text-fg-muted"
          >
            Installer signé, ~5 MB, Windows 10 / 11. Tu rejoins Simple Games
            automatiquement à ton premier login Discord. Auto-update activé.
            Désinstallable proprement à tout moment.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-12 flex flex-col items-center"
          >
            <PlayButton label="TÉLÉCHARGER" onClick={handleDownload} />

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-fg-dim">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="size-3 text-[var(--color-gold)]" />
                {display}
              </span>
              {date && (
                <>
                  <span>·</span>
                  <span>{date}</span>
                </>
              )}
              <span>·</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3 text-success" />
                ed25519 signed
              </span>
              <span>·</span>
              <span>Sans pub · sans tracking · sans abonnement</span>
            </div>

            <a
              href="/changelog.html"
              className="mt-5 inline-flex items-center gap-1.5 text-xs text-fg-muted underline-offset-4 transition hover:text-accent hover:underline"
            >
              <FileText className="size-3" />
              Voir tout l'historique des releases
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
