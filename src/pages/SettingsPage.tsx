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
  Star,
  Layers,
  Keyboard,
  Bell,
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
  getDefaultMcUuid,
  setDefaultMcUuid,
  type McAccount,
} from "@/lib/mcAuth";
import { cn } from "@/lib/cn";
import { useTickEvery } from "@/hooks/useTickEvery";
import { DiagnosticModal } from "@/components/settings/DiagnosticModal";
import { ScrollMemoryRoot } from "@/hooks/ScrollMemoryRoot";
import {
  DEFAULT_OVERLAY_HOTKEY,
  bootOverlayHotkey,
  getOverlayEnabled,
  getSavedOverlayHotkey,
  setOverlayEnabled,
  setOverlayHotkey,
  showOverlay,
  unregisterOverlayHotkey,
} from "@/lib/overlay";
import {
  getToastsEnabled,
  getToastsKindEnabled,
  setToastsEnabled,
  setToastsKindEnabled,
  TOAST_KIND_LABEL,
  type ToastKind,
} from "@/lib/toasts";
import {
  getNativeNotifsEnabled,
  getNativeNotifKind,
  setNativeNotifsEnabled,
  setNativeNotifKind,
  NOTIF_KIND_LABEL,
  type NotifKind,
} from "@/lib/notificationPrefs";

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
    <ScrollMemoryRoot routeKey="settings" className="p-12">
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
        <ApparenceCard />
        <NotificationsCard />
        <OverlayCard />
        <DownloadsCard />
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
    </ScrollMemoryRoot>
  );
}

function ApparenceCard() {
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const toggleAnimations = useSettingsStore((s) => s.toggleAnimations);
  const resetApparence = useSettingsStore((s) => s.resetApparence);
  const [customOpen, setCustomOpen] = useState(false);

  // Curated accent palette — 6 presets that all read well on the dark
  // background. Custom hex via the swatch at the end.
  const presets: { name: string; hex: string }[] = [
    { name: "Cyan (défaut)", hex: "#00d4ff" },
    { name: "Violet", hex: "#a855f7" },
    { name: "Rose", hex: "#ff4d8d" },
    { name: "Vert", hex: "#22c55e" },
    { name: "Ambre", hex: "#fbbf24" },
    { name: "Rouge", hex: "#ef4444" },
  ];

  const isDefault = accentColor === null;
  const activeHex = accentColor ?? "#00d4ff";

  return (
    <motion.div whileHover={{ x: 4 }} className="no-drag rounded-2xl glass p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
          <Palette className="size-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-fg-primary">Apparence</div>
            {!isDefault || !animationsEnabled ? (
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/30">
                Personnalisé
              </span>
            ) : null}
          </div>
          <div className="text-sm text-fg-muted">
            Couleur d'accent et animations. Sauvegardé localement, par machine.
          </div>
        </div>
        {(!isDefault || !animationsEnabled) && (
          <button
            type="button"
            onClick={() => {
              sounds.click();
              resetApparence();
              setCustomOpen(false);
            }}
            className="self-start rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
            title="Revenir aux valeurs par défaut"
          >
            Reset
          </button>
        )}
      </div>

      {/* Accent color picker */}
      <div className="mt-5">
        <div className="mb-2 text-xs uppercase tracking-wider text-fg-dim">
          Couleur d'accent
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => {
            const active =
              (isDefault && p.hex === "#00d4ff") || accentColor === p.hex;
            return (
              <button
                key={p.hex}
                type="button"
                onClick={() => {
                  sounds.click();
                  setAccentColor(p.hex === "#00d4ff" ? null : p.hex);
                }}
                title={p.name}
                className={cn(
                  "relative size-8 rounded-full ring-2 transition-all",
                  active
                    ? "ring-fg-primary scale-110 shadow-[0_0_12px_currentColor]"
                    : "ring-white/[0.08] hover:ring-white/[0.2]",
                )}
                style={{
                  backgroundColor: p.hex,
                  color: p.hex,
                }}
              >
                {active && (
                  <Check className="absolute inset-0 m-auto size-4 text-bg-base" strokeWidth={3} />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="ml-1 inline-flex items-center gap-1 rounded-lg bg-white/[0.03] px-2.5 py-1 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.06] hover:text-fg-primary"
            title="Couleur custom (hex)"
          >
            #
          </button>
        </div>

        {customOpen && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={activeHex}
              onChange={(e) => setAccentColor(e.target.value)}
              className="size-9 cursor-pointer rounded-md bg-transparent ring-1 ring-white/[0.08]"
            />
            <input
              type="text"
              value={activeHex}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  setAccentColor(v);
                }
              }}
              placeholder="#00d4ff"
              maxLength={7}
              className="w-32 rounded-lg bg-bg-base/60 px-3 py-1.5 font-mono text-sm text-fg-primary ring-1 ring-white/[0.08] focus:outline-none focus:ring-accent/50"
            />
            <span className="text-xs text-fg-dim">
              Format hex 6 chars (#RRGGBB)
            </span>
          </div>
        )}
      </div>

      {/* Animations toggle */}
      <div className="mt-5 flex items-center justify-between rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
        <div className="flex-1">
          <div className="text-sm text-fg-primary">Animations</div>
          <div className="text-xs text-fg-muted">
            Désactive transitions, animations Framer Motion et keyframes CSS.
            Recommandé sur PC peu puissant ou si tu es sensible aux animations.
          </div>
        </div>
        <div className="ml-4">
          <Toggle
            value={animationsEnabled}
            onToggle={() => {
              sounds.click();
              toggleAnimations();
            }}
            ariaLabel="Activer les animations"
          />
        </div>
      </div>
    </motion.div>
  );
}

function DownloadsCard() {
  // Async-loaded from Rust to avoid blocking the page on big disk
  // walks. The user clicks "Calculer" to populate, otherwise we just
  // show the cache categories statically (so the UI is never empty).
  const [snapshot, setSnapshot] = useState<import("@/lib/cache").CacheSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await import("@/lib/cache");
      const data = await m.cacheCalculateSize();
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const purge = async (category: import("@/lib/cache").CacheCategory) => {
    if (
      !confirm(
        `Vider le cache "${category}" ?\n\nLes fichiers seront re-téléchargés au prochain lancement Minecraft. Tes saves et tes mods ne sont PAS touchés.`,
      )
    )
      return;
    setBusy(category);
    setError(null);
    try {
      const m = await import("@/lib/cache");
      await m.cachePurge(category);
      sounds.success();
      await calculate();
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fmt = (b: number) => {
    if (b <= 0) return "—";
    const gb = b / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(1)} Go`;
    const mb = b / 1024 ** 2;
    if (mb >= 1) return `${mb.toFixed(0)} Mo`;
    return `${(b / 1024).toFixed(0)} Ko`;
  };

  const categories: { id: import("@/lib/cache").CacheCategory; label: string; hint: string }[] = [
    {
      id: "mc-libraries",
      label: "Libraries Java partagées",
      hint: "LWJGL, Forge/Fabric, deps Mojang. Re-DL au prochain launch.",
    },
    {
      id: "mc-assets",
      label: "Assets Minecraft (textures, sons)",
      hint: "Re-DL au prochain launch — gros (~500 Mo).",
    },
    {
      id: "mc-runtimes",
      label: "Runtimes Java téléchargés",
      hint: "Adoptium Temurin auto-DL. Re-installé si un module en a besoin.",
    },
    {
      id: "mc-temp",
      label: "Fichiers temporaires d'install",
      hint: "Modpacks staging, ZIPs intermédiaires, redists VC++ téléchargés.",
    },
  ];

  return (
    <motion.div whileHover={{ x: 4 }} className="no-drag rounded-2xl glass p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
          <FolderDown className="size-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg-primary">Téléchargements & cache</div>
          <div className="text-sm text-fg-muted">
            Vide les caches partagés pour libérer du disque. Tes saves Minecraft
            ne sont jamais touchées.
          </div>
        </div>
        <button
          type="button"
          onClick={calculate}
          disabled={loading}
          className="self-start inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent ring-1 ring-accent/30 hover:bg-accent/20 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {snapshot ? "Recalculer" : "Calculer la taille"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {categories.map((cat) => {
          const size = snapshot?.[cat.id] ?? null;
          const empty = size !== null && size === 0;
          return (
            <div
              key={cat.id}
              className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-fg-primary">{cat.label}</span>
                  {size !== null && (
                    <span
                      className={cn(
                        "font-mono text-xs",
                        empty ? "text-fg-dim" : "text-accent",
                      )}
                    >
                      {empty ? "vide" : fmt(size)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-fg-muted">{cat.hint}</div>
              </div>
              <button
                type="button"
                onClick={() => purge(cat.id)}
                disabled={busy !== null || size === 0}
                className="shrink-0 rounded-md bg-white/[0.03] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.04] transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === cat.id ? (
                  <Loader2 className="inline size-3 animate-spin" />
                ) : (
                  "Vider"
                )}
              </button>
            </div>
          );
        })}
      </div>

      {snapshot && (
        <div className="mt-3 text-[11px] text-fg-dim">
          Total estimé : <span className="font-mono text-fg-muted">{fmt(snapshot.total)}</span>
          {" · "}
          Calculé en {snapshot.durationMs} ms
        </div>
      )}
    </motion.div>
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
      <Toggle value={value} onToggle={onToggle} />
    </motion.div>
  );
}

/**
 * Unified accent-colored switch used everywhere in Settings — same
 * shape, same ring + glow, same spring animation regardless of
 * whether the toggle is the master "Sons d'interface", the inner
 * "Animations" sub-setting, the overlay enable switch, or the
 * toast kind toggle. Pick a size : `md` (default) for top-level
 * cards, `sm` for sub-options nested inside an existing card. Both
 * sizes share the same colors / states for visual consistency.
 */
function Toggle({
  value,
  onToggle,
  size = "md",
  ariaLabel,
}: {
  value: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  // Distance the thumb travels horizontally :
  //   md : track w-12 (48 px) - thumb size-6 (24 px) - 2*0.5 inset = 20 px
  //   sm : track w-11 (44 px) - thumb size-5 (20 px) - 2*0.5 inset = 20 px
  // (same value for both, just different track/thumb sizes)
  const trackClass = size === "sm" ? "h-6 w-11" : "h-7 w-12";
  const thumbSizeClass = size === "sm" ? "size-5" : "size-6";
  const thumbX = 20;

  return (
    <button
      onClick={onToggle}
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-200 ring-1",
        trackClass,
        value
          ? "bg-accent/30 ring-accent/40 shadow-[0_0_18px_var(--color-accent-soft)]"
          : "bg-white/[0.06] ring-white/[0.08]",
      )}
    >
      {/* Use explicit `animate.x` instead of Framer's `layout` prop +
       *  className-based left-X position. `layout` tracks bounding-box
       *  changes between renders ; when the className changes from
       *  `left-0.5` to `left-[calc(100%-…)]` (or vice versa), the layout
       *  measurement happens AFTER React commits the new class, so the
       *  spring sometimes overshoots / clips on the OFF→ON…ON→OFF cycle
       *  (visible as a snap or rubber-band on deactivation). With a
       *  static `left-0.5` base + animated `x`, the spring always
       *  interpolates symmetrically between two stable values — same
       *  feel both directions. */}
      <motion.span
        animate={{ x: value ? thumbX : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn(
          "absolute left-0.5 top-0.5 rounded-full transition-colors duration-150",
          thumbSizeClass,
          value
            ? "bg-accent shadow-[0_0_10px_var(--color-accent-glow)]"
            : "bg-fg-muted",
        )}
      />
    </button>
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
  // Per-machine "default account" preference — used by the module
  // detail page to pre-select the right uuid when multiple accounts
  // are connected. Stored in localStorage by `setDefaultMcUuid`.
  const [defaultUuid, setDefaultUuid] = useState<string | null>(getDefaultMcUuid());

  // Tick every 30 s so the "expires in X" chip stays fresh without
  // re-polling Tauri. Uses the shared timer to avoid spinning yet
  // another setInterval (see hooks/useTickEvery.ts).
  void useTickEvery(30_000);

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
                  onClick={() => {
                    sounds.click();
                    setDefaultMcUuid(defaultUuid === acc.uuid ? null : acc.uuid);
                    setDefaultUuid(defaultUuid === acc.uuid ? null : acc.uuid);
                  }}
                  title={
                    defaultUuid === acc.uuid
                      ? "Compte par défaut — cliquer pour retirer"
                      : "Définir comme compte par défaut (utilisé pour le prochain launch d'un module)"
                  }
                  className={cn(
                    "grid size-8 place-items-center rounded-lg disabled:opacity-40",
                    defaultUuid === acc.uuid
                      ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
                      : "text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary",
                  )}
                >
                  <Star
                    className={cn(
                      "size-3.5",
                      defaultUuid === acc.uuid && "fill-amber-300",
                    )}
                  />
                </button>
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

// ─── Overlay (in-game) ──────────────────────────────────────────────────

/**
 * Settings card for the in-game overlay feature : enable / disable
 * the global hotkey, customize the key combo, toggle auto-borderless
 * mode (Option A — strips fullscreen-y window styles from the
 * launched game so a transparent always-on-top overlay can paint
 * over it). Also exposes a "Tester" button that shows the overlay
 * window immediately so the user can preview the effect.
 */
function OverlayCard() {
  const [enabled, setEnabledState] = useState<boolean>(() => getOverlayEnabled());
  const [hotkey, setHotkeyState] = useState<string>(() => getSavedOverlayHotkey());
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Listen for Esc to cancel and any normal key combo to capture. */
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      // Skip pure modifier presses — wait for the user to actually
      // pick a final key.
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Meta");
      const code = e.code; // e.g. KeyO, F9, Space
      let key: string;
      if (code.startsWith("Key")) key = code.slice(3); // KeyO → O
      else if (code.startsWith("Digit")) key = code.slice(5); // Digit5 → 5
      else if (code.startsWith("F") && /^F\d{1,2}$/.test(code)) key = code; // F1..F12
      else if (code === "Space") key = "Space";
      else if (code === "Escape" || code === "Tab" || code === "Enter") key = code;
      else {
        // Unsupported key — ignore and keep recording
        return;
      }
      parts.push(key);
      const combo = parts.join("+");
      // Require at least one modifier so the hotkey doesn't conflict
      // with raw keypresses in games (e.g. binding "F" alone would
      // toggle the overlay every time the player tries to interact
      // with something in-game).
      if (parts.length < 2 && !/^F\d/.test(key)) {
        setError("Ajoute au moins un modificateur (Ctrl/Shift/Alt) ou utilise une touche Fn.");
        return;
      }
      setError(null);
      setHotkeyState(combo);
      void setOverlayHotkey(combo).catch((err) => {
        console.warn("[overlay] register failed:", err);
        setError(`Impossible d'enregistrer ce raccourci : ${String(err)}`);
      });
      setRecording(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);

  const handleToggle = async () => {
    sounds.click();
    const next = !enabled;
    setEnabledState(next);
    setOverlayEnabled(next);
    try {
      if (next) {
        await bootOverlayHotkey();
      } else {
        await unregisterOverlayHotkey();
      }
    } catch (err) {
      console.warn("[overlay] toggle failed:", err);
    }
  };

  const handleTest = async () => {
    sounds.click();
    try {
      await showOverlay();
    } catch (err) {
      setError(`Impossible d'ouvrir l'overlay : ${String(err)}`);
    }
  };

  const handleResetHotkey = async () => {
    sounds.click();
    setHotkeyState(DEFAULT_OVERLAY_HOTKEY);
    try {
      await setOverlayHotkey(DEFAULT_OVERLAY_HOTKEY);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <motion.div whileHover={{ x: 4 }} className="no-drag rounded-2xl glass p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
          <Layers className="size-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-fg-primary">Overlay in-game</div>
            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
              Beta
            </span>
          </div>
          <div className="text-sm text-fg-muted">
            Affiche le launcher (amis, DM, notifs) par-dessus n'importe quel
            jeu en mode borderless via un raccourci global.
          </div>
        </div>
        <Toggle
          value={enabled}
          onToggle={handleToggle}
          ariaLabel="Activer l'overlay in-game"
        />
      </div>

      {enabled && (
        <div className="mt-5 space-y-4">
          {/* Hotkey picker */}
          <div className="rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-fg-dim">
              <Keyboard className="size-3.5" />
              Raccourci global
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (recording) return;
                  sounds.click();
                  setRecording(true);
                  setError(null);
                }}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-2.5 font-mono text-sm transition-colors",
                  recording
                    ? "animate-pulse border-accent bg-accent/10 text-accent"
                    : "border-white/[0.08] bg-bg-base/40 text-fg-primary hover:bg-bg-base/60",
                )}
                title={recording ? "Appuie sur la combinaison désirée (Esc pour annuler)" : "Cliquer pour enregistrer un nouveau raccourci"}
              >
                {recording ? "Appuie sur la combinaison… (Esc pour annuler)" : hotkey}
              </button>
              {hotkey !== DEFAULT_OVERLAY_HOTKEY && (
                <button
                  type="button"
                  onClick={handleResetHotkey}
                  className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
                  title="Revenir à Shift+F9"
                >
                  Reset
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-fg-dim">
              Doit inclure au moins un modificateur (Ctrl/Shift/Alt) ou être une
              touche Fn. <span className="text-fg-muted">Pro tip :</span> évite
              Ctrl+Shift+O (Chrome dev tools).
            </p>
          </div>

          {/* Manual actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTest}
              className="rounded-lg bg-accent/[0.08] px-4 py-2 text-xs font-medium text-accent ring-1 ring-accent/20 transition-colors hover:bg-accent/[0.15]"
            >
              Tester l'overlay
            </button>
          </div>

          {/* Note compatibilité borderless */}
          <p className="text-[11px] text-fg-dim">
            ⚠️ L'overlay s'affiche uniquement par-dessus les jeux en mode
            <strong className="ml-1 text-fg-muted">borderless</strong> ou
            <strong className="ml-1 text-fg-muted">fenêtré</strong>. Si ton jeu
            est en exclusive fullscreen, change-le dans ses propres options.
          </p>

          {/* Toasts in-game (Phase 2) */}
          <ToastsSubSection />

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-xs text-danger ring-1 ring-danger/30">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Settings sub-section listing the toast event kinds the user wants
 * to see in-game (friend online, friend launched, new message). Lives
 * inside `OverlayCard` so it's hidden when the whole overlay feature
 * is off — toasts are an extension of the overlay, not a standalone
 * feature.
 */
function ToastsSubSection() {
  const [enabled, setEnabledState] = useState<boolean>(() => getToastsEnabled());
  const [kindsState, setKindsState] = useState<Record<ToastKind, boolean>>(() => ({
    "friend-online": getToastsKindEnabled("friend-online"),
    "friend-launched": getToastsKindEnabled("friend-launched"),
    message: getToastsKindEnabled("message"),
  }));

  const toggleEnabled = () => {
    sounds.click();
    const next = !enabled;
    setEnabledState(next);
    setToastsEnabled(next);
  };

  const toggleKind = (kind: ToastKind) => {
    sounds.click();
    const next = !kindsState[kind];
    setKindsState((prev) => ({ ...prev, [kind]: next }));
    setToastsKindEnabled(kind, next);
  };

  return (
    <div className="rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm text-fg-primary">Toasts in-game</div>
          <p className="text-[11px] text-fg-muted">
            Petites notifications coin bas-droit qui apparaissent par-dessus le
            jeu sans intercepter les clics. Auto-fade après 4&nbsp;s.
          </p>
        </div>
        <Toggle
          value={enabled}
          onToggle={toggleEnabled}
          size="sm"
          ariaLabel="Activer les toasts in-game"
        />
      </div>
      {enabled && (
        <div className="mt-2 grid grid-cols-1 gap-1.5">
          {(["friend-online", "friend-launched", "message"] as ToastKind[]).map(
            (kind) => (
              <label
                key={kind}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={kindsState[kind]}
                  onChange={() => toggleKind(kind)}
                  className="size-3.5 accent-accent"
                />
                <span>{TOAST_KIND_LABEL[kind]}</span>
              </label>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ─── Notifications Windows natives ──────────────────────────────────────

/**
 * Settings card for OS-level (Windows toast) notifications. Master
 * switch + 5 per-kind toggles (message / achievement / mention crew /
 * ami online / ami lance jeu). Default-on for the meaningful ones,
 * off for the ambient signals so the user has to opt in explicitly.
 */
function NotificationsCard() {
  const [enabled, setEnabledState] = useState<boolean>(() =>
    getNativeNotifsEnabled(),
  );
  const KINDS: NotifKind[] = [
    "message",
    "achievement",
    "crew-mention",
    "friend-online",
    "friend-launched",
  ];
  const [kindsState, setKindsState] = useState<Record<NotifKind, boolean>>(
    () =>
      Object.fromEntries(KINDS.map((k) => [k, getNativeNotifKind(k)])) as Record<
        NotifKind,
        boolean
      >,
  );

  const toggleEnabled = () => {
    sounds.click();
    const next = !enabled;
    setEnabledState(next);
    setNativeNotifsEnabled(next);
  };

  const toggleKind = (kind: NotifKind) => {
    sounds.click();
    const next = !kindsState[kind];
    setKindsState((prev) => ({ ...prev, [kind]: next }));
    setNativeNotifKind(kind, next);
  };

  return (
    <motion.div whileHover={{ x: 4 }} className="no-drag rounded-2xl glass p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
          <Bell className="size-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg-primary">
            Notifications Windows
          </div>
          <div className="text-sm text-fg-muted">
            Toasts système (bottom-right + Action Center) quand le launcher
            n'est pas focus. Pas de toast si la fenêtre est active —
            l'in-app gère.
          </div>
        </div>
        <Toggle value={enabled} onToggle={toggleEnabled} />
      </div>

      {enabled && (
        <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {KINDS.map((kind) => (
            <label
              key={kind}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-bg-base/30 px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.04] transition-colors hover:bg-bg-base/50 hover:text-fg-primary"
            >
              <input
                type="checkbox"
                checked={kindsState[kind]}
                onChange={() => toggleKind(kind)}
                className="size-3.5 accent-accent"
              />
              <span className="flex-1">{NOTIF_KIND_LABEL[kind]}</span>
            </label>
          ))}
        </div>
      )}
    </motion.div>
  );
}
