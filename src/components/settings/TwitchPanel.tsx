import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Radio, Check, X, ExternalLink, Loader2, KeyRound } from "lucide-react";
import {
  connectTwitch,
  disconnectTwitch,
  loadStoredTwitchConfig,
  type TwitchUserInfo,
} from "@/lib/twitchAuth";
import { sounds } from "@/lib/sounds";

/**
 * Panel Settings pour connecter un compte Twitch. Le user colle son
 * Client ID + User Access Token, on valide via /helix/users, on
 * persiste en localStorage + state Rust.
 *
 * Pas d'OAuth flow auto — le user obtient le token manuellement via
 * twitchtokengenerator.com (scope `channel:manage:broadcast`).
 */
export function TwitchPanel() {
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState<TwitchUserInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredTwitchConfig();
    if (stored) {
      setClientId(stored.clientId);
      setToken(stored.accessToken);
      // On affiche un état "connecté précédemment" — la vraie
      // validation (qui appelle Twitch /users) est différée tant que
      // le user ne clique pas. Au cas où le token soit expiré, on
      // évite un round-trip réseau silencieux au mount.
      setConnected({
        userId: stored.broadcasterId,
        login: "",
        displayName: "Connecté",
      });
    }
  }, []);

  const handleConnect = async () => {
    if (!clientId.trim() || !token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await connectTwitch(clientId.trim(), token.trim());
      setConnected(user);
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
      await disconnectTwitch();
      setConnected(null);
      setClientId("");
      setToken("");
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
        <div className="grid size-10 place-items-center rounded-xl bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30">
          <Radio className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-fg-primary">Twitch</h3>
          <p className="text-xs text-fg-muted">
            Met à jour le titre de ton stream quand tu lances un module.
          </p>
        </div>
        {connected && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-success/30">
            <Check className="size-3" /> {connected.displayName}
          </span>
        )}
      </header>

      {connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            Le titre de ton stream sera modifié automatiquement à chaque fois
            que tu lances un module dans le launcher.
          </p>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="self-start rounded-lg bg-danger/15 px-4 py-2 text-sm font-medium text-danger ring-1 ring-danger/30 hover:bg-danger/20 disabled:opacity-50"
          >
            <X className="mr-1.5 inline size-3.5" /> Déconnecter Twitch
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-bg-base/40 p-3 text-xs leading-relaxed text-fg-muted ring-1 ring-white/[0.04]">
            <strong className="text-fg-primary">Setup en 3 étapes :</strong>
            <ol className="mt-2 list-inside list-decimal space-y-1.5">
              <li>
                Crée une appli sur{" "}
                <a
                  href="https://dev.twitch.tv/console/apps/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  dev.twitch.tv/console
                  <ExternalLink className="ml-0.5 inline size-3" />
                </a>{" "}
                pour récupérer un <strong>Client ID</strong>.
              </li>
              <li>
                Génère un User Access Token avec le scope{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-accent">
                  channel:manage:broadcast
                </code>{" "}
                via{" "}
                <a
                  href="https://twitchtokengenerator.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  twitchtokengenerator.com
                  <ExternalLink className="ml-0.5 inline size-3" />
                </a>
                .
              </li>
              <li>Colle les deux ci-dessous + clique « Connecter ».</li>
            </ol>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Client ID
            </label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="abcd1234..."
              className="w-full rounded-lg bg-bg-base/60 px-3 py-2 font-mono text-xs text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              User Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="oauth-token..."
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
            disabled={!clientId.trim() || !token.trim() || busy}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {busy ? "Test en cours…" : "Connecter Twitch"}
          </button>
        </div>
      )}
    </motion.section>
  );
}
