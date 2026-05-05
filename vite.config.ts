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

  build: {
    // Split every lucide-react icon into its own chunk. Without this,
    // Rollup groups all icons used anywhere in the graph into a single
    // ~580 KB vendor chunk that ships eagerly even when 90% of the icons
    // are only referenced from lazy-loaded pages. Per-icon chunking lets
    // each lazy page pull only the icons it actually uses, and the eager
    // bundle drops to just the icons used in Sidebar / TitleBar / root.
    rollupOptions: {
      // Multi-page : `index.html` for the main launcher window,
      // `overlay.html` for the in-game transparent overlay window
      // (toggleable via global hotkey), and `toasts.html` for the
      // always-mounted click-through toast notifications (friend
      // online, new DM, friend launched a game). All three share
      // the same `src/` codebase so common code is hoisted into
      // shared chunks automatically.
      input: {
        main: path.resolve(__dirname, "index.html"),
        overlay: path.resolve(__dirname, "overlay.html"),
        toasts: path.resolve(__dirname, "toasts.html"),
      },
      output: {
        manualChunks(id) {
          // Match `…/lucide-react/dist/esm/icons/{name}.mjs` (forward or
          // back slashes for Windows). Each icon gets its own tiny chunk.
          const iconMatch = id.match(
            /lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/]([^\\/]+)\.mjs$/,
          );
          if (iconMatch) return `lucide/${iconMatch[1]}`;
          // The DynamicIcon path (DynamicIcon + the 115 KB dynamicIcon
          // Imports lookup table) is only consumed by FeatureCards and
          // the admin IconPicker — both lazy. Isolate it so it never
          // gets pulled into the eager chunk just because something
          // shares a sibling import.
          const isLucideEsm =
            id.includes("lucide-react/dist/esm/") ||
            id.includes("lucide-react\\dist\\esm\\");
          if (isLucideEsm) {
            const isDynamic =
              /lucide-react[\\/]dist[\\/]esm[\\/](DynamicIcon|dynamicIconImports)\.mjs$/.test(
                id,
              );
            return isDynamic ? "lucide-dynamic" : "lucide-shared";
          }
        },
      },
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
