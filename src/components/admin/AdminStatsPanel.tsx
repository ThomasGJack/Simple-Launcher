import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Clock,
  Loader2,
  RefreshCw,
  Rocket,
  Users,
} from "lucide-react";
import { loadAdminStats, type AdminStatsSnapshot } from "@/lib/adminStats";
import { formatPlaytime } from "@/firebase/playtime";
import { useModules } from "@/store/firebaseStores";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Admin-only analytics dashboard. Reads aggregated playtime + launch
 * counts across every user and renders : top-line counters, a per-module
 * leaderboard sorted by launches, and basic active-user numbers.
 *
 * Data is loaded once on mount + refreshable via the header button.
 * Not a live subscription — the read fan-out (1 + N user playtime fetches)
 * would be too noisy as a real-time stream. Manual refresh is fine for
 * an admin tab visited occasionally.
 */
export function AdminStatsPanel() {
  const modules = useModules();
  const moduleNameById = new Map(modules.map((m) => [m.id, m.name]));

  const [snapshot, setSnapshot] = useState<AdminStatsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadAdminStats();
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      sounds.error();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-fg-muted">
          {loading
            ? "Chargement…"
            : snapshot
              ? `Données agrégées sur ${snapshot.totalUsers} utilisateur${snapshot.totalUsers > 1 ? "s" : ""} · récupéré en ${snapshot.loadDurationMs} ms`
              : "Pas de données"}
        </div>
        <button
          type="button"
          onClick={() => {
            sounds.click();
            refresh();
          }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {snapshot && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Counter
              icon={Users}
              label="Utilisateurs"
              value={snapshot.totalUsers.toString()}
              hint={`${snapshot.activeUsers} actif${snapshot.activeUsers > 1 ? "s" : ""}`}
            />
            <Counter
              icon={Rocket}
              label="Lancements cumulés"
              value={snapshot.totalLaunches.toLocaleString("fr-FR")}
              tone="accent"
            />
            <Counter
              icon={Clock}
              label="Temps de jeu cumulé"
              value={formatPlaytime(snapshot.totalMs)}
              tone="accent"
            />
            <Counter
              icon={Activity}
              label="Modules joués"
              value={snapshot.modules.length.toString()}
              hint={`${modules.length} publié${modules.length > 1 ? "s" : ""}`}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-bg-base/40">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <BarChart3 className="size-4 text-accent" />
              <h3 className="text-sm font-semibold">Top modules</h3>
              <span className="text-xs text-fg-dim">par nombre de lancements</span>
            </div>
            {snapshot.modules.length === 0 ? (
              <div className="p-6 text-center text-sm text-fg-muted">
                Pas encore de lancements enregistrés. Quand des utilisateurs joueront,
                les stats s'afficheront ici.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-fg-dim">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Module</th>
                    <th className="px-4 py-2 text-right font-medium">Lancements</th>
                    <th className="px-4 py-2 text-right font-medium">Temps total</th>
                    <th className="px-4 py-2 text-right font-medium">Joueurs</th>
                    <th className="px-4 py-2 text-right font-medium">Dernier launch</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.modules.map((m, i) => (
                    <tr
                      key={m.moduleId}
                      className={cn(
                        "border-t border-white/[0.04]",
                        i === 0 && "bg-accent/[0.04]",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {i < 3 && (
                            <span
                              className={cn(
                                "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                                i === 0 && "bg-amber-400/20 text-amber-300",
                                i === 1 && "bg-slate-400/20 text-slate-300",
                                i === 2 && "bg-amber-700/20 text-amber-500",
                              )}
                            >
                              {i + 1}
                            </span>
                          )}
                          <span className="font-medium text-fg-primary">
                            {moduleNameById.get(m.moduleId) ?? m.moduleId}
                          </span>
                          {!moduleNameById.has(m.moduleId) && (
                            <span
                              className="rounded bg-fg-dim/10 px-1.5 py-0.5 text-[10px] uppercase text-fg-dim"
                              title="Module supprimé mais playtime conservé chez les users"
                            >
                              Supprimé
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-accent">
                        {m.totalLaunches.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-right text-fg-muted">
                        {formatPlaytime(m.totalMs)}
                      </td>
                      <td className="px-4 py-3 text-right text-fg-muted">
                        {m.uniqueUsers}
                      </td>
                      <td className="px-4 py-3 text-right text-fg-dim">
                        {m.lastPlayedAt
                          ? new Date(m.lastPlayedAt).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

function Counter({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-bg-base/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className={cn(
            "size-4",
            tone === "accent" ? "text-accent" : "text-fg-muted",
          )}
        />
        <span className="text-[11px] uppercase tracking-wider text-fg-dim">{label}</span>
      </div>
      <div
        className={cn(
          "font-display text-2xl",
          tone === "accent" ? "text-accent" : "text-fg-primary",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-fg-muted">{hint}</div>}
    </div>
  );
}
