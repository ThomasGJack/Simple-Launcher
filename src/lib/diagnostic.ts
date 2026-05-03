import { invoke } from "@tauri-apps/api/core";

/**
 * System diagnostic snapshot returned by the Rust `diagnostic_run`
 * command. Mirrors the `DiagnosticSnapshot` struct in
 * `src-tauri/src/diagnostic.rs`.
 *
 * Surfaced through the `DiagnosticModal` triggered from Settings — used
 * by users to self-debug "ça marche pas chez moi" issues, and by the
 * dev (admin) to ask "envoie-moi le diagnostic" instead of hand-walking
 * the user through Win+R / dxdiag / Get-CimInstance.
 */
export type DiagnosticSnapshot = {
  os: string;
  kernel: string;
  cpuName: string;
  cpuCores: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  gpus: string[];
  launcherDiskFreeBytes: number;
  launcherDiskTotalBytes: number;
  launcherDiskPath: string;
  javas: Array<{
    majorVersion: number;
    versionString: string;
    path: string;
    source: string;
    managed: boolean;
  }>;
  missingVcredists: Array<{
    id: string;
    displayName: string;
    url: string;
  }>;
  generatedAtMs: number;
};

export async function diagnosticRun(): Promise<DiagnosticSnapshot> {
  return invoke<DiagnosticSnapshot>("diagnostic_run");
}

/** Severity bucket for a numeric reading against (warn, danger) thresholds.
 *  `value >= warn` → "ok", `< warn && >= danger` → "warn", else "danger". */
export function severity(
  value: number,
  warnAtLeast: number,
  dangerBelow: number,
): "ok" | "warn" | "danger" {
  if (value >= warnAtLeast) return "ok";
  if (value >= dangerBelow) return "warn";
  return "danger";
}

/** Human-friendly bytes → "X GB" / "Y MB" / etc. Locale FR. */
export function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} Mo`;
  return `${(bytes / 1024).toFixed(0)} Ko`;
}

/** Builds a one-shot copy-pasteable text report of the diagnostic.
 *  Useful to ask users "copy ça dans Discord" without making them
 *  screenshot the modal. */
export function diagnosticToText(snap: DiagnosticSnapshot): string {
  const lines: string[] = [];
  lines.push("=== Simple Launcher — Diagnostic système ===");
  lines.push(`Date : ${new Date(snap.generatedAtMs).toLocaleString("fr-FR")}`);
  lines.push("");
  lines.push(`OS         : ${snap.os} (kernel ${snap.kernel})`);
  lines.push(`CPU        : ${snap.cpuName} · ${snap.cpuCores} threads`);
  lines.push(
    `RAM        : ${fmtBytes(snap.availableMemoryBytes)} libre / ${fmtBytes(snap.totalMemoryBytes)} total`,
  );
  lines.push(
    `Disque     : ${fmtBytes(snap.launcherDiskFreeBytes)} libre / ${fmtBytes(snap.launcherDiskTotalBytes)} total — ${snap.launcherDiskPath}`,
  );
  lines.push(`GPU(s)     : ${snap.gpus.length > 0 ? snap.gpus.join(", ") : "(non détecté)"}`);
  lines.push("");
  lines.push("--- Java ---");
  if (snap.javas.length === 0) {
    lines.push("(aucune installation détectée — sera téléchargée auto au premier launch MC)");
  } else {
    for (const j of snap.javas) {
      const tag = j.managed ? " [géré par le launcher]" : "";
      lines.push(`Java ${j.majorVersion} (${j.versionString})${tag} → ${j.path}`);
    }
  }
  lines.push("");
  lines.push("--- VC++ Redistributables ---");
  if (snap.missingVcredists.length === 0) {
    lines.push("Tous les redists requis sont présents.");
  } else {
    lines.push(`MANQUANTS : ${snap.missingVcredists.map((d) => d.displayName).join(", ")}`);
    lines.push("(Le launcher proposera de les installer auto au premier launch MC.)");
  }
  return lines.join("\n");
}
