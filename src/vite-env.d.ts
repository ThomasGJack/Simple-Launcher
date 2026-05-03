/// <reference types="vite/client" />

/**
 * Calver-formatted launcher version (e.g. "v26.04.29.10") injected at
 * build time by Vite's `define` config. Always available synchronously on
 * module load — no need to await `getVersion()` to know the version for
 * log filenames, telemetry, etc. Falls back to "vdev" in dev builds where
 * tauri.conf.json couldn't be read.
 */
declare const __APP_CALVER__: string;
