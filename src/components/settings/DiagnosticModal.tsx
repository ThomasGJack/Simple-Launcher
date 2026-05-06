import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Cpu,
  HardDrive,
  Loader2,
  Monitor,
  RefreshCw,
  Stethoscope,
  X,
} from "lucide-react";
import {
  diagnosticRun,
  diagnosticToText,
  fmtBytes,
  severity,
  type DiagnosticSnapshot,
} from "@/lib/diagnostic";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Self-service system diagnostic modal. Shows OS / CPU / RAM / GPU /
 * disk + Java + VC++ runtime status, with severity buckets. Lets users
 * copy a text-only report to clipboard so the dev can debug remote
 * issues without screenshots.
 */
export function DiagnosticModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await diagnosticRun();
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      sounds.error();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !snapshot && !loading) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCopy = async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(diagnosticToText(snapshot));
      setCopyState("copied");
      sounds.success();
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setError("Impossible de copier dans le presse-papier.");
    }
  };

  // Severity computations — 4 GB free RAM and 10 GB free disk are the
  // "warn" thresholds, 2 GB / 2 GB the "danger" ones.
  const ramSeverity = snapshot
    ? severity(snapshot.availableMemoryBytes, 4 * 1024 ** 3, 2 * 1024 ** 3)
    : "ok";
  const diskSeverity = snapshot
    ? severity(snapshot.launcherDiskFreeBytes, 10 * 1024 ** 3, 2 * 1024 ** 3)
    : "ok";
  const javaOk = snapshot ? snapshot.javas.length > 0 : false;
  const vcredistOk = snapshot ? snapshot.missingVcredists.length === 0 : false;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[88vh] w-[92vw] max-w-3xl overflow-hidden rounded-3xl bg-bg-soft/95 ring-1 ring-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
              <div className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <Stethoscope className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Diagnostic système</div>
                <div className="text-xs text-fg-muted">
                  Surface tout ce qui peut affecter les performances + lancements MC.
                </div>
              </div>
              <button
                type="button"
                onClick={run}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base disabled:opacity-50"
                title="Relancer"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Actualiser
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="info-scroll max-h-[calc(88vh-130px)] overflow-y-auto p-6">
              {error && (
                <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              {!snapshot && loading && (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-muted">
                  <Loader2 className="size-4 animate-spin" /> Collecte des données…
                </div>
              )}

              {snapshot && (
                <div className="space-y-5">
                  {/* System block */}
                  <Section icon={Monitor} title="Système">
                    <Row label="OS" value={`${snapshot.os} (kernel ${snapshot.kernel})`} />
                    <Row
                      label="CPU"
                      value={`${snapshot.cpuName} · ${snapshot.cpuCores} threads`}
                    />
                    <Row
                      label="GPU"
                      value={
                        snapshot.gpus.length > 0
                          ? snapshot.gpus.join(" · ")
                          : "(non détecté)"
                      }
                      warn={snapshot.gpus.length === 0}
                    />
                  </Section>

                  {/* Memory */}
                  <Section icon={Cpu} title="Mémoire">
                    <RowSeverity
                      label="RAM libre"
                      value={`${fmtBytes(snapshot.availableMemoryBytes)} sur ${fmtBytes(snapshot.totalMemoryBytes)}`}
                      severity={ramSeverity}
                      hint={
                        ramSeverity === "danger"
                          ? "Moins de 2 Go libre — la plupart des modpacks vont crash. Ferme des onglets, des apps, ou bumppe la RAM système."
                          : ramSeverity === "warn"
                            ? "Sous 4 Go libre — limite pour un modpack moderne avec shaders."
                            : null
                      }
                    />
                  </Section>

                  {/* Disk */}
                  <Section icon={HardDrive} title="Disque (drive du launcher)">
                    <Row
                      label="Chemin"
                      value={snapshot.launcherDiskPath}
                      mono
                    />
                    <RowSeverity
                      label="Espace libre"
                      value={`${fmtBytes(snapshot.launcherDiskFreeBytes)} sur ${fmtBytes(snapshot.launcherDiskTotalBytes)}`}
                      severity={diskSeverity}
                      hint={
                        diskSeverity === "danger"
                          ? "Moins de 2 Go libre — l'install d'un modpack va échouer. Désinstalle des trucs."
                          : diskSeverity === "warn"
                            ? "Sous 10 Go libre — un modpack avec assets peut consommer 4-6 Go."
                            : null
                      }
                    />
                  </Section>

                  {/* Java */}
                  <Section
                    icon={Cpu}
                    title="Java"
                    headerRight={<StatusPill ok={javaOk} />}
                  >
                    {snapshot.javas.length === 0 ? (
                      <div className="text-xs text-fg-muted">
                        Aucune installation Java détectée. Pas grave : le launcher en téléchargera
                        une auto (Adoptium Temurin) au premier lancement Minecraft, dans son
                        dossier privé.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {snapshot.javas.map((j, i) => (
                          <div
                            key={i}
                            className="flex flex-wrap items-baseline gap-2 text-xs"
                          >
                            <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-accent">
                              Java {j.majorVersion}
                            </span>
                            <span className="text-fg-muted">{j.versionString}</span>
                            {j.managed && (
                              <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] uppercase text-emerald-300">
                                Géré
                              </span>
                            )}
                            <span className="truncate font-mono text-[11px] text-fg-dim">
                              {j.path}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  {/* VC++ */}
                  <Section
                    icon={Cpu}
                    title="Visual C++ Redistributables"
                    headerRight={<StatusPill ok={vcredistOk} />}
                  >
                    {vcredistOk ? (
                      <div className="text-xs text-fg-muted">
                        Tous les redists requis (2012, 2013, 2015-2022 x64) sont présents.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-amber-200">
                          Manquants : {snapshot.missingVcredists.map((d) => d.displayName).join(", ")}
                        </div>
                        <div className="text-xs text-fg-muted">
                          Le launcher proposera de les installer automatiquement au premier
                          lancement Minecraft. Sans ces redists, certaines libs natives MC chargent
                          partiellement et le rendu peut être en bouillie.
                        </div>
                      </div>
                    )}
                  </Section>
                </div>
              )}
            </div>

            {/* Footer */}
            {snapshot && (
              <div className="flex items-center gap-2 border-t border-white/[0.06] bg-bg-base/40 px-6 py-3">
                <span className="text-[11px] text-fg-dim">
                  Généré le{" "}
                  {new Date(snapshot.generatedAtMs).toLocaleString("fr-FR")}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ring-1 transition",
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
                      <ClipboardCopy className="size-3.5" /> Copier le rapport
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  icon: Icon,
  title,
  headerRight,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg-base/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-accent" />
        <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {title}
        </div>
        <div className="flex-1" />
        {headerRight}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
  mono,
}: {
  label: string;
  value: string;
  warn?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
      <span className="text-fg-muted">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-right",
          warn ? "text-amber-200" : "text-fg-primary",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function RowSeverity({
  label,
  value,
  severity,
  hint,
}: {
  label: string;
  value: string;
  severity: "ok" | "warn" | "danger";
  hint?: string | null;
}) {
  const color =
    severity === "danger"
      ? "text-danger"
      : severity === "warn"
        ? "text-amber-200"
        : "text-emerald-300";
  const Icon = severity === "danger" || severity === "warn" ? AlertTriangle : Check;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className={cn("inline-flex items-center gap-1.5 font-mono", color)}>
          <Icon className="size-3.5" />
          {value}
        </span>
      </div>
      {hint && (
        <div className="rounded-md bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-fg-muted ring-1 ring-white/[0.04]">
          {hint}
        </div>
      )}
    </div>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1",
        ok
          ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
          : "bg-amber-400/15 text-amber-300 ring-amber-400/30",
      )}
    >
      {ok ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}
      {ok ? "OK" : "Action requise"}
    </span>
  );
}
