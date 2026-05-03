import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cog,
  Palette,
  Volume2,
  VolumeX,
  FolderDown,
  Tag,
  FileText,
  UploadCloud,
  Loader2,
  Check,
  Gamepad2,
  LogIn,
  LogOut,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "@/store/settings";
import { sounds } from "@/lib/sounds";
import { formatDisplay } from "@/lib/version";
import { logger } from "@/lib/logger";
import {
  mcAuthList,
  mcAuthLogin,
  mcAuthLogout,
  mcAuthRefresh,
  mcAuthFallbackStart,
  mcAuthFallbackComplete,
  isAccountExpiringSoon,
  avatarUrls,
  type McAccount,
} from "@/lib/mcAuth";
import { cn } from "@/lib/cn";
import { DiagnosticModal } from "@/components/settings/DiagnosticModal";

export function SettingsPage() {
  const { soundsEnabled, toggleSounds } = useSettingsStore();
  const [versionDisplay, setVersionDisplay] = useState<string>("…");
  const [diagOpen, setDiagOpen] = useState(false);

  useEffect(() => {
    getVersion()
      .then((v) => setVersionDisplay(formatDisplay(v)))
      .catch(() => setVersionDisplay("?"));
  }, []);

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Paramètres</p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Configuration</h1>
      </motion.div>

      <div className="grid max-w-3xl gap-4">
        <SettingToggle
          icon={soundsEnabled ? Volume2 : VolumeX}
          title="Sons d'interface"
          description="Petits effets audio sur les boutons, hover, lancement et notifications."
          value={soundsEnabled}
          onToggle={() => {
            toggleSounds();
            if (!soundsEnabled) {
              setTimeout(() => sounds.success(), 60);
            }
          }}
        />
        <SettingCard
          icon={Palette}
          title="Apparence"
          description="Thème global, couleurs d'accent, animations."
          status="Bientôt"
        />
        <SettingCard
          icon={FolderDown}
          title="Téléchargements"
          description="Dossier d'installation des jeux, limite de bande passante."
          status="Bientôt"
        />
        <LogsDiagnosticCard />
        <SettingButton
          icon={Stethoscope}
          title="Diagnostic système"
          description="OS, CPU, GPU, RAM libre, espace disque, Java détecté, VC++ runtimes. Utile pour debug rapidement les problèmes de lancement."
          buttonLabel="Ouvrir"
          onClick={() => {
            sounds.click();
            setDiagOpen(true);
          }}
        />
        <MinecraftAccountsCard />

        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/[0.04]">
          <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
            <Tag className="size-4" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-fg-dim">Version</div>
            <div className="font-mono text-sm text-fg-primary">{versionDisplay}</div>
          </div>
        </div>
      </div>

      <DiagnosticModal open={diagOpen} onClose={() => setDiagOpen(false)} />
    </div>
  );
}

function SettingButton({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: typeof Cog;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="no-drag flex items-start gap-4 rounded-2xl glass p-5"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-fg-primary">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="self-center rounded-xl bg-accent/15 px-4 py-2 text-xs font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/25"
      >
        {buttonLabel}
      </button>
    </motion.div>
  );
}

function SettingToggle({
  icon: Icon,
  title,
  description,
  value,
  onToggle,
}: {
  icon: typeof Cog;
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="no-drag flex items-center gap-4 rounded-2xl glass p-5"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-fg-primary">{title}</div>
        <div className="text-sm text-fg-muted">{description}</div>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={value}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ring-1",
          value ? "bg-accent/30 ring-accent/40 shadow-[0_0_18px_var(--color-accent-soft)]" : "bg-white/[0.06] ring-white/[0.08]",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "absolute top-0.5 size-6 rounded-full",
            value ? "left-[calc(100%-1.625rem)] bg-accent shadow-[0_0_10px_var(--color-accent-glow)]" : "left-0.5 bg-fg-muted",
          )}
        />
      </button>
    </motion.div>
  );
}

function LogsDiagnosticCard() {
  const [diag, setDiag] = useState(logger.diagnostics());
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setDiag(logger.diagnostics()), 1500);
    return () => clearInterval(t);
  }, []);

  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      await logger.uploadNow();
      setJustUploaded(true);
      sounds.success();
      setTimeout(() => setJustUploaded(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setUploading(false);
      setDiag(logger.diagnostics());
    }
  };

  const lastUpload = diag.lastUploadedAt
    ? new Date(diag.lastUploadedAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "jamais";

  return (
    <motion.div whileHover={{ x: 4 }} className="no-drag flex items-start gap-4 rounded-2xl glass p-5">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <FileText className="size-5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-fg-primary">Logs & diagnostic</div>
        <div className="text-sm text-fg-muted">
          Le launcher écrit un fichier `.sl_logs` à chaque session, uploadé sur les serveurs toutes les 4 h. Tu peux forcer l'envoi maintenant si l'admin a besoin d'un debug rapide.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <DiagPill label="Lignes" value={String(diag.totalLines)} />
          <DiagPill label="Dernier upload" value={lastUpload} />
          <DiagPill label="Session" value={diag.sessionId.slice(0, 8)} mono />
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading || !diag.uid}
        className={cn(
          "no-drag inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
          justUploaded
            ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
            : "bg-accent/15 text-accent ring-1 ring-accent/30 hover:bg-accent/25",
        )}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : justUploaded ? (
          <Check className="size-4" />
        ) : (
          <UploadCloud className="size-4" />
        )}
        {justUploaded ? "Envoyé !" : uploading ? "Envoi…" : "Envoyer mes logs"}
      </button>
    </motion.div>
  );
}

function DiagPill({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-bg-base/40 px-2.5 py-1 ring-1 ring-white/[0.06]">
      <span className="uppercase tracking-wider text-fg-dim">{label}</span>
      <span className={cn("text-fg-primary", mono && "font-mono normal-case tracking-normal")}>
        {value}
      </span>
    </span>
  );
}

function SettingCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof Cog;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="no-drag flex items-center gap-4 rounded-2xl glass p-5"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-fg-primary">{title}</div>
        <div className="text-sm text-fg-muted">{description}</div>
      </div>
      {status && (
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-fg-muted ring-1 ring-white/[0.06]">
          {status}
        </span>
      )}
    </motion.div>
  );
}

/**
 * Renders a Minecraft player's head from one of several avatar services,
 * falling back to the next on load error. Crafatar is sometimes flaky /
 * rate-limited from Tauri's webview origin, so we try mc-heads.net and
 * minotar.net first. If all fail, shows a placeholder square with the
 * player's first initial — the UI never breaks visually.
 */
function McHeadAvatar({ uuid, size = 40 }: { uuid: string; size?: number }) {
  const sources = useMemo(() => avatarUrls(uuid, size * 2), [uuid, size]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-lg bg-emerald-400/15 text-xs font-bold text-emerald-300 ring-1 ring-white/[0.06]"
        style={{ width: size, height: size }}
      >
        {uuid.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      key={sources[index]}
      src={sources[index]}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-lg ring-1 ring-white/[0.06]"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      referrerPolicy="no-referrer"
      onError={() => {
        if (index + 1 < sources.length) {
          setIndex(index + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/**
 * Minecraft accounts card — lets the user connect a Microsoft account
 * via OAuth and see the resulting Mojang profile (UUID + player name).
 *
 * For the dev iteration this lives in Settings. Once the native
 * Minecraft launcher path is wired (Phase 7+ of the integration plan),
 * the per-account expiry chip + refresh action stay relevant; the
 * "Connect" button can be promoted next to each Minecraft module's
 * Play button.
 */
function MinecraftAccountsCard() {
  const [accounts, setAccounts] = useState<McAccount[] | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [fallbackBusy, setFallbackBusy] = useState(false);

  // Tick every 30 s so the "expires in X" chip stays fresh without
  // re-polling Tauri.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refreshList = async () => {
    try {
      const list = await mcAuthList();
      setAccounts(list);
    } catch (err) {
      console.warn("[mc-auth] list failed:", err);
      setAccounts([]);
    }
  };

  useEffect(() => {
    void refreshList();
  }, []);

  const handleLogin = async () => {
    setError(null);
    setLoggingIn(true);
    try {
      sounds.click();
      const account = await mcAuthLogin();
      logger.action("Minecraft account connected", {
        source: "SettingsPage.mc-auth",
        metadata: { uuid: account.uuid, playerName: account.playerName },
      });
      sounds.success();
      await refreshList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      logger.warn(`Minecraft login failed: ${msg}`, { source: "SettingsPage.mc-auth" });
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRefresh = async (uuid: string) => {
    setBusyUuid(uuid);
    setError(null);
    try {
      sounds.click();
      await mcAuthRefresh(uuid);
      await refreshList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusyUuid(null);
    }
  };

  const handleLogout = async (uuid: string) => {
    if (!confirm("Déconnecter ce compte Minecraft ?")) return;
    setBusyUuid(uuid);
    try {
      sounds.click();
      await mcAuthLogout(uuid);
      await refreshList();
    } catch (err) {
      console.warn("[mc-auth] logout failed:", err);
    } finally {
      setBusyUuid(null);
    }
  };

  const handleFallbackOpen = async () => {
    setError(null);
    setFallbackUrl("");
    setFallbackOpen(true);
    try {
      sounds.click();
      await mcAuthFallbackStart();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const handleFallbackSubmit = async () => {
    if (!fallbackUrl.trim()) return;
    setFallbackBusy(true);
    setError(null);
    try {
      const account = await mcAuthFallbackComplete(fallbackUrl.trim());
      logger.action("Minecraft account connected (fallback)", {
        source: "SettingsPage.mc-auth-fallback",
        metadata: { uuid: account.uuid, playerName: account.playerName },
      });
      sounds.success();
      await refreshList();
      setFallbackOpen(false);
      setFallbackUrl("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setFallbackBusy(false);
    }
  };

  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="no-drag rounded-2xl glass p-5"
    >
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
          <Gamepad2 className="size-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-fg-primary">Comptes Minecraft</div>
            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
              Bêta
            </span>
          </div>
          <div className="text-sm text-fg-muted">
            Connecte ton compte Microsoft pour lancer Minecraft.
            La fenêtre Microsoft s'ouvre dans ton navigateur — tes
            identifiants ne transitent jamais par le launcher.
          </div>
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="flex gap-2 rounded-xl bg-danger/10 p-3 text-xs text-danger ring-1 ring-danger/30">
              <AlertTriangle className="size-4 shrink-0" />
              <div className="min-w-0 flex-1 break-words">{error}</div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs text-danger/70 hover:text-danger"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accounts list */}
      {accounts === null ? (
        <div className="mt-4 grid h-16 place-items-center text-fg-dim">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/[0.08] p-4 text-center text-sm text-fg-dim">
          Aucun compte connecté.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {accounts.map((acc) => {
            const expiringSoon = isAccountExpiringSoon(acc);
            const expired = acc.expiresAt < Date.now();
            return (
              <div
                key={acc.uuid}
                className="flex items-center gap-3 rounded-xl bg-bg-elevated/40 p-3 ring-1 ring-white/[0.04]"
              >
                <McHeadAvatar uuid={acc.uuid} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg-primary">
                    {acc.playerName}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <ShieldCheck className="size-3 text-emerald-400" />
                    <span className="font-mono text-fg-dim">
                      {acc.uuid.slice(0, 8)}…
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 ring-1",
                        expired
                          ? "bg-danger/10 text-danger ring-danger/30"
                          : expiringSoon
                            ? "bg-amber-400/10 text-amber-300 ring-amber-400/30"
                            : "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
                      )}
                    >
                      {expired
                        ? "Expiré"
                        : expiringSoon
                          ? "Expire bientôt"
                          : "Actif"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyUuid === acc.uuid}
                  onClick={() => handleRefresh(acc.uuid)}
                  className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary disabled:opacity-40"
                  title="Rafraîchir le token"
                >
                  {busyUuid === acc.uuid ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={busyUuid === acc.uuid}
                  onClick={() => handleLogout(acc.uuid)}
                  className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-danger/15 hover:text-danger disabled:opacity-40"
                  title="Déconnecter"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Login buttons (primary + fallback) */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleLogin}
          disabled={loggingIn}
          className={cn(
            "no-drag inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
            "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30",
            "hover:bg-emerald-400/25 hover:shadow-[0_0_18px_rgba(74,222,128,0.3)]",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {loggingIn ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Connexion en cours dans le navigateur…
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              Connecter un compte Microsoft
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleFallbackOpen}
          disabled={loggingIn}
          title="Utilise le client_id Mojang (mode secours, en attendant l'allowlist Mojang)"
          className={cn(
            "no-drag inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors",
            "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30",
            "hover:bg-amber-400/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          <AlertTriangle className="size-3.5" />
          Mode secours (Mojang)
        </button>
      </div>

      {/* Fallback paste-URL modal */}
      <AnimatePresence>
        {fallbackOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-bg-base/80 backdrop-blur-sm p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget && !fallbackBusy) setFallbackOpen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="no-drag w-full max-w-2xl rounded-2xl bg-bg-soft p-6 ring-1 ring-amber-400/30 shadow-[0_0_60px_rgba(251,191,36,0.2)]"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 shrink-0 text-amber-300 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-xl text-fg-primary">
                    Mode secours — client_id Mojang
                  </h3>
                  <p className="mt-1 text-sm text-fg-muted">
                    Utilisé pendant que ton app Azure attend l'allowlist Mojang.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-bg-base/40 p-4 text-sm text-fg-primary/90 ring-1 ring-white/[0.06]">
                <p className="mb-2 font-medium text-fg-primary">Marche à suivre :</p>
                <ol className="ml-5 list-decimal space-y-1.5 text-fg-muted">
                  <li>Une fenêtre de connexion Microsoft s'est ouverte dans ton navigateur</li>
                  <li>Connecte-toi avec ton compte (le browser t'amène sur une page <code className="rounded bg-bg-elevated px-1 text-xs">login.live.com/oauth20_desktop.srf?…</code>)</li>
                  <li>Une fois sur cette page (qui dit « Let's get you signed in » ou affiche un texte vide), <strong>copie l'URL complète</strong> de la barre d'adresse</li>
                  <li>Colle-la ci-dessous et clique « Valider »</li>
                </ol>
              </div>

              <div className="mt-4">
                <label className="text-xs uppercase tracking-wider text-fg-muted">
                  URL après connexion
                </label>
                <textarea
                  value={fallbackUrl}
                  onChange={(e) => setFallbackUrl(e.target.value)}
                  placeholder="https://login.live.com/oauth20_desktop.srf?code=M.R3_BAY..."
                  rows={3}
                  className="mt-1.5 w-full rounded-xl bg-bg-base/60 px-3 py-2 text-xs font-mono text-fg-primary ring-1 ring-white/[0.08] focus:ring-amber-400/50 focus:outline-none"
                  disabled={fallbackBusy}
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFallbackOpen(false)}
                  disabled={fallbackBusy}
                  className="rounded-xl px-4 py-2 text-sm text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary disabled:opacity-40"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleFallbackSubmit}
                  disabled={fallbackBusy || !fallbackUrl.trim()}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium",
                    "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40",
                    "hover:bg-amber-400/30",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {fallbackBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Authentification…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" />
                      Valider
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
