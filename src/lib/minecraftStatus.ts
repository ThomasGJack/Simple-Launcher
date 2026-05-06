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
  /** Round-trip time from this client to the API — proxy for the user's
   *  ping to the server. Computed client-side from fetch timing. */
  latencyMs?: number;
  fetchedAt: number;
} | null;

const cache = new Map<string, { data: MinecraftStatus; expiresAt: number }>();
const CACHE_MS = 30_000;
/**
 * After a fetch fails or returns offline, we keep showing the previous
 * "online" state for up to STICKY_MS to avoid the card flickering
 * between online/offline when one of the two backends has a hiccup.
 * The next successful poll will replace the stickied state immediately.
 */
const STICKY_MS = 90_000;
const lastOnlineCache = new Map<string, { data: NonNullable<MinecraftStatus>; at: number }>();

/**
 * Try a list of status backends in order, returning the first successful
 * response. Each backend has its own URL + parser. We don't race them
 * simultaneously to avoid pointless network noise — sequential is fine
 * since each lookup is fast (~100-500ms).
 */
async function fetchFromBackends(address: string): Promise<MinecraftStatus> {
  // Backend #1 : mcsrvstat.us — most feature-rich (icon, mods, players,
  // MOTD), supports SRV records. Sometimes returns 503 / hangs ; we
  // fall back when that happens.
  const mcsrvstat = await fetchFromMcsrvstat(address);
  if (mcsrvstat) return mcsrvstat;

  // Backend #2 : mcstatus.io — alternative API, simpler shape but
  // very reliable. Fields are slightly different (no `mods`, no
  // `software` family) so we adapt.
  const mcstatus = await fetchFromMcstatusIo(address);
  if (mcstatus) return mcstatus;

  return null;
}

async function fetchFromMcsrvstat(address: string): Promise<MinecraftStatus> {
  try {
    const startedAt = performance.now();
    const res = await fetchWithTimeout(
      `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`,
      6000,
    );
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!res.ok) return null;
    const data = await res.json();

    const rawList: unknown[] = Array.isArray(data?.players?.list)
      ? data.players.list
      : [];
    const playersList: SamplePlayer[] = rawList
      .map((item): SamplePlayer | null => {
        if (typeof item === "string") return { name: item };
        if (item && typeof item === "object") {
          const obj = item as { name?: unknown; uuid?: unknown };
          if (typeof obj.name === "string") {
            const uuid =
              typeof obj.uuid === "string" && obj.uuid.length > 0
                ? obj.uuid
                : undefined;
            return { name: obj.name, uuid };
          }
        }
        return null;
      })
      .filter((p): p is SamplePlayer => p !== null);

    const versionStr = typeof data?.version === "string" ? data.version : undefined;
    const softwareName =
      typeof data?.software === "string" ? data.software : undefined;
    const protocol =
      typeof data?.protocol === "object"
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

    const rawMods: unknown[] = Array.isArray(data?.mods) ? data.mods : [];
    const mods = rawMods
      .map((m): { name: string; version?: string } | null => {
        if (typeof m === "string") return { name: m };
        if (m && typeof m === "object") {
          const obj = m as { name?: unknown; version?: unknown };
          if (typeof obj.name === "string") {
            return {
              name: obj.name,
              version:
                typeof obj.version === "string" ? obj.version : undefined,
            };
          }
        }
        return null;
      })
      .filter((m): m is { name: string; version?: string } => m !== null);

    return {
      online: !!data.online,
      players: data.players
        ? { online: data.players.online ?? 0, max: data.players.max ?? 0 }
        : undefined,
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
  } catch (err) {
    console.warn(`[mc-status] mcsrvstat fetch failed for ${address}:`, err);
    return null;
  }
}

async function fetchFromMcstatusIo(address: string): Promise<MinecraftStatus> {
  try {
    const startedAt = performance.now();
    const res = await fetchWithTimeout(
      `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(address)}`,
      6000,
    );
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!res.ok) return null;
    const data = await res.json();

    const motdRaw = typeof data?.motd?.raw === "string" ? data.motd.raw : undefined;
    const motdClean = typeof data?.motd?.clean === "string" ? data.motd.clean : undefined;
    const versionName =
      typeof data?.version?.name_clean === "string"
        ? data.version.name_clean
        : typeof data?.version?.name === "string"
          ? data.version.name
          : undefined;
    const protocol =
      typeof data?.version?.protocol === "number"
        ? data.version.protocol
        : undefined;

    // mcstatus.io's player list is `data.players.list` of { uuid, name_clean, name_raw }
    const rawList: unknown[] = Array.isArray(data?.players?.list)
      ? data.players.list
      : [];
    const playersList: SamplePlayer[] = rawList
      .map((item): SamplePlayer | null => {
        if (item && typeof item === "object") {
          const obj = item as {
            name_clean?: unknown;
            name_raw?: unknown;
            name?: unknown;
            uuid?: unknown;
          };
          const name =
            typeof obj.name_clean === "string"
              ? obj.name_clean
              : typeof obj.name_raw === "string"
                ? obj.name_raw
                : typeof obj.name === "string"
                  ? obj.name
                  : null;
          if (name) {
            const uuid =
              typeof obj.uuid === "string" && obj.uuid.length > 0
                ? obj.uuid.replace(/-/g, "")
                : undefined;
            return { name, uuid };
          }
        }
        return null;
      })
      .filter((p): p is SamplePlayer => p !== null);

    return {
      online: !!data.online,
      players: data.players
        ? {
            online: data.players.online ?? 0,
            max: data.players.max ?? 0,
          }
        : undefined,
      playersList: playersList.length > 0 ? playersList : undefined,
      version: versionName,
      software: versionName
        ? {
            name: inferSoftwareFromVersion(versionName),
            version: stripSoftwareName(versionName),
            protocol,
          }
        : undefined,
      mods: undefined, // mcstatus.io doesn't surface the mod list
      motd: {
        raw: motdRaw ? [motdRaw] : undefined,
        clean: motdClean ? motdClean.split("\n") : undefined,
      },
      icon: typeof data?.icon === "string"
        ? // mcstatus.io returns a full data URI; strip the prefix to
          // match mcsrvstat's shape (data:image/png;base64,…).
          data.icon
        : undefined,
      ipv4: typeof data?.ip_address === "string" ? data.ip_address : undefined,
      latencyMs,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn(`[mc-status] mcstatus.io fetch failed for ${address}:`, err);
    return null;
  }
}

/**
 * Wrap fetch with an AbortController-based timeout so a hung backend
 * doesn't block our fallback chain. The default browser fetch has no
 * timeout — without this, a backend hanging for 60+ seconds would
 * freeze the polling cycle.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMinecraftStatus(address: string): Promise<MinecraftStatus> {
  const hit = cache.get(address);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const fresh = await fetchFromBackends(address);

  // Sticky state : if the fresh poll says offline (or null = totally
  // failed), but we have a recent online state in cache, surface the
  // online state instead. Servers occasionally have transient hiccups
  // — a single failed poll shouldn't flip the UI to "Hors ligne".
  // After STICKY_MS without any backend confirming online, we accept
  // the offline reality and stop sticking.
  if (fresh && fresh.online) {
    lastOnlineCache.set(address, { data: fresh, at: Date.now() });
    cache.set(address, { data: fresh, expiresAt: Date.now() + CACHE_MS });
    return fresh;
  }

  const lastOnline = lastOnlineCache.get(address);
  if (lastOnline && Date.now() - lastOnline.at < STICKY_MS) {
    // Within the sticky window — keep showing the last good state.
    // We don't re-cache here so the next tick re-tries the network.
    return lastOnline.data;
  }

  // Truly offline (or never seen online recently) — cache the negative
  // result for a shorter window than online so the next poll picks up
  // an "online again" status quickly.
  cache.set(address, { data: fresh, expiresAt: Date.now() + CACHE_MS });
  return fresh;
}

/**
 * mcsrvstat / mcstatus.io sometimes return the version with the software
 * prefix ("Paper 1.21.1") and sometimes just the bare version ("1.21.1").
 * When the explicit software field is missing we sniff it from the version
 * string.
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
