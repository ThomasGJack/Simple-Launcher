import type { MinecraftModule } from "@/types/module";

/**
 * Frontend helpers for Minecraft modules.
 *
 * History: this file used to host the Prism-based launch path
 * (`findPrism`, `installModpack`, `launchMinecraft`, `deriveMinecraftStatus`,
 * `useLaunchMode`, etc.). All of that was retired in v26.05.03.8 once the
 * in-house native chain became the only launch path. What remains is
 * tiny: per-machine RAM overrides + an MC-version → Java mapping.
 *
 * The actual install/launch entrypoints for native modules live in
 * `MinecraftNativeBuilder` (admin install flow) and the Tauri commands
 * `mc_native_launch` / `mc_vanilla_install` / `mc_fabric_install` /
 * `mc_forge_install` / `mc_modrinth_install` / `mc_zip_install` invoked
 * directly from `ModuleDetailPage.tsx`'s native action panel.
 */

// ─── Per-machine RAM override (localStorage) ──────────────────────────
//
// Each user can pick a heap size that fits their hardware regardless of
// what the admin set as the module-wide default. `null` means "use
// whatever the admin configured".
//
// Stored in MiB (so `8192` = 8 GB). One entry per moduleId so different
// modpacks can have different RAM.

const USER_RAM_KEY_PREFIX = "mc-user-ram:";

export function getUserRamOverride(moduleId: string): number | null {
  try {
    const raw = localStorage.getItem(USER_RAM_KEY_PREFIX + moduleId);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 512 ? parsed : null;
  } catch {
    return null;
  }
}

export function setUserRamOverride(moduleId: string, ramMb: number | null): void {
  try {
    if (ramMb === null || ramMb < 512) {
      localStorage.removeItem(USER_RAM_KEY_PREFIX + moduleId);
    } else {
      localStorage.setItem(USER_RAM_KEY_PREFIX + moduleId, String(ramMb));
    }
  } catch {
    /* localStorage might be disabled — fail silently */
  }
}

/** Returns the RAM (MiB) that should actually be applied at install/launch
 *  time: the user's per-machine override if any, otherwise the admin's
 *  module-wide default, otherwise `null` (= let the JVM pick its own). */
export function getEffectiveRam(module: MinecraftModule): number | null {
  const user = getUserRamOverride(module.id);
  if (user !== null) return user;
  return module.maxRamMb && module.maxRamMb >= 512 ? module.maxRamMb : null;
}

// ─── MC version → Java major mapping ──────────────────────────────────
//
// Mirrors the Rust function in `mc_java.rs` — kept in sync on both sides
// because the UI computes it from the admin-configured `nativeMcVersion`
// while the Rust side computes it from the manifest at install time.
// Returns `null` for unparseable versions.
//
// Mapping:
//   - 1.20.5+ / 1.21+   → Java 21
//   - 1.17 → 1.20.4     → Java 17
//   - 1.16 and older    → Java 8
export function requiredJavaVersion(mcVersion: string | undefined): number | null {
  if (!mcVersion) return null;
  const parts = mcVersion.split(".");
  if (parts.length < 2) return null;
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parts.length >= 3 ? parseInt(parts[2].split("-")[0], 10) || 0 : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  if (major !== 1) return null;
  if (minor >= 21) return 21;
  if (minor === 20 && patch >= 5) return 21;
  if (minor >= 17) return 17;
  return 8;
}
