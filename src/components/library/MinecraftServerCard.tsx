import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Globe, Server, Users, Wifi } from "lucide-react";
import { useMinecraftStatus, type SamplePlayer } from "@/lib/minecraftStatus";
import { countryFlag, useServerGeo } from "@/lib/serverGeo";
import { postServerSnapshot, useServerActivity, type ServerSnapshot } from "@/lib/serverActivity";
import { achievementFlags } from "@/lib/achievementFlags";
import type { MinecraftModule } from "@/types/module";
import { cn } from "@/lib/cn";

/**
 * Display label for the mod loader configured in the admin form. Used as the
 * authoritative software name when mcsrvstat can't detect it from the SLP
 * response (which is most of the time for Forge/NeoForge: those loaders just
 * answer with the bare MC version like "1.21.1", indistinguishable from
 * Vanilla via SLP alone).
 */
const MODLOADER_LABELS: Record<NonNullable<MinecraftModule["modLoader"]>, string> = {
  forge: "Forge",
  fabric: "Fabric",
  quilt: "Quilt",
  neoforge: "NeoForge",
};

/**
 * Rich Minecraft server status card. Combines:
 *  - Live mcsrvstat poll (favicon, player count, MOTD, software, mods, latency)
 *  - Geo-IP lookup (country flag + ISP) — cached 30 days in localStorage
 *  - Crafatar 3D head renders for the sample players
 *  - 24h activity chart (SVG line) backed by Firestore-shared snapshots
 *  - All-time peak from the same Firestore aggregate
 *
 * Side-effect: every successful poll writes a server snapshot to Firestore
 * (rate-limited to once per 5 min per client) so the historical chart
 * accumulates over time across all running launchers.
 */
export function MinecraftServerCard({
  address,
  module,
}: {
  address: string;
  /** Optional — when provided, the admin-configured `modLoader` and
   *  `minecraftVersion` are used as the authoritative source for the
   *  software/version display. SLP rarely advertises Forge/NeoForge/Fabric
   *  explicitly, so without this hint the card would just say "Vanilla". */
  module?: MinecraftModule;
}) {
  const status = useMinecraftStatus(address);
  const geo = useServerGeo(status?.ipv4 ?? null);
  const { history, allTime } = useServerActivity(address);
  const motd = status?.motd?.clean?.join("\n");

  // Resolve the software label / version with priority:
  //   1. The admin-configured modLoader (most reliable for moddedpacks)
  //   2. mcsrvstat's `software` detection (catches Paper / Spigot / etc.)
  //   3. Fallback to "Vanilla" with whatever version we got.
  const resolvedSoftware = useMemo(() => {
    if (!status?.online) return undefined;
    const modLoaderLabel = module?.modLoader ? MODLOADER_LABELS[module.modLoader] : undefined;
    const version =
      module?.minecraftVersion ??
      status.software?.version ??
      status.version ??
      "—";
    const name =
      modLoaderLabel ??
      status.software?.name ??
      "Vanilla";
    return {
      name,
      version,
      protocol: status.software?.protocol,
    };
  }, [status, module]);

  // Achievement #29 "Co-op activé" — the user reached the module page,
  // we successfully pinged the configured server and got an online
  // response. That counts as "rejoindre un serveur (ping détecté)".
  useEffect(() => {
    if (status?.online) achievementFlags.markMcServerJoined();
  }, [status?.online]);

  // Push snapshots to Firestore as new pollings arrive. The util itself
  // rate-limits so this effect can fire freely.
  useEffect(() => {
    if (!status) return;
    postServerSnapshot(
      address,
      status.online,
      status.players?.online ?? 0,
      status.players?.max ?? 0,
    ).catch(() => {
      /* swallowed by the util — no UI surface needed */
    });
  }, [address, status]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="overflow-hidden rounded-3xl glass-strong"
    >
      <ServerHeader
        address={address}
        icon={status?.icon}
        online={status?.online ?? null}
        players={status?.players}
        latencyMs={status?.latencyMs}
        countryCode={geo?.countryCode}
        country={geo?.country}
        isp={geo?.isp ?? geo?.asOrg}
      />

      {status?.online && (
        <div className="space-y-4 px-6 pb-5 pt-4">
          {resolvedSoftware && (
            <SoftwareLine
              name={resolvedSoftware.name}
              version={resolvedSoftware.version}
              modCount={status.mods?.length}
            />
          )}

          {motd && (
            <div className="rounded-xl bg-bg-base/50 p-3 ring-1 ring-white/[0.04]">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-dim">MOTD</div>
              <div className="whitespace-pre-line font-mono text-[11px] text-fg-muted">{motd}</div>
            </div>
          )}

          {status.playersList && status.playersList.length > 0 && (
            <PlayersOnline list={status.playersList} totalOnline={status.players?.online ?? 0} />
          )}

          <ActivityChart
            history={history}
            currentOnline={status.players?.online ?? 0}
            currentMax={status.players?.max ?? 0}
            peakAllTime={allTime?.peakPlayers}
            peakAt={allTime?.peakAt?.toMillis()}
          />
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
//                                  HEADER
// ---------------------------------------------------------------------------

function ServerHeader({
  address,
  icon,
  online,
  players,
  latencyMs,
  countryCode,
  country,
  isp,
}: {
  address: string;
  icon?: string;
  online: boolean | null;
  players?: { online: number; max: number };
  latencyMs?: number;
  countryCode?: string;
  country?: string;
  isp?: string;
}) {
  const latencyTone = latencyTier(latencyMs);
  return (
    <div className="flex items-center gap-4 bg-gradient-to-r from-success/15 to-transparent px-5 py-4">
      <ServerFavicon icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Server className="size-3 shrink-0 text-success" />
          <div className="text-xs uppercase tracking-[0.2em] text-success">Serveur Minecraft</div>
          {countryCode && (
            <span
              className="inline-flex items-center gap-1 text-sm"
              title={
                country && isp ? `${country} · ${isp}` : country ?? countryCode
              }
            >
              {countryFlag(countryCode)}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-fg-muted" title={address}>
          {address}
        </div>
        {(country || isp) && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-fg-dim">
            <Globe className="size-2.5" />
            <span className="truncate">
              {country}
              {isp && ` · ${isp}`}
            </span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {online === null ? (
          <div className="text-xs text-fg-muted">…</div>
        ) : online ? (
          <>
            <div className="font-display text-2xl tabular-nums text-fg-primary">
              {players ? `${players.online}/${players.max}` : "—"}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-success ring-1 ring-success/30">
              <span className="size-1.5 rounded-full bg-success shadow-[0_0_6px_currentColor]" />
              En ligne
            </div>
          </>
        ) : (
          <div className="text-xs uppercase tracking-wider text-danger">Hors ligne</div>
        )}
        {online && latencyMs !== undefined && (
          <div
            className={cn(
              "inline-flex items-center gap-1 text-[10px] tabular-nums",
              latencyTone === "good" && "text-success",
              latencyTone === "ok" && "text-amber-300",
              latencyTone === "bad" && "text-rose-300",
            )}
            title="Latence vers l'API mcsrvstat (proxy de la latence vers le serveur)"
          >
            <Wifi className="size-3" />
            {latencyMs} ms
          </div>
        )}
      </div>
    </div>
  );
}

function latencyTier(ms?: number): "good" | "ok" | "bad" | undefined {
  if (ms === undefined) return undefined;
  if (ms < 120) return "good";
  if (ms < 300) return "ok";
  return "bad";
}

/**
 * Renders the server's 64×64 favicon when available; falls back to a generic
 * server glyph in a glow-cyan tile so the layout stays consistent.
 */
function ServerFavicon({ icon }: { icon?: string }) {
  if (icon) {
    // mcsrvstat returns the icon as a data URI already (`data:image/png;base64,…`).
    return (
      <img
        src={icon}
        alt=""
        className="size-12 shrink-0 rounded-xl ring-1 ring-white/10"
      />
    );
  }
  return (
    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-success/10 text-success ring-1 ring-success/20">
      <Server className="size-5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
//                                SOFTWARE
// ---------------------------------------------------------------------------

function SoftwareLine({
  name,
  version,
  modCount,
}: {
  name: string;
  version: string;
  modCount?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg-base/40 px-3 py-2 text-[11px] ring-1 ring-white/[0.04]">
      <Cpu className="size-3 text-accent" />
      <span className="text-fg-primary">
        <span className="font-medium">{name}</span> <span className="text-fg-muted">{version}</span>
      </span>
      {modCount !== undefined && modCount > 0 && (
        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent ring-1 ring-accent/20">
          {modCount} mods
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              PLAYERS ONLINE
// ---------------------------------------------------------------------------

function PlayersOnline({ list, totalOnline }: { list: SamplePlayer[]; totalOnline: number }) {
  const overflow = Math.max(0, totalOnline - list.length);
  return (
    <div className="rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-dim">
        <Users className="size-3" />
        Joueurs en ligne
        {overflow > 0 && (
          <span className="ml-auto text-fg-muted normal-case tracking-normal">
            +{overflow} non listés
          </span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
        {list.map((player) => (
          <PlayerHead key={player.uuid || player.name} player={player} />
        ))}
      </div>
    </div>
  );
}

function PlayerHead({ player }: { player: SamplePlayer }) {
  // Try a chain of head services, falling back when the previous one fails.
  // Each entry returns null when not applicable (e.g. UUID-only services
  // when we don't have a UUID).
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (player.uuid) {
      list.push(`https://crafatar.com/avatars/${player.uuid}?overlay&size=56`);
      list.push(`https://mc-heads.net/avatar/${player.uuid}/56`);
    }
    list.push(`https://mc-heads.net/avatar/${encodeURIComponent(player.name)}/56`);
    list.push(`https://minotar.net/helm/${encodeURIComponent(player.name)}/56.png`);
    list.push(`https://api.mineatar.io/face/${encodeURIComponent(player.name)}?scale=8`);
    return list;
  }, [player.uuid, player.name]);

  const [idx, setIdx] = useState(0);
  const headUrl = candidates[idx];
  const exhausted = idx >= candidates.length - 1;

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-lg bg-bg-base/40 p-1.5 ring-1 ring-white/[0.04] transition-colors hover:bg-bg-base/60 hover:ring-accent/20"
      title={player.name}
    >
      {headUrl ? (
        <img
          src={headUrl}
          alt={player.name}
          referrerPolicy="no-referrer"
          className="size-10 rounded-md drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
          loading="lazy"
          onError={() => {
            if (!exhausted) setIdx((i) => i + 1);
          }}
        />
      ) : (
        <div className="grid size-10 place-items-center rounded-md bg-bg-elevated text-[9px] uppercase text-fg-dim">
          {player.name.slice(0, 2)}
        </div>
      )}
      <div className="w-full truncate text-center text-[10px] text-fg-muted">
        {player.name}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                              ACTIVITY CHART
// ---------------------------------------------------------------------------

function ActivityChart({
  history,
  currentOnline,
  currentMax,
  peakAllTime,
  peakAt,
}: {
  history: ServerSnapshot[];
  currentOnline: number;
  currentMax: number;
  peakAllTime?: number;
  peakAt?: number;
}) {
  const peak24h = useMemo(() => {
    let m = 0;
    for (const s of history) if (s.playersOnline > m) m = s.playersOnline;
    return Math.max(m, currentOnline);
  }, [history, currentOnline]);

  const chartData = useMemo(() => buildChartPath(history, currentMax, peak24h), [
    history,
    currentMax,
    peak24h,
  ]);

  const peakLabel = peakAllTime !== undefined && peakAllTime > 0;
  const peakDate = peakAt ? new Date(peakAt) : null;

  return (
    <div className="rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider">
        <span className="text-fg-dim">Activité 24h</span>
        <span className="text-fg-muted normal-case tracking-normal">
          Pic 24h <strong className="font-medium text-fg-primary">{peak24h}</strong>
        </span>
      </div>

      {history.length === 0 ? (
        <div className="grid h-16 place-items-center text-[11px] text-fg-dim">
          Pas encore d'historique — la courbe se construit au fur et à mesure que tes potes ouvrent le launcher.
        </div>
      ) : (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="h-16 w-full"
          aria-label="Graphique d'activité sur 24h"
        >
          <defs>
            <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={chartData.areaPath} fill="url(#activity-fill)" />
          <path
            d={chartData.linePath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 2px var(--color-accent-glow))" }}
          />
          {chartData.lastPoint && (
            <circle
              cx={chartData.lastPoint.x}
              cy={chartData.lastPoint.y}
              r="0.9"
              fill="var(--color-accent)"
              style={{ filter: "drop-shadow(0 0 3px var(--color-accent))" }}
            />
          )}
        </svg>
      )}

      {peakLabel && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-fg-muted">
          <span>
            All-time peak : <strong className="font-medium text-fg-primary">{peakAllTime}</strong>
          </span>
          {peakDate && (
            <span className="text-fg-dim">
              le{" "}
              {peakDate.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Builds the SVG path strings for the line chart. Time is normalized to the
 * x-axis (0–100) over the last 24 hours; player counts are normalized to the
 * y-axis (0 at the top of the visible peak, 32 at the baseline) — note the
 * SVG y-axis is inverted so we flip the count.
 */
function buildChartPath(
  history: ServerSnapshot[],
  serverMax: number,
  peak24h: number,
): { linePath: string; areaPath: string; lastPoint: { x: number; y: number } | null } {
  if (history.length === 0) {
    return { linePath: "", areaPath: "", lastPoint: null };
  }
  const ceiling = Math.max(peak24h, 4, serverMax > 0 && serverMax < 60 ? serverMax : 0);
  const startMs = Date.now() - 24 * 60 * 60 * 1000;
  const spanMs = 24 * 60 * 60 * 1000;

  const points = history.map((s) => {
    const t = s.ts.toMillis();
    const x = ((t - startMs) / spanMs) * 100;
    const y = 32 - (s.playersOnline / ceiling) * 30 - 1; // 1px top padding
    return { x: clamp(x, 0, 100), y: clamp(y, 1, 31) };
  });

  // Build a smooth-ish polyline using simple Catmull-Rom-to-Bezier-ish moves.
  let linePath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    linePath += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} 32 L ${first.x.toFixed(2)} 32 Z`;
  return { linePath, areaPath, lastPoint: last };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
