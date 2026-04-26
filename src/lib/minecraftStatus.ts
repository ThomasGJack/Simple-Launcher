import { useEffect, useState } from "react";

export type MinecraftStatus = {
  online: boolean;
  players?: { online: number; max: number };
  version?: string;
  motd?: { clean?: string[] };
  icon?: string;
  fetchedAt: number;
} | null;

const cache = new Map<string, { data: MinecraftStatus; expiresAt: number }>();
const CACHE_MS = 30_000;

export async function fetchMinecraftStatus(address: string): Promise<MinecraftStatus> {
  const hit = cache.get(address);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  try {
    const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const status: MinecraftStatus = {
      online: !!data.online,
      players: data.players ? { online: data.players.online ?? 0, max: data.players.max ?? 0 } : undefined,
      version: data.version,
      motd: data.motd,
      icon: data.icon,
      fetchedAt: Date.now(),
    };
    cache.set(address, { data: status, expiresAt: Date.now() + CACHE_MS });
    return status;
  } catch (err) {
    console.warn(`[mc-status] fetch failed for ${address}:`, err);
    return null;
  }
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
