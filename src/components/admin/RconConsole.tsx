import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Send, Unplug, X, Loader2, TerminalSquare } from "lucide-react";
import { rconClose, rconConnect, rconSend } from "@/lib/rcon";
import { sounds } from "@/lib/sounds";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/cn";

/**
 * Admin-only RCON console for a Minecraft server. Uses the Source RCON
 * protocol implemented in `src-tauri/src/rcon.rs`. Connection details are
 * cached per-server in localStorage so the admin doesn't have to retype
 * them on every session.
 *
 * The password is stored in plain localStorage — fine since the launcher
 * is single-user-per-machine and the secret never leaves the local box.
 * We do NOT store it in Firestore (where it would be readable by every
 * authed user via the modules collection rules).
 */
type LogEntry = {
  id: number;
  kind: "in" | "out" | "system";
  text: string;
  ts: number;
};

export function RconConsoleModal({
  serverHost,
  serverDisplayName,
  open,
  onClose,
}: {
  /** TCP host of the Minecraft server (without port). Pulled from
   *  `module.server.address` minus the trailing port if any. */
  serverHost: string;
  /** Human-readable label shown in the modal title. */
  serverDisplayName: string;
  open: boolean;
  onClose: () => void;
}) {
  const lsKey = `rcon-prefs:${serverHost}`;
  const [port, setPort] = useState<string>(() => readPref(lsKey, "port") ?? "25575");
  const [password, setPassword] = useState<string>(() => readPref(lsKey, "password") ?? "");
  const [rememberPassword, setRememberPassword] = useState<boolean>(
    () => readPref(lsKey, "remember") === "1",
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sending, setSending] = useState(false);
  const logIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new log lines arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const appendLog = (kind: LogEntry["kind"], text: string) => {
    setLogs((prev) => [
      ...prev,
      { id: ++logIdRef.current, kind, text, ts: Date.now() },
    ]);
  };

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    appendLog("system", `→ Connexion RCON ${serverHost}:${port}…`);
    try {
      const id = await rconConnect(serverHost, parseInt(port, 10), password);
      setSessionId(id);
      appendLog("system", `✓ Authentifié — RCON prêt.`);
      // Persist preferences for next time (password optional)
      writePref(lsKey, "port", port);
      writePref(lsKey, "remember", rememberPassword ? "1" : "0");
      writePref(lsKey, "password", rememberPassword ? password : "");
      logger.action("RCON connected", {
        source: "RconConsole",
        metadata: { host: serverHost, port: parseInt(port, 10) },
      });
      sounds.success();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      appendLog("system", `✗ Échec : ${msg}`);
      sounds.error();
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!sessionId) return;
    try {
      await rconClose(sessionId);
    } catch {
      /* ignore */
    }
    setSessionId(null);
    appendLog("system", `→ Déconnecté`);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cmd = draft.trim();
    if (!cmd || !sessionId || sending) return;
    setDraft("");
    setSending(true);
    appendLog("in", cmd);
    try {
      const resp = await rconSend(sessionId, cmd);
      const body = resp.body || "(réponse vide)";
      appendLog("out", body);
      logger.action(`RCON command sent: ${cmd.slice(0, 40)}${cmd.length > 40 ? "…" : ""}`, {
        source: "RconConsole",
        metadata: { host: serverHost, cmdLength: cmd.length },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog("system", `✗ ${msg}`);
      // If the session died, drop the id so the user can reconnect
      if (msg.includes("introuvable") || msg.includes("Timeout")) {
        setSessionId(null);
      }
    } finally {
      setSending(false);
    }
  };

  // Auto-disconnect if the modal is closed
  useEffect(() => {
    if (!open && sessionId) {
      void handleDisconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/70 backdrop-blur-md p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl glass-strong ring-1 ring-accent/30"
          >
            <header className="flex items-center gap-3 border-b border-white/[0.04] bg-bg-soft/40 px-5 py-3">
              <div className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                <TerminalSquare className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-fg-primary">
                  Console RCON · {serverDisplayName}
                </div>
                <div className="font-mono text-[10px] text-fg-dim">
                  {serverHost}:{port} {sessionId ? "· connecté" : "· déconnecté"}
                </div>
              </div>
              {sessionId && (
                <button
                  onClick={handleDisconnect}
                  className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/20 transition-colors"
                >
                  <Unplug className="size-3.5" /> Déconnecter
                </button>
              )}
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </header>

            {!sessionId ? (
              // Connect form
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
                <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
                  <Lock className="size-6" />
                </div>
                <h3 className="font-display text-xl text-fg-primary">Authentification RCON</h3>
                <p className="max-w-sm text-center text-xs text-fg-muted">
                  Renseigne le port RCON (défini dans <code className="font-mono">server.properties</code> sur le serveur) et le mot de passe pour ouvrir une session console.
                </p>
                {error && (
                  <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-500/30">
                    {error}
                  </div>
                )}
                <div className="mt-2 grid w-full max-w-sm gap-2">
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="25575"
                    className="no-drag rounded-xl bg-bg-base/50 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe RCON"
                    className="no-drag rounded-xl bg-bg-base/50 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleConnect();
                    }}
                  />
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      checked={rememberPassword}
                      onChange={(e) => setRememberPassword(e.target.checked)}
                      className="size-3.5 cursor-pointer accent-cyan-400"
                    />
                    Se souvenir du mot de passe (stocké localement)
                  </label>
                  <button
                    onClick={handleConnect}
                    disabled={connecting || !password}
                    className={cn(
                      "no-drag mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-shadow",
                      connecting || !password
                        ? "bg-white/[0.04] text-fg-dim cursor-not-allowed"
                        : "bg-accent text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]",
                    )}
                  >
                    {connecting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                    {connecting ? "Connexion…" : "Se connecter"}
                  </button>
                </div>
              </div>
            ) : (
              // Connected — log + input
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto bg-bg-base/40 p-4 font-mono text-[11px] leading-relaxed [scrollbar-width:thin]"
                >
                  {logs.length === 0 ? (
                    <div className="text-fg-dim">
                      Tape une commande Minecraft (sans le `/`) — ex: <span className="text-accent">list</span>, <span className="text-accent">say Hello</span>, <span className="text-accent">whitelist add Notch</span>.
                    </div>
                  ) : (
                    logs.map((entry) => <LogLine key={entry.id} entry={entry} />)
                  )}
                </div>
                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-2 border-t border-white/[0.04] bg-bg-soft/40 px-3 py-2"
                >
                  <span className="font-mono text-xs text-accent">&gt;</span>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Commande RCON…"
                    disabled={sending}
                    className="no-drag w-full bg-transparent font-mono text-sm text-fg-primary placeholder:text-fg-dim focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className={cn(
                      "no-drag grid size-8 shrink-0 place-items-center rounded-lg transition-shadow",
                      draft.trim() && !sending
                        ? "bg-accent text-bg-base shadow-[0_0_14px_var(--color-accent-soft)]"
                        : "bg-white/[0.04] text-fg-dim",
                    )}
                  >
                    {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (entry.kind === "in") {
    return (
      <div className="text-accent">
        <span className="text-fg-dim">[{time}]</span> &gt; {entry.text}
      </div>
    );
  }
  if (entry.kind === "out") {
    return (
      <div className="whitespace-pre-wrap text-fg-primary">
        <span className="text-fg-dim">[{time}]</span> {entry.text}
      </div>
    );
  }
  return (
    <div className="italic text-amber-300">
      <span className="text-fg-dim">[{time}]</span> {entry.text}
    </div>
  );
}

function readPref(key: string, sub: string): string | null {
  try {
    return localStorage.getItem(`${key}:${sub}`);
  } catch {
    return null;
  }
}

function writePref(key: string, sub: string, value: string) {
  try {
    if (value) localStorage.setItem(`${key}:${sub}`, value);
    else localStorage.removeItem(`${key}:${sub}`);
  } catch {
    /* ignore */
  }
}
