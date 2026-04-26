#!/usr/bin/env node
// Build a signed Tauri release and generate the latest.json manifest
// for the auto-updater. Reads release notes from CHANGELOG.md ([Unreleased]
// section) and rewrites the changelog to move that block under the new
// version heading.
//
// Then `firebase deploy --only hosting` publishes everything.
//
// Usage:
//   1. Add entries under "## [Unreleased]" in CHANGELOG.md as you work.
//   2. Bump version in src-tauri/tauri.conf.json + package.json + src-tauri/Cargo.toml.
//   3. node scripts/release-launcher.mjs
//   4. firebase deploy --only hosting
//
// The script will refuse to release if [Unreleased] is empty.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const version = conf.version;
const productName = conf.productName;
const changelogPath = join(root, "CHANGELOG.md");

console.log(`\n— Release Simple Launcher v${version} —\n`);

const privateKeyPath = join(root, ".tauri-keys", "sign.key");
if (!existsSync(privateKeyPath)) {
  console.error(`Missing private key at ${privateKeyPath}. Run 'npx tauri signer generate' first.`);
  process.exit(1);
}

const { unreleasedBody, rewrittenChangelog } = extractAndRewriteChangelog(changelogPath, version);
if (!unreleasedBody.trim()) {
  console.error("Refus de release : la section [Unreleased] de CHANGELOG.md est vide.");
  console.error("Ajoute au moins une entrée avant de release.");
  process.exit(1);
}

console.log("[1/4] Building signed release bundle (this can take a while on first build)…");
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

console.log("[2/4] Copying installer + signature into hosting/…");
const releaseDir = join(root, "hosting", "releases", version);
mkdirSync(releaseDir, { recursive: true });
copyFileSync(exePath, join(releaseDir, exeName));
copyFileSync(sigPath, join(releaseDir, basename(sigPath)));

const stableDir = join(root, "hosting", "download");
mkdirSync(stableDir, { recursive: true });
copyFileSync(exePath, join(stableDir, "SimpleLauncher-Setup.exe"));

console.log("[3/4] Generating hosting/launcher/latest.json…");
const signature = readFileSync(sigPath, "utf8").trim();
const downloadUrl = `https://simplelaunche.web.app/releases/${version}/${exeName}`;
const manifest = {
  version,
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

console.log("[4/4] Rewriting CHANGELOG.md…");
writeFileSync(changelogPath, rewrittenChangelog);

console.log(`\n✓ Release v${version} prête dans hosting/`);
console.log(`Étape suivante (à valider explicitement par l'utilisateur) :`);
console.log(`    firebase deploy --only hosting\n`);

// ---------------------------------------------------------------------------

function extractAndRewriteChangelog(path, releaseVersion) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n");

  const unreleasedHeader = "## [Unreleased]";
  const start = lines.findIndex((l) => l.trim() === unreleasedHeader);
  if (start === -1) {
    throw new Error("Section ## [Unreleased] introuvable dans CHANGELOG.md");
  }

  const nextVersion = lines.slice(start + 1).findIndex((l) => /^## \[/.test(l.trim()));
  const end = nextVersion === -1 ? lines.length : start + 1 + nextVersion;

  const block = lines.slice(start + 1, end);
  const cleanedBlock = stripEmptyCategories(block);
  const unreleasedBody = cleanedBlock.join("\n").trim();

  const today = new Date().toISOString().slice(0, 10);
  const versionHeader = `## [${releaseVersion}] - ${today}`;
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
