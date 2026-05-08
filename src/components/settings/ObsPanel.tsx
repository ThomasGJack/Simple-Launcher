import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cast, Check, X, ExternalLink, Loader2, Plug } from "lucide-react";
import {
  connectObs,
  disconnectObs,
  loadStoredObsConfig,
} from "@/lib/obsBridge";
import { sounds } from "@/lib/sounds";

/**
 * Panel Settings pour configurer la connexion OBS Studio. Le user
 * fournit l'URL WebSocket (default ws://localhost:4455) et un mot de
 * passe optionnel.
 *
 * Côté streamer : ajouter une browser source dans OBS qui pointe vers
 * https://simplelaunche.web.app/obs-overlay.html — la page écoute les
 * events broadcast et affiche les overlays (achievement débloqué,
 * friend online, etc.).
 */
export function ObsPanel() {
  const [url, setUrl] = useState("ws://localhost:4455");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredObsConfig();
    if (stored) {
      setUrl(stored.url);
      setPassword(stored.password);
      setConnected(true);
    }
  }, []);

  const handleConnect = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await connectObs(url.trim(), password);
      setConnected(true);
      sounds.success();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectObs();
      setConnected(false);
      sounds.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30">
          <Cast className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-fg-primary">OBS Studio</h3>
          <p className="text-xs text-fg-muted">
            Affiche l'activité du crew en overlay sur ton stream.
          </p>
        </div>
        {connected && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-success/30">
            <Check className="size-3" /> Connecté
          </span>
        )}
      </header>

      {connected ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-bg-base/40 p-3 text-xs leading-relaxed text-fg-muted ring-1 ring-white/[0.04]">
            <strong className="text-fg-primary">Configurer l'overlay côté OBS :</strong>
            <ol className="mt-2 list-inside list-decimal space-y-1.5">
              <li>
                Dans OBS Studio, ajoute une <strong>Browser source</strong>.
              </li>
              <li>
                URL :{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-accent">
                  https://simplelaunche.web.app/obs-overlay.html
                </code>
              </li>
              <li>Largeur 1920 × hauteur 1080. Refresh à chaque scène.</li>
            </ol>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="self-start rounded-lg bg-danger/15 px-4 py-2 text-sm font-medium text-danger ring-1 ring-danger/30 hover:bg-danger/20 disabled:opacity-50"
          >
            <X className="mr-1.5 inline size-3.5" /> Déconnecter OBS
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-bg-base/40 p-3 text-xs leading-relaxed text-fg-muted ring-1 ring-white/[0.04]">
            <strong className="text-fg-primary">Setup côté OBS :</strong> installer
            le plugin <strong>obs-websocket</strong> (intégré nativement à OBS
            28+). Outils → "WebSocket Server Settings" → activer + définir un
            mot de passe (optionnel mais recommandé). Port par défaut 4455.
            <a
              href="https://github.com/obsproject/obs-websocket"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-accent underline-offset-2 hover:underline"
            >
              Doc
              <ExternalLink className="ml-0.5 inline size-3" />
            </a>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              URL WebSocket
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ws://localhost:4455"
              className="w-full rounded-lg bg-bg-base/60 px-3 py-2 font-mono text-xs text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Mot de passe (optionnel)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Laisser vide si pas configuré"
              className="w-full rounded-lg bg-bg-base/60 px-3 py-2 font-mono text-xs text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={!url.trim() || busy}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(59,130,246,0.3)] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plug className="size-4" />
            )}
            {busy ? "Connexion…" : "Connecter à OBS"}
          </button>
        </div>
      )}
    </motion.section>
  );
}
