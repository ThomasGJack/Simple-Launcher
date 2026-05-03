import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrapper for the disk cache management commands. Mirrors
 * `src-tauri/src/cache.rs`.
 *
 * The launcher accumulates several caches over time : Java libraries,
 * MC assets, downloaded JREs, temp install dirs. These can be purged
 * independently from Settings → Téléchargements when the user wants
 * to free disk space — the next launch will re-download whatever's
 * needed automatically.
 *
 * Saves and module instances are NEVER touched by these commands —
 * only re-downloadable shared artifacts.
 */

export type CacheCategory = "mc-libraries" | "mc-assets" | "mc-runtimes" | "mc-temp";

export type CacheSnapshot = {
  "mc-libraries": number;
  "mc-assets": number;
  "mc-runtimes": number;
  "mc-temp": number;
  total: number;
  durationMs: number;
};

/** Computes total disk usage (bytes) for each cache category. Heavy
 *  I/O — Rust side punts to a blocking task to keep UI responsive,
 *  but on slow disks with many GB of assets this can take several
 *  seconds. Surface a loading state in the UI. */
export async function cacheCalculateSize(): Promise<CacheSnapshot> {
  return invoke<CacheSnapshot>("cache_calculate_size");
}

/** Removes the disk cache for a category. Idempotent. The next launch
 *  re-downloads what it needs — saves are never affected. */
export async function cachePurge(category: CacheCategory): Promise<void> {
  return invoke<void>("cache_purge", { category });
}
