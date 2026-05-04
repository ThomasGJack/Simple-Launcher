import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ClipboardCopy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { mcCrashCollect, type CrashCollectSnapshot } from "@/lib/mcCrash";
import { sendCrashReport } from "@/firebase/crashReports";
import { useAuthStore } from "@/store/auth";
import { achievementFlags } from "@/lib/achievementFlags";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import type { CustomMinecraftModule, MinecraftModule } from "@/types/module";

/**
 * Modal triggered automatically when a native MC launch exits with a
 * non-zero code. Surfaces the data needed to debug : tail of MC's log,
 * recent crash-reports, mods count. Lets the user :
 *
 *   - Copy the full report to clipboard (formatted as plain text).
 *   - Send it to the admin via Firestore (with optional free-text note).
 *   - Trigger a reinstall of the modpack as a recovery action.
 */
export function CrashReportModal({
  open,
  onClose,
  module,
  exitCode,
  lastConsoleLines,
  onReinstall,
}: {
  open: boolean;
  onClose: () => void;
  module: MinecraftModule | CustomMinecraftModule;
  exitCode: number | null;
  /** Last lines from the launch panel's in-memory console — passed in
   *  rather than re-read from Tauri because this is the only chance to
   *  capture them (the panel resets `logLines` on next launch). */
  lastConsoleLines: string;
  onReinstall: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [snapshot, setSnapshot] = useState<CrashCollectSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [showLog, setShowLog] = useState(false);
  const [openReportIdx, setOpenReportIdx] = useState<number | null>(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await mcCrashCollect(module.id);
        if (cancelled) return;
        setSnapshot(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, module.id]);

  const buildReportText = (): string => {
    const lines: string[] = [];
    lines.push("=== Simple Launcher — Rapport de crash Minecraft ===");
    lines.push(
      `Date : ${new Date(snapshot?.generatedAtMs ?? Date.now()).toLocaleString("fr-FR")}`,
    );
    lines.push(`Module : ${module.name} (${module.id})`);
    if (module.nativeMcVersion) lines.push(`MC : ${module.nativeMcVersion}`);
    if (module.nativeLoader) {
      lines.push(
        `Loader : ${module.nativeLoader}${module.nativeLoaderVersion ? " " + module.nativeLoaderVersion : ""}`,
      );
    }
    lines.push(`Exit code : ${exitCode ?? "?"}`);
    if (snapshot) lines.push(`Mods chargés : ${snapshot.modsCount}`);
    if (note.trim()) {
      lines.push("");
      lines.push("--- Note utilisateur ---");
      lines.push(note.trim());
    }
    lines.push("");
    lines.push("--- Console launcher (tail) ---");
    lines.push(lastConsoleLines || "(vide)");
    lines.push("");
    lines.push("--- Minecraft latest.log (tail) ---");
    lines.push(snapshot?.latestLogTail || "(non disponible)");
    if (snapshot && snapshot.crashReports.length > 0) {
      lines.push("");
      lines.push("--- Crash reports ---");
      for (const r of snapshot.crashReports) {
        lines.push("");
        lines.push(
          `### ${r.filename} (${(r.sizeBytes / 1024).toFixed(1)} KB${r.truncated ? ", tronqué" : ""})`,
        );
        lines.push(r.contents);
      }
    }
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildReportText());
      setCopyState("copied");
      sounds.success();
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setError("Impossible de copier dans le presse-papier.");
    }
  };

  const handleSend = async () => {
    if (!user) {
      setError("Tu dois être connecté pour envoyer un rapport.");
      return;
    }
    if (!snapshot) return;
    setSendState("sending");
    setError(null);
    try {
      const launcherVersion = await getVersion().catch(() => "?");
      await sendCrashReport({
        uid: user.uid,
        userName: user.displayName ?? "Anonyme",
        moduleId: module.id,
        moduleName: module.name,
        exitCode: exitCode ?? -999,
        lastConsoleLines,
        snapshot,
        userNote: note.trim() || undefined,
        launcherVersion,
        mcVersion: module.nativeMcVersion,
        loader: module.nativeLoader,
      });
      sounds.success();
      setSendState("sent");
      // #48 "Bug bounty" — secret achievement for sending a crash
      // report. Kept idempotent (one-shot flag).
      achievementFlags.markCrashReportSent();
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
      setSendState("idle");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="relative max-h-[90vh] w-[92vw] max-w-3xl overflow-hidden rounded-3xl bg-bg-soft/95 ring-1 ring-rose-500/20 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">
                <AlertTriangle className="size-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold">Minecraft a crashé</div>
                <div className="text-xs text-fg-muted">
                  {module.name} · code de sortie {exitCode ?? "?"}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="info-scroll max-h-[calc(90vh-180px)] overflow-y-auto p-6">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-fg-muted">
                  <Loader2 className="size-4 animate-spin" /> Collecte des logs…
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              {snapshot && (
                <div className="space-y-4">
                  {/* Quick context */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Exit code" value={exitCode?.toString() ?? "?"} tone="danger" />
                    <Stat label="Mods" value={String(snapshot.modsCount)} />
                    <Stat
                      label="Crash reports"
                      value={String(snapshot.crashReports.length)}
                      tone={snapshot.crashReports.length > 0 ? "warn" : "muted"}
                    />
                    <Stat
                      label="Log capturé"
                      value={
                        snapshot.latestLogTail
                          ? `${(snapshot.latestLogTail.length / 1024).toFixed(0)} Ko`
                          : "vide"
                      }
                    />
                  </div>

                  {/* User note */}
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-fg-dim">
                      Note (optionnelle, aide au debug)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Ex. ça a freeze quand je suis entré dans le nether…"
                      className="w-full resize-none rounded-xl bg-bg-base/60 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.08] focus:outline-none focus:ring-accent/50"
                    />
                  </div>

                  {/* Crash reports section */}
                  {snapshot.crashReports.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-dim">
                        Crash reports
                      </div>
                      <div className="space-y-2">
                        {snapshot.crashReports.map((r, idx) => (
                          <div
                            key={r.filename}
                            className="overflow-hidden rounded-xl border border-rose-500/20 bg-rose-500/[0.03]"
                          >
                            <button
                              type="button"
                              onClick={() => setOpenReportIdx(openReportIdx === idx ? null : idx)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.02]"
                            >
                              {openReportIdx === idx ? (
                                <ChevronUp className="size-3.5 text-fg-muted" />
                              ) : (
                                <ChevronDown className="size-3.5 text-fg-muted" />
                              )}
                              <span className="font-mono text-xs text-fg-primary">
                                {r.filename}
                              </span>
                              <span className="text-[11px] text-fg-dim">
                                {new Date(r.modifiedAtMs).toLocaleString("fr-FR")} ·{" "}
                                {(r.sizeBytes / 1024).toFixed(1)} Ko
                                {r.truncated && " · tronqué"}
                              </span>
                            </button>
                            {openReportIdx === idx && (
                              <pre className="info-scroll max-h-72 overflow-auto border-t border-rose-500/15 bg-bg-base/40 p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
                                {r.contents || "(vide)"}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* latest.log tail */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowLog((v) => !v)}
                      className="flex w-full items-center gap-2 text-xs font-medium uppercase tracking-wider text-fg-dim hover:text-fg-primary"
                    >
                      {showLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      Tail du latest.log
                      {snapshot.latestLogTruncated && (
                        <span className="ml-1 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                          tronqué
                        </span>
                      )}
                    </button>
                    {showLog && (
                      <pre className="info-scroll mt-2 max-h-72 overflow-auto rounded-xl bg-bg-base/40 p-3 font-mono text-[11px] leading-relaxed text-fg-muted ring-1 ring-white/[0.04]">
                        {snapshot.latestLogTail || "(non disponible — l'instance n'a peut-être jamais lancé MC)"}
                      </pre>
                    )}
                  </div>

                  {/* Console tail */}
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-dim">
                      Console launcher (mémoire)
                    </div>
                    <pre className="info-scroll max-h-40 overflow-auto rounded-xl bg-bg-base/40 p-3 font-mono text-[11px] leading-relaxed text-fg-muted ring-1 ring-white/[0.04]">
                      {lastConsoleLines || "(rien capturé)"}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-bg-base/40 px-6 py-3">
              <button
                type="button"
                onClick={onReinstall}
                disabled={!snapshot || sendState === "sending"}
                className="inline-flex items-center gap-1.5 rounded-md bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base disabled:opacity-50"
                title="Réinstaller le modpack pour repartir d'un état propre"
              >
                <RefreshCw className="size-3.5" />
                Réinstaller le modpack
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleCopy}
                disabled={!snapshot}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ring-1 transition disabled:opacity-50",
                  copyState === "copied"
                    ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
                    : "bg-bg-elevated text-fg-primary ring-white/[0.06] hover:bg-bg-base",
                )}
              >
                {copyState === "copied" ? (
                  <>
                    <Check className="size-3.5" /> Copié
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="size-3.5" /> Copier
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!snapshot || sendState !== "idle"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition disabled:opacity-50",
                  sendState === "sent"
                    ? "bg-emerald-400 text-bg-base ring-emerald-400"
                    : "bg-rose-500 text-white ring-rose-500 hover:bg-rose-400",
                )}
              >
                {sendState === "sending" && (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Envoi…
                  </>
                )}
                {sendState === "sent" && (
                  <>
                    <Mail className="size-3.5" /> Envoyé
                  </>
                )}
                {sendState === "idle" && (
                  <>
                    <Send className="size-3.5" /> Envoyer à l'admin
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "warn" | "muted";
}) {
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "muted"
          ? "text-fg-dim"
          : "text-accent";
  return (
    <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
      <div className="text-[10px] uppercase tracking-wider text-fg-dim">{label}</div>
      <div className={cn("font-display text-lg", color)}>{value}</div>
    </div>
  );
}
