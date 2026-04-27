import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronRight,
  Filter,
  Info,
  RefreshCw,
  Shield,
  TerminalSquare,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { isAdmin } from "@/lib/admin";
import { watchRecentLogs, type StoredLogEntry } from "@/firebase/logs";
import { watchAllUsers, type UserPresence } from "@/firebase/presence";
import type { LogLevel } from "@/lib/logger";
import { cn } from "@/lib/cn";

/**
 * Admin-only page that surfaces every user's logs in a live, filterable
 * table. Visible from the sidebar's "Logs" entry which itself only renders
 * for admins (gated by `isAdmin(user)`). Reading the `/logs` collection
 * across all users is enforced server-side by Firestore rules — this UI
 * is a presentation layer, not a security boundary.
 */
export function AdminLogsPage() {
  const me = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<StoredLogEntry[]>([]);
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [filterUid, setFilterUid] = useState<string | null>(null);
  const [filterLevels, setFilterLevels] = useState<LogLevel[]>([]);
  const [maxEntries] = useState(200);

  useEffect(() => {
    return watchAllUsers(setUsers);
  }, []);

  useEffect(() => {
    return watchRecentLogs(
      { uid: filterUid, levels: filterLevels, max: maxEntries },
      setLogs,
    );
  }, [filterUid, filterLevels, maxEntries]);

  // Tally per-level for the filter chip badges
  const tallies = useMemo(() => {
    const t: Record<LogLevel, number> = { info: 0, warn: 0, error: 0, action: 0, bug: 0 };
    for (const l of logs) t[l.level]++;
    return t;
  }, [logs]);

  if (!isAdmin(me)) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="max-w-md rounded-2xl glass p-8 text-center">
          <Shield className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
          <div className="font-display text-2xl text-fg-primary">Accès refusé</div>
          <p className="mt-2 text-sm text-fg-muted">
            Cette page est réservée aux administrateurs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
          <TerminalSquare className="size-3" /> Admin
        </p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Logs</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Live tail des actions, erreurs et bugs remontés par tous les launchers connectés. Stream temps-réel via Firestore.
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-5 flex flex-wrap items-center gap-3"
      >
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
          <Filter className="size-3" /> Niveaux
        </div>
        {(["bug", "error", "warn", "action", "info"] as LogLevel[]).map((lvl) => {
          const meta = LEVEL_META[lvl];
          const Icon = meta.icon;
          const active = filterLevels.includes(lvl);
          return (
            <button
              key={lvl}
              onClick={() => {
                setFilterLevels((prev) =>
                  prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl],
                );
              }}
              className={cn(
                "no-drag inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1 transition-all",
                active ? meta.chipActive : meta.chipIdle,
              )}
            >
              <Icon className="size-3" />
              {meta.label}
              <span className="rounded-full bg-bg-base/40 px-1.5 text-[9px]">{tallies[lvl]}</span>
            </button>
          );
        })}

        <div className="ml-auto inline-flex items-center gap-2">
          <Users className="size-3.5 text-fg-muted" />
          <select
            value={filterUid ?? ""}
            onChange={(e) => setFilterUid(e.target.value || null)}
            className="no-drag rounded-lg bg-bg-base/50 px-2.5 py-1 text-xs text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
          >
            <option value="">Tous les utilisateurs</option>
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.displayName ?? u.username ?? u.uid.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* Logs list */}
      <div className="space-y-1.5">
        {logs.length === 0 ? (
          <div className="rounded-2xl glass p-10 text-center">
            <RefreshCw className="mx-auto mb-3 size-6 animate-spin text-fg-dim" />
            <p className="text-sm text-fg-muted">
              {filterLevels.length > 0 || filterUid
                ? "Aucun log avec ces filtres."
                : "En attente de logs… reste sur la page, ils arriveront en live."}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log, idx) => (
              <LogRow key={log.id} log={log} index={idx} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                                LOG ROW
// ---------------------------------------------------------------------------

function LogRow({ log, index }: { log: StoredLogEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const meta = LEVEL_META[log.level];
  const Icon = meta.icon;
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
  const ts = log.serverTs ?? log.ts;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.01, 0.2) }}
      className={cn(
        "overflow-hidden rounded-xl border-l-2 bg-bg-base/30 ring-1 ring-white/[0.04] transition-colors",
        meta.borderL,
        expanded && "bg-bg-base/50",
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="no-drag flex w-full items-center gap-3 px-3 py-2 text-left"
      >
        {hasMetadata ? (
          expanded ? <ChevronDown className="size-3 shrink-0 text-fg-dim" /> : <ChevronRight className="size-3 shrink-0 text-fg-dim" />
        ) : (
          <div className="size-3 shrink-0" />
        )}
        <div
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md ring-1",
            meta.iconBg,
          )}
        >
          <Icon className={cn("size-3", meta.iconColor)} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm text-fg-primary">{log.message}</span>
            {log.source && (
              <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-fg-dim">
                {log.source}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-dim">
            <span>{log.userName}</span>
            <span>·</span>
            <span className="font-mono">v{log.launcherVersion}</span>
            <span>·</span>
            <span>{formatTime(ts)}</span>
            <span className="ml-auto truncate font-mono text-[9px] text-fg-dim/70" title={log.sessionId}>
              session {log.sessionId.slice(0, 8)}
            </span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.04] bg-bg-base/30 px-3 py-2">
          <div className="grid gap-1 text-[11px]">
            <DetailRow label="Niveau" value={log.level} mono />
            <DetailRow label="UID" value={log.uid} mono />
            <DetailRow label="Session" value={log.sessionId} mono />
            <DetailRow label="UA" value={log.userAgent} mono small />
            {hasMetadata && (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-dim">Métadonnées</div>
                <pre className="max-h-48 overflow-auto rounded-lg bg-bg-base/60 p-2 font-mono text-[10px] text-fg-muted ring-1 ring-white/[0.04]">
                  {safeJson(log.metadata)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function DetailRow({ label, value, mono = false, small = false }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-[9px] uppercase tracking-wider text-fg-dim">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 break-all text-fg-muted",
          mono && "font-mono",
          small && "text-[10px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                                META TABLES
// ---------------------------------------------------------------------------

const LEVEL_META: Record<LogLevel, {
  label: string;
  icon: typeof Info;
  iconBg: string;
  iconColor: string;
  borderL: string;
  chipActive: string;
  chipIdle: string;
}> = {
  info: {
    label: "Info",
    icon: Info,
    iconBg: "bg-sky-500/15 ring-sky-500/25",
    iconColor: "text-sky-300",
    borderL: "border-l-sky-400/50",
    chipActive: "bg-sky-500/20 text-sky-100 ring-sky-500/40",
    chipIdle: "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
  },
  action: {
    label: "Action",
    icon: Activity,
    iconBg: "bg-emerald-500/15 ring-emerald-500/25",
    iconColor: "text-emerald-300",
    borderL: "border-l-emerald-400/50",
    chipActive: "bg-emerald-500/20 text-emerald-100 ring-emerald-500/40",
    chipIdle: "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
  },
  warn: {
    label: "Warn",
    icon: AlertTriangle,
    iconBg: "bg-amber-500/15 ring-amber-500/25",
    iconColor: "text-amber-300",
    borderL: "border-l-amber-400/50",
    chipActive: "bg-amber-500/20 text-amber-100 ring-amber-500/40",
    chipIdle: "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
  },
  error: {
    label: "Error",
    icon: AlertTriangle,
    iconBg: "bg-rose-500/15 ring-rose-500/25",
    iconColor: "text-rose-300",
    borderL: "border-l-rose-400/50",
    chipActive: "bg-rose-500/20 text-rose-100 ring-rose-500/40",
    chipIdle: "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
  },
  bug: {
    label: "Bug",
    icon: Bug,
    iconBg: "bg-fuchsia-500/15 ring-fuchsia-500/25",
    iconColor: "text-fuchsia-300",
    borderL: "border-l-fuchsia-400/50",
    chipActive: "bg-fuchsia-500/20 text-fuchsia-100 ring-fuchsia-500/40",
    chipIdle: "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
  },
};

function formatTime(ts: number): string {
  if (!ts) return "—";
  const date = new Date(ts);
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
