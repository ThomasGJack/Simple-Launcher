import { useEffect, useState } from "react";

/**
 * Geographical / hosting metadata for a Minecraft server's resolved IP.
 * Returned by free service ip-api.com (45 req/min, no key required) and
 * cached aggressively in localStorage since this data is stable for months.
 */
export type ServerGeo = {
  /** Two-letter ISO country code (used to render the flag emoji). */
  countryCode: string;
  country: string;
  region?: string;
  city?: string;
  /** Hosting provider / ISP name (OVH, Hetzner, Scaleway, …). Useful to
   *  surface "Hébergé chez OVH" alongside the country flag. */
  isp?: string;
  /** AS number / org — sometimes more accurate than `isp` for cloud hosts. */
  asOrg?: string;
};

/**
 * Cache namespace key — bump this whenever we change the lookup endpoint or
 * the on-disk shape so previously-cached *failures* (e.g. mixed-content
 * blocks from the older ip-api.com endpoint) get evicted on next read.
 */
const STORAGE_PREFIX = "mc-geo-v2:";
const TTL_OK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for successful lookups
const TTL_FAIL_MS = 10 * 60 * 1000; // 10 min for negative cache → retry quickly
const inMemory = new Map<string, ServerGeo | null>();

type CacheEntry = {
  data: ServerGeo | null;
  expiresAt: number;
};

function readCache(ip: string): ServerGeo | null | undefined {
  if (inMemory.has(ip)) return inMemory.get(ip);
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + ip);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_PREFIX + ip);
      return undefined;
    }
    inMemory.set(ip, entry.data);
    return entry.data;
  } catch {
    return undefined;
  }
}

function writeCache(ip: string, data: ServerGeo | null) {
  inMemory.set(ip, data);
  try {
    // Successful lookups stay cached for 30 days (server location doesn't
    // change). Failures expire after 10 min so we retry quickly when the
    // upstream service comes back / the user reconnects / etc.
    const ttl = data === null ? TTL_FAIL_MS : TTL_OK_MS;
    const entry: CacheEntry = { data, expiresAt: Date.now() + ttl };
    localStorage.setItem(STORAGE_PREFIX + ip, JSON.stringify(entry));
  } catch {
    /* localStorage quota / disabled — fail silently */
  }
}

export async function fetchServerGeo(ip: string): Promise<ServerGeo | null> {
  const cached = readCache(ip);
  if (cached !== undefined) return cached;

  try {
    // ipapi.co — free tier (1000 req/day), HTTPS-native, no API key.
    // Critical: ip-api.com (a popular alternative) is HTTP-only on the free
    // tier, which would be blocked by the browser's mixed-content policy
    // when the launcher runs in production over HTTPS. ipapi.co keeps things
    // working in both `tauri dev` (http://localhost) and prod (https://...).
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (!res.ok) {
      writeCache(ip, null);
      return null;
    }
    const data = (await res.json()) as {
      error?: boolean;
      country_code?: string;
      country_name?: string;
      region?: string;
      city?: string;
      org?: string;
      asn?: string;
    };
    if (data.error || !data.country_code) {
      writeCache(ip, null);
      return null;
    }
    const geo: ServerGeo = {
      countryCode: data.country_code,
      country: data.country_name ?? data.country_code,
      region: data.region,
      city: data.city,
      // ipapi.co's `org` is the equivalent of ip-api's `isp` (e.g. "OVH SAS").
      // `asn` looks like "AS16276 OVH SAS" — useful as a fallback.
      isp: data.org,
      asOrg: data.asn,
    };
    writeCache(ip, geo);
    return geo;
  } catch (err) {
    console.warn(`[server-geo] fetch failed for ${ip}:`, err);
    writeCache(ip, null);
    return null;
  }
}

/**
 * Converts a 2-letter ISO country code to its flag emoji using the regional
 * indicator code points. Avoids any image asset / CDN — works offline once
 * the system has the emoji font.
 */
export function countryFlag(code: string | undefined | null): string {
  if (!code || code.length !== 2) return "🌐";
  const upper = code.toUpperCase();
  const A = 0x41;
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + (upper.charCodeAt(0) - A),
    REGIONAL_INDICATOR_A + (upper.charCodeAt(1) - A),
  );
}

export function useServerGeo(ip: string | undefined | null): ServerGeo | null {
  const [geo, setGeo] = useState<ServerGeo | null>(null);

  useEffect(() => {
    if (!ip) {
      setGeo(null);
      return;
    }
    let cancelled = false;
    fetchServerGeo(ip).then((g) => {
      if (!cancelled) setGeo(g);
    });
    return () => {
      cancelled = true;
    };
  }, [ip]);

  return geo;
}
