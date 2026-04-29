import { useEffect, useState } from "react";

/**
 * Sample player returned by mcsrvstat.us — the server can disable this list
 * for privacy. UUIDs are stable and used to fetch skin/head renders from
 * crafatar.com on the UI side.
 */
export type SamplePlayer = {
  name: string;
  uuid?: string;
};

/** Server software fingerprint — `name` is a coarse family (Paper / Spigot /
 *  Forge / Vanilla / etc.), `version` is the MC version string. */
export type ServerSoftware = {
  name: string;
  version: string;
  protocol?: number;
};

export type MinecraftStatus = {
  online: boolean;
  players?: { online: number; max: number };
  /** Up to 12 random players currently logged in — when the server allows it. */
  playersList?: SamplePlayer[];
  version?: string;
  software?: ServerSoftware;
  /** Forge / NeoForge mod list when the server runs a modded loader. */
  mods?: { name: string; version?: string }[];
  motd?: { clean?: string[]; html?: string[]; raw?: string[] };
  /** Base64-encoded PNG of the 64×64 server favicon (without the data: prefix). */
  icon?: string;
  /** Resolved IPv4 of the server (mcsrvstat does the DNS+SRV resolution for us). */
  ipv4?: string;
  /** Round-trip time from this client to mcsrvstat.us — proxy for the user's
   *  ping to the server. Computed client-side from fetch timing. */
  latencyMs?: number;
  fetchedAt: number;
} | null;

const cache = new Map<string, { data: MinecraftStatus; expiresAt: number }>();
const CACHE_MS = 30_000;

export async function fetchMinecraftStatus(address: string): Promise<MinecraftStatus> {
  const hit = cache.get(address);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  try {
    const startedAt = performance.now();
    const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`);
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // mcsrvstat returns `players.list` as an array of `{ name, uuid }` objects.
    // Older API versions used plain strings — normalize defensively.
    const rawList: unknown[] = Array.isArray(data?.players?.list) ? data.players.list : [];
    const playersList: SamplePlayer[] = rawList
      .map((item): SamplePlayer | null => {
        if (typeof item === "string") return { name: item };
        if (item && typeof item === "object") {
          const obj = item as { name?: unknown; uuid?: unknown };
          if (typeof obj.name === "string") {
            const uuid = typeof obj.uuid === "string" && obj.uuid.length > 0 ? obj.uuid : undefined;
            return { name: obj.name, uuid };
          }
        }
        return null;
      })
      .filter((p): p is SamplePlayer => p !== null);

    // mcsrvstat exposes `version` as a plain string; software family lives in
    // `software` (Forge / Paper / etc.) when detected. Combine both into one
    // structured object so the UI can display "Paper 1.21.1" cleanly.
    const versionStr = typeof data?.version === "string" ? data.version : undefined;
    const softwareName = typeof data?.software === "string" ? data.software : undefined;
    const protocol = typeof data?.protocol === "object"
      ? (data.protocol as { version?: number }).version
      : typeof data?.protocol === "number"
        ? data.protocol
        : undefined;
    const software: ServerSoftware | undefined = versionStr
      ? {
          name: softwareName ?? inferSoftwareFromVersion(versionStr),
          version: stripSoftwareName(versionStr),
          protocol,
        }
      : undefined;

    // Mod list (Forge/NeoForge `mods` extension on the SLP protocol).
    const rawMods: unknown[] = Array.isArray(data?.mods) ? data.mods : [];
    const mods = rawMods
      .map((m): { name: string; version?: string } | null => {
        if (typeof m === "string") return { name: m };
        if (m && typeof m === "object") {
          const obj = m as { name?: unknown; version?: unknown };
          if (typeof obj.name === "string") {
            return { name: obj.name, version: typeof obj.version === "string" ? obj.version : undefined };
          }
        }
        return null;
      })
      .filter((m): m is { name: string; version?: string } => m !== null);

    const status: MinecraftStatus = {
      online: !!data.online,
      players: data.players ? { online: data.players.online ?? 0, max: data.players.max ?? 0 } : undefined,
      playersList: playersList.length > 0 ? playersList : undefined,
      version: versionStr,
      software,
      mods: mods.length > 0 ? mods : undefined,
      motd: data.motd,
      icon: typeof data.icon === "string" ? data.icon : undefined,
      ipv4: typeof data.ip === "string" ? data.ip : undefined,
      latencyMs,
      fetchedAt: Date.now(),
    };
    cache.set(address, { data: status, expiresAt: Date.now() + CACHE_MS });
    return status;
  } catch (err) {
    console.warn(`[mc-status] fetch failed for ${address}:`, err);
    return null;
  }
}

/**
 * mcsrvstat sometimes returns the version with the software prefix
 * ("Paper 1.21.1") and sometimes just the bare version ("1.21.1"). When the
 * `software` field is missing we sniff it from the version string.
 */
function inferSoftwareFromVersion(v: string): string {
  const lower = v.toLowerCase();
  if (lower.includes("paper")) return "Paper";
  if (lower.includes("purpur")) return "Purpur";
  if (lower.includes("spigot")) return "Spigot";
  if (lower.includes("bukkit")) return "Bukkit";
  if (lower.includes("forge")) return "Forge";
  if (lower.includes("neoforge")) return "NeoForge";
  if (lower.includes("fabric")) return "Fabric";
  if (lower.includes("velocity")) return "Velocity";
  if (lower.includes("waterfall") || lower.includes("bungee")) return "BungeeCord";
  return "Vanilla";
}

function stripSoftwareName(v: string): string {
  // Keep just the MC version like "1.21.1" — drop the leading software label
  // and any extra suffix like " (Forge 47.2.0)".
  const match = /(\d+\.\d+(?:\.\d+)?)/.exec(v);
  return match ? match[1] : v;
}

export function useMinecraftStatus(address: string | undefined | null): MinecraftStatus {
  const [status, setStatus] = useState<MinecraftStatus>(null);

  useEffect(() => {
    if (!address) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const s = await fetchMinecraftStatus(address);
      if (!cancelled) setStatus(s);
    };
    tick();
    const interval = setInterval(tick, CACHE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address]);

  return status;
}
