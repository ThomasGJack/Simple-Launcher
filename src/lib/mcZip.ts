import { invoke } from "@tauri-apps/api/core";
import { achievementFlags } from "@/lib/achievementFlags";

/**
 * "Bring-your-own-zip" modpack installer. The user (or admin) hands us
 * a URL pointing to a ZIP that already contains a ready-to-go
 * `.minecraft/`-shaped layout (mods folder + configs + etc.); we just
 * extract it into the instance's `.minecraft/` dir.
 *
 * MC version + loader + loader version are NOT inferred from the zip —
 * they must be configured separately (the admin picks them in the
 * builder). This is the simplest possible modpack flow, designed for
 * pre-baked CurseForge exports or hand-crafted packs where mod-by-mod
 * resolution isn't desired.
 *
 * Reuses the same `mc-vanilla-progress` event channel with phases
 * `zip-dl`, `zip-extract`, `done`.
 */

export async function mcZipInstall(
  zipUrl: string,
  instanceId: string,
): Promise<void> {
  await invoke<void>("mc_zip_install", { zipUrl, instanceId });
  // Custom-zip modpack import counts as a modpack install (achievement #28).
  achievementFlags.markModpackInstalled();
}

/**
 * Parsed summary of the CurseForge `manifest.json` inside a fat-zip,
 * used by the admin form to auto-populate MC version + loader fields
 * when the user uploads or pastes a CF modpack URL. Fields that
 * aren't present in the source manifest come back as `null`.
 */
export type CurseforgeManifestSummary = {
  mcVersion: string | null;
  /** "fabric" | "forge" | "neoforge" | "quilt" | other */
  loader: string | null;
  loaderVersion: string | null;
  name: string | null;
  version: string | null;
  author: string | null;
  /** Number of `files[]` entries in the manifest — informational
   *  ("X mods listés"). */
  fileCount: number;
};

/** Downloads the ZIP at `url`, finds `manifest.json`, returns the
 *  parsed summary. Throws if the ZIP can't be fetched, isn't a valid
 *  ZIP, or doesn't contain a `manifest.json` (= not a CurseForge
 *  export — Modrinth `.mrpack` files use a different schema, handled
 *  by `mc_modrinth.rs` separately). */
export async function mcZipReadManifestUrl(url: string): Promise<CurseforgeManifestSummary> {
  return invoke<CurseforgeManifestSummary>("mc_zip_read_manifest_url", { url });
}

/**
 * Reads a CurseForge `manifest.json` from a local `File` object —
 * no network round-trip. Used right after the user picks a file in
 * the admin form so we can pre-fill MC version + loader BEFORE the
 * Firebase / GitHub upload completes.
 *
 * Pure browser-side parsing via the `fflate` library (~6 KB gzipped),
 * keeps the responsibility split: Rust handles remote URLs, JS
 * handles local Files. Both paths surface the same
 * `CurseforgeManifestSummary` shape.
 */
export async function readCfManifestFromFile(file: File): Promise<CurseforgeManifestSummary> {
  const { unzipSync } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buf, {
      // Only extract `manifest.json` — saves time + memory for big
      // packs. fflate's filter takes the entry name.
      filter: (entry) =>
        entry.name === "manifest.json" || entry.name.endsWith("/manifest.json"),
    });
  } catch (err) {
    throw new Error(
      `Lecture du ZIP local échouée : ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const manifestKey = Object.keys(entries)[0];
  if (!manifestKey) {
    throw new Error(
      "Pas de manifest.json dans le ZIP. Ce n'est pas un export CurseForge — saisis MC version + loader manuellement.",
    );
  }
  const text = new TextDecoder("utf-8").decode(entries[manifestKey]);
  return parseCurseforgeManifestJson(text);
}

type RawCfManifest = {
  minecraft?: {
    version?: string;
    modLoaders?: { id?: string; primary?: boolean }[];
  };
  name?: string;
  version?: string;
  author?: string;
  files?: unknown[];
};

/**
 * Parses a raw CurseForge `manifest.json` text into our launcher's
 * shared `CurseforgeManifestSummary` shape. Mirrors the Rust-side
 * `parse_cf_manifest_bytes` function so URL-based and File-based
 * detection produce identical output.
 */
function parseCurseforgeManifestJson(text: string): CurseforgeManifestSummary {
  let raw: RawCfManifest;
  try {
    raw = JSON.parse(text) as RawCfManifest;
  } catch (err) {
    throw new Error(
      `manifest.json invalide : ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const loaders = raw.minecraft?.modLoaders ?? [];
  const primary = loaders.find((l) => l.primary) ?? loaders[0];
  let loader: string | null = null;
  let loaderVersion: string | null = null;
  if (primary?.id) {
    const dash = primary.id.indexOf("-");
    if (dash > 0) {
      loader = primary.id.slice(0, dash);
      loaderVersion = primary.id.slice(dash + 1);
    } else {
      loader = primary.id;
    }
  }
  return {
    mcVersion: raw.minecraft?.version ?? null,
    loader,
    loaderVersion,
    name: raw.name ?? null,
    version: raw.version ?? null,
    author: raw.author ?? null,
    fileCount: Array.isArray(raw.files) ? raw.files.length : 0,
  };
}
