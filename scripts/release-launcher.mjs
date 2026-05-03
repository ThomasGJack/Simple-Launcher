#!/usr/bin/env node
// Build a signed Tauri release and generate the latest.json manifest
// for the auto-updater. Reads release notes from CHANGELOG.md ([Unreleased]
// section) and rewrites the changelog to move that block under the new
// version heading.
//
// Calver versioning:
//   - Internal semver: YY.MMDD.S (e.g. 26.426.0)
//   - Display: vYY.MM.DD or vYY.MM.DD.{S+1} (e.g. v26.04.26 / v26.04.26.2)
// The version used is whatever is currently in tauri.conf.json. To bump it,
// run `npm run bump` first (auto-detects today's date and sequence).
//
// Usage:
//   1. Add entries under "## [Unreleased]" in CHANGELOG.md as you work.
//   2. npm run bump                       ← bump to today's date
//   3. node scripts/release-launcher.mjs  ← build + sign + write hosting/
//   4. firebase deploy --only hosting     ← only with explicit user OK
//
// The script will refuse to release if [Unreleased] is empty.

import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const version = conf.version;
const productName = conf.productName;
const displayVersion = formatDisplay(version);
const changelogPath = join(root, "CHANGELOG.md");

console.log(`\n— Release Simple Launcher ${displayVersion} (semver ${version}) —\n`);

const privateKeyPath = join(root, ".tauri-keys", "sign.key");
if (!existsSync(privateKeyPath)) {
  console.error(`Missing private key at ${privateKeyPath}. Run 'npx tauri signer generate' first.`);
  process.exit(1);
}

const { unreleasedBody, rewrittenChangelog } = extractAndRewriteChangelog(
  changelogPath,
  version,
  displayVersion,
);
if (!unreleasedBody.trim()) {
  console.error("Refus de release : la section [Unreleased] de CHANGELOG.md est vide.");
  console.error("Ajoute au moins une entrée avant de release.");
  process.exit(1);
}

console.log("[1/5] Regenerating installer artwork…");
execSync("node scripts/build-installer-art.mjs", { stdio: "inherit", cwd: root });

console.log("[2/5] Building signed release bundle…");
execSync("npm run tauri:build", {
  stdio: "inherit",
  cwd: root,
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(privateKeyPath, "utf8"),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  },
});

const bundleRoot = join(root, "src-tauri", "target", "release", "bundle");
const nsisDir = join(bundleRoot, "nsis");
if (!existsSync(nsisDir)) {
  console.error(`Bundle dir not found: ${nsisDir}. Did the build succeed?`);
  process.exit(1);
}

const exeName = `${productName}_${version}_x64-setup.exe`;
const exePath = join(nsisDir, exeName);
const sigPath = `${exePath}.sig`;
if (!existsSync(exePath) || !existsSync(sigPath)) {
  console.error(`Expected ${exePath} and ${sigPath} but one is missing.`);
  process.exit(1);
}

console.log("[3/5] Copying installer + signature into hosting/…");
const releaseDir = join(root, "hosting", "releases", version);
mkdirSync(releaseDir, { recursive: true });
copyFileSync(exePath, join(releaseDir, exeName));
copyFileSync(sigPath, join(releaseDir, basename(sigPath)));

const stableDir = join(root, "hosting", "download");
mkdirSync(stableDir, { recursive: true });
copyFileSync(exePath, join(stableDir, "SimpleLauncher-Setup.exe"));

console.log("[4/5] Generating hosting/launcher/latest.json…");
const signature = readFileSync(sigPath, "utf8").trim();
const downloadUrl = `https://simplelaunche.web.app/releases/${version}/${exeName}`;
const manifest = {
  version,
  displayVersion,
  notes: unreleasedBody.trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: downloadUrl,
    },
  },
};
writeFileSync(join(root, "hosting", "launcher", "latest.json"), JSON.stringify(manifest, null, 2) + "\n");

// ── Maintain hosting/launcher/versions.json (cumulative history) ──
//
// This file is the source of truth for the public /changelog.html page.
// Each release prepends a fresh entry here (same shape as latest.json
// but as an array). If the file doesn't exist yet, we initialize it.
// If a release with the same version already exists in the array
// (re-running the release script for whatever reason), we replace it
// in place rather than duplicating.
const versionsPath = join(root, "hosting", "launcher", "versions.json");
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
dedupedVersions.unshift(manifest);
writeFileSync(versionsPath, JSON.stringify(dedupedVersions, null, 2) + "\n");

console.log("[5/5] Rewriting CHANGELOG.md…");
writeFileSync(changelogPath, rewrittenChangelog);

console.log(`\n✓ Release ${displayVersion} prête dans hosting/`);
console.log(`Étape suivante (à valider explicitement par l'utilisateur) :`);
console.log(`    firebase deploy --only hosting\n`);

// ---------------------------------------------------------------------------

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
  const cleanedBlock = stripEmptyCategories(block);
  const unreleasedBody = cleanedBlock.join("\n").trim();

  const today = new Date().toISOString().slice(0, 10);
  const versionHeader = `## [${releaseDisplay}] - ${today}  · semver \`${releaseSemver}\``;
  const emptyUnreleased = [
    "## [Unreleased]",
    "",
    "### Ajouté",
    "",
    "### Changé",
    "",
    "### Corrigé",
    "",
    "### Supprimé",
    "",
    "### Sécurité",
    "",
  ];

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const versionedBlock = [versionHeader, "", ...cleanedBlock];
  const rewritten = [...before, ...emptyUnreleased, ...versionedBlock, ...after].join("\n");

  return { unreleasedBody, rewrittenChangelog: rewritten };
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
