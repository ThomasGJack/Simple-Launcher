import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// Pre-compute the calver display string at build time so the frontend has
// the human-friendly "v26.04.29.10" format available *synchronously* on
// module load (before any async getVersion() call from Tauri can resolve).
// Source of truth: tauri.conf.json (semver "26.429.9"). The conversion
// mirrors `scripts/bump-version.mjs`'s formatDisplay().
const calver = computeCalverFromTauriConfig();

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  define: {
    __APP_CALVER__: JSON.stringify(calver),
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

function computeCalverFromTauriConfig(): string {
  try {
    const conf = JSON.parse(
      readFileSync(path.resolve(__dirname, "src-tauri/tauri.conf.json"), "utf8"),
    );
    const semver = String(conf.version ?? "");
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
    if (!m) return `v${semver || "dev"}`;
    const year = parseInt(m[1], 10);
    const mmdd = parseInt(m[2], 10);
    const seq = parseInt(m[3], 10);
    const month = Math.floor(mmdd / 100);
    const day = mmdd % 100;
    const yy = String(year).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    // bump-version.mjs displays "seq + 1" when seq > 0 (sequence is 0-indexed
    // internally, 1-indexed in display). Mirror that here for consistency.
    const suffix = seq > 0 ? `.${seq + 1}` : "";
    return `v${yy}.${mm}.${dd}${suffix}`;
  } catch {
    return "vdev";
  }
}
