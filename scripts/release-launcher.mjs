#!/usr/bin/env node
// Build a Velopack release for Simple Launcher and stage it into
// `hosting/launcher/<channel>/` so `firebase deploy --only hosting`
// publishes it on the auto-update endpoint.
//
// Pipeline (Velopack-based, v27+):
//   1. Read CHANGELOG.md [Unreleased] block — refuse if empty
//   2. cargo build --release (raw .exe at src-tauri/target/release/)
//   3. Stage simple-launcher.exe + Tauri resources into a clean
//      pack dir
//   4. vpk pack — produces Setup.exe + <id>-<ver>-full.nupkg +
//      <id>-<ver>-delta.nupkg + RELEASES manifest in hosting/
//      launcher/win/
//   5. Rewrite CHANGELOG.md to move [Unreleased] under the new
//      version heading, leaving a fresh [Unreleased] template
//
// Calver versioning:
//   - Internal semver: YY.MMDD.S (e.g. 27.506.0)
//   - Display: vYY.MM.DD or vYY.MM.DD.{S+1} (e.g. v27.05.06.2)
// The version used is whatever is currently in tauri.conf.json. To bump
// it, run `npm run bump` first (auto-detects today's date and sequence).
//
// Usage:
//   1. Add entries under "## [Unreleased]" in CHANGELOG.md as you work.
//   2. npm run bump                       ← bump to today's date
//   3. node scripts/release-launcher.mjs  ← build + pack + write hosting/
//   4. firebase deploy --only hosting     ← only with explicit user OK
//
// Velopack env vars used :
//   - VELOPACK_VPK    optional override path to vpk.exe (else $PATH)
//   - DOTNET_ROLL_FORWARD set to LatestMajor so vpk runs on .NET 10
//
// Refuses to release if CHANGELOG.md [Unreleased] is empty.

import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(fileURLToPath(import.meta.url), "../..");
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const version = conf.version;
const productName = conf.productName;
const displayVersion = formatDisplay(version);
const changelogPath = join(root, "CHANGELOG.md");

// Velopack pack id — must stay stable across versions or the updater
// won't recognize an existing install as the same app. Lower-case +
// no spaces (Velopack convention, also avoids Windows path issues).
const PACK_ID = "SimpleLauncher";
const CHANNEL = "win";

console.log(`\n— Release Simple Launcher ${displayVersion} (semver ${version}) via Velopack —\n`);

// ── 0. vpk discovery ─────────────────────────────────────────────────
//
// vpk is the Velopack CLI (.NET tool installed via `dotnet tool
// install -g vpk`). We try $VELOPACK_VPK first, then $USERPROFILE/
// .dotnet/tools/vpk.exe (default global-tool location), then fall back
// to PATH lookup.
const vpkExe = resolveVpk();
function runVpk(args) {
  // DOTNET_ROLL_FORWARD allows vpk (which targets .NET 8/9) to run on
  // a system that only has .NET 10 SDK installed. No-op when the
  // matching runtime is present.
  execSync(`"${vpkExe}" ${args}`, {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, DOTNET_ROLL_FORWARD: "LatestMajor" },
  });
}

const { userBody, rewrittenChangelog } = extractAndRewriteChangelog(
  changelogPath,
  version,
  displayVersion,
);
if (!userBody.trim()) {
  console.error("Refus de release : aucune entrée user-facing dans [Unreleased].");
  console.error(
    "Ajoute au moins une ligne sous Nouveau / Amélioré / Corrigé / Supprimé /\n" +
      "Sécurité avant de release. La section « Détails techniques » seule ne suffit\n" +
      "pas — une release doit avoir au moins quelque chose à dire à l'utilisateur.",
  );
  console.error("Convention : docs/CHANGELOG_STYLE.md");
  process.exit(1);
}

// ── 1. Build the raw .exe via tauri build --no-bundle ─────────────────
//
// `tauri build --no-bundle` gives us exactly what Velopack needs : the
// raw simple-launcher.exe with the frontend assets embedded, but
// without NSIS/MSI bundling. We can NOT use `cargo build --release`
// directly because Tauri's `tauri-build` crate relies on env vars set
// by the Tauri CLI to signal release mode (otherwise the binary tries
// to load the frontend from `devUrl: http://localhost:1420` even in
// release builds, which fails for users without a dev server).
//
// The `beforeBuildCommand: npm run build` from tauri.conf.json runs
// automatically as part of `tauri build`, so we don't need to call
// vite ourselves.
console.log("[1/3] Building Tauri app (tauri build --no-bundle)…");
execSync("npx tauri build --no-bundle", { stdio: "inherit", cwd: root });

const targetExe = join(root, "src-tauri", "target", "release", "simple-launcher.exe");
if (!existsSync(targetExe)) {
  console.error(`Build failed : ${targetExe} introuvable.`);
  process.exit(1);
}

// ── 2. Stage the binaries for vpk ─────────────────────────────────────
//
// Velopack's `pack` command takes a directory containing all the files
// the app needs at runtime. For a Tauri 2 app that's just the .exe
// (resources are embedded). We copy it into a clean staging dir so vpk
// doesn't pick up unrelated cargo artefacts. The target name is
// "simple-launcher.exe" — used both as the staged file and as
// `--mainExe` so Velopack knows which exe to launch on first run.
console.log("[2/3] Staging binaries for vpk pack…");
const stageDir = join(root, "src-tauri", "target", "velo-stage");
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
copyFileSync(targetExe, join(stageDir, "simple-launcher.exe"));

// Release notes file for vpk (markdown). Trim to keep the .nupkg lean.
const releaseNotesPath = join(stageDir, "release-notes.md");
writeFileSync(releaseNotesPath, userBody.trim() + "\n");

// ── 3. vpk pack ──────────────────────────────────────────────────────
//
// Output goes to hosting/launcher/win/ which is exactly what the
// Velopack HttpSource in src-tauri/src/velo_updater.rs expects. The
// outputs include :
//   - Setup.exe                                (bootstrap installer)
//   - <PackId>-<ver>-full.nupkg                (full package)
//   - <PackId>-<ver>-delta.nupkg               (delta from previous)
//   - RELEASES                                 (manifest)
console.log("[3/3] Running vpk pack…");
const outputDir = join(root, "hosting", "launcher", CHANNEL);
mkdirSync(outputDir, { recursive: true });
const iconPath = join(root, "src-tauri", "icons", "icon.ico");
const splashPath = join(root, "src-tauri", "installer", "sidebar.bmp");

runVpk(
  [
    `pack`,
    `--packId "${PACK_ID}"`,
    `--packVersion "${version}"`,
    `--packTitle "${productName}"`,
    `--packAuthors "Simple Launcher"`,
    `--packDir "${stageDir}"`,
    `--mainExe "simple-launcher.exe"`,
    `--icon "${iconPath}"`,
    `--splashImage "${splashPath}"`,
    `--releaseNotes "${releaseNotesPath}"`,
    `--outputDir "${outputDir}"`,
    `--channel "${CHANNEL}"`,
    `--shortcuts Desktop,StartMenuRoot`,
    `--delta BestSpeed`,
  ].join(" "),
);

// Stable "always-latest" download stub — copies Setup.exe into
// hosting/download/ so the public download URL stays consistent across
// releases (mirror of the previous SimpleLauncher-Setup.exe).
console.log("[+] Mirroring Setup.exe into hosting/download/…");
const setupExe = join(outputDir, `${PACK_ID}-win-Setup.exe`);
const stableDir = join(root, "hosting", "download");
mkdirSync(stableDir, { recursive: true });
if (existsSync(setupExe)) {
  copyFileSync(setupExe, join(stableDir, "SimpleLauncher-Setup.exe"));
} else {
  console.warn(`[warn] ${setupExe} introuvable — pas de mirror, vérifier vpk output.`);
}

// ── Maintain hosting/launcher/versions.json (cumulative history) ──
//
// This file is the source of truth for the public /changelog.html page
// and the in-app changelog viewer. Each release prepends a fresh
// entry. The schema changed slightly vs. the NSIS era — `url` is now
// the Velopack RELEASES manifest URL, not a direct .exe link, since
// the in-app updater goes through Velopack and not a tauri-plugin-
// updater latest.json.
const versionsPath = join(root, "hosting", "launcher", "versions.json");
const manifestEntry = {
  version,
  displayVersion,
  notes: userBody.trim(),
  pub_date: new Date().toISOString(),
  channel: CHANNEL,
};
let versionsList = [];
if (existsSync(versionsPath)) {
  try {
    const raw = JSON.parse(readFileSync(versionsPath, "utf8"));
    if (Array.isArray(raw)) versionsList = raw;
  } catch (err) {
    console.warn(`Existing versions.json was unparseable, starting fresh: ${err.message}`);
  }
}
const dedupedVersions = versionsList.filter((entry) => entry?.version !== version);
dedupedVersions.unshift(manifestEntry);
writeFileSync(versionsPath, JSON.stringify(dedupedVersions, null, 2) + "\n");

console.log("[+] Rewriting CHANGELOG.md…");
writeFileSync(changelogPath, rewrittenChangelog);

console.log(`\n✓ Release ${displayVersion} prête dans hosting/launcher/${CHANNEL}/`);
console.log(`Étapes suivantes (à valider explicitement par l'utilisateur) :`);
console.log(`    firebase deploy --only hosting       ← publie l'update sur le CDN`);
console.log(`    npm run release:notify               ← envoie l'embed Discord\n`);

// ---------------------------------------------------------------------------

/**
 * Locate the vpk CLI executable. Velopack's official install path is
 * the .NET global-tools dir, but allow a VELOPACK_VPK env override for
 * CI / power users. Falls back to PATH lookup.
 */
function resolveVpk() {
  if (process.env.VELOPACK_VPK && existsSync(process.env.VELOPACK_VPK)) {
    return process.env.VELOPACK_VPK;
  }
  const home = homedir();
  const candidates = [
    join(home, ".dotnet", "tools", "vpk.exe"),
    join(home, ".dotnet", "tools", "vpk"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to bare "vpk" — assumes it's on PATH.
  return "vpk";
}

function parseVersion(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((semver ?? "").trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const mmdd = parseInt(m[2], 10);
  const sequence = parseInt(m[3], 10);
  const month = Math.floor(mmdd / 100);
  const day = mmdd % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, sequence };
}

function formatDisplay(semver) {
  const p = parseVersion(semver);
  if (!p) return `v${semver}`;
  const yy = String(p.year).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  const suffix = p.sequence > 0 ? `.${p.sequence + 1}` : "";
  return `v${yy}.${mm}.${dd}${suffix}`;
}

function extractAndRewriteChangelog(path, releaseSemver, releaseDisplay) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n");

  const unreleasedHeader = "## [Unreleased]";
  const start = lines.findIndex((l) => l.trim() === unreleasedHeader);
  if (start === -1) {
    throw new Error("Section ## [Unreleased] introuvable dans CHANGELOG.md");
  }

  const nextHeading = lines.slice(start + 1).findIndex((l) => /^## \[/.test(l.trim()));
  const end = nextHeading === -1 ? lines.length : start + 1 + nextHeading;

  const block = lines.slice(start + 1, end);

  // Le block est splitté en 2 :
  //   - userBlock     : sections user-facing (Nouveau / Amélioré / Corrigé /
  //                     Supprimé / Sécurité). Exclut « Détails techniques ».
  //                     Utilisé pour release-notes.md (Velopack), versions.json
  //                     (page changelog publique), embed Discord.
  //   - archivalBlock : tout le contenu, y compris les détails techniques.
  //                     Réinjecté dans CHANGELOG.md sous le header de version
  //                     pour archive interne / contexte futur.
  // Voir docs/CHANGELOG_STYLE.md pour la convention d'écriture.
  const userBlock = stripEmptyCategories(stripTechnicalSection(block));
  const archivalBlock = stripEmptyCategories(block);
  const userBody = userBlock.join("\n").trim();

  const today = new Date().toISOString().slice(0, 10);
  const versionHeader = `## [${releaseDisplay}] - ${today}  · semver \`${releaseSemver}\``;
  const emptyUnreleased = [
    "## [Unreleased]",
    "",
    "<!--",
    "  Style guide : voir docs/CHANGELOG_STYLE.md",
    "  Une phrase courte, lisible par un user. Pas de chemin de fichier ni de",
    "  jargon. Le bénéfice user, pas la cause technique.",
    "  Si tu ajoutes X et que tu fix un bug de X dans le même cycle, garde",
    '  juste "Nouveau X" — le bug n\'a jamais été en prod.',
    "-->",
    "",
    "### Nouveau",
    "",
    "### Amélioré",
    "",
    "### Corrigé",
    "",
    "### Supprimé",
    "",
    "### Sécurité",
    "",
    "<!-- ──────────────────────────────────────────────────────────────────",
    "     DÉTAILS TECHNIQUES — Archive interne, NON affichée au user.",
    "     Le release script `scripts/release-launcher.mjs` exclut cette",
    "     section des release notes envoyées via Velopack et Discord.",
    "     ────────────────────────────────────────────────────────────────── -->",
    "",
    "### Détails techniques",
    "",
  ];

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const versionedBlock = [versionHeader, "", ...archivalBlock];
  const rewritten = [...before, ...emptyUnreleased, ...versionedBlock, ...after].join("\n");

  return { userBody, rewrittenChangelog: rewritten };
}

/**
 * Retire la sous-section "### Détails techniques" (et tout son contenu
 * jusqu'au prochain "### " ou la fin du block) d'une liste de lignes.
 * Utilisé pour séparer les notes user-facing de l'archive interne.
 */
function stripTechnicalSection(lines) {
  const out = [];
  let inTech = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Match "### Détails techniques" — accent insensible, casse insensible
    if (/^###\s+d[eé]tails techniques\s*$/i.test(trimmed)) {
      inTech = true;
      continue;
    }
    // Une nouvelle section "### " sibling clôt le block tech
    if (inTech && /^### /.test(trimmed)) {
      inTech = false;
    }
    if (!inTech) out.push(line);
  }
  return out;
}

function stripEmptyCategories(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^### /.test(line.trim())) {
      let j = i + 1;
      let hasContent = false;
      while (j < lines.length && !/^###?\s/.test(lines[j].trim())) {
        if (lines[j].trim()) {
          hasContent = true;
          break;
        }
        j++;
      }
      if (!hasContent) continue;
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}
