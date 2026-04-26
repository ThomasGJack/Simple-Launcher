#!/usr/bin/env node
// Build a signed Tauri release and generate the latest.json manifest
// for the auto-updater. Then `firebase deploy --only hosting` publishes it.
//
// Usage:
//   1. Bump version in src-tauri/tauri.conf.json + package.json + src-tauri/Cargo.toml
//   2. Add release notes via env: NOTES="Fix login bug" node scripts/release-launcher.mjs
//   3. firebase deploy --only hosting

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const version = conf.version;
const productName = conf.productName;

console.log(`\n— Release Simple Launcher v${version} —\n`);

const privateKeyPath = join(root, ".tauri-keys", "sign.key");
if (!existsSync(privateKeyPath)) {
  console.error(`Missing private key at ${privateKeyPath}. Run 'npx tauri signer generate' first.`);
  process.exit(1);
}

console.log("[1/3] Building signed release bundle (this can take a while on first build)…");
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
  console.error(`Files in ${nsisDir}:`);
  execSync(`dir "${nsisDir}"`, { stdio: "inherit" });
  process.exit(1);
}

console.log("[2/3] Copying installer + signature into hosting/…");
const releaseDir = join(root, "hosting", "releases", version);
mkdirSync(releaseDir, { recursive: true });
copyFileSync(exePath, join(releaseDir, exeName));
copyFileSync(sigPath, join(releaseDir, basename(sigPath)));

// Stable URL: always-latest installer for first-time installs
const stableDir = join(root, "hosting", "download");
mkdirSync(stableDir, { recursive: true });
copyFileSync(exePath, join(stableDir, "SimpleLauncher-Setup.exe"));

console.log("[3/3] Generating hosting/launcher/latest.json…");
const signature = readFileSync(sigPath, "utf8").trim();
const downloadUrl = `https://simplelaunche.web.app/releases/${version}/${exeName}`;
const manifest = {
  version,
  notes: process.env.NOTES ?? `Release v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: downloadUrl,
    },
  },
};
writeFileSync(join(root, "hosting", "launcher", "latest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n✓ Release v${version} ready in hosting/`);
console.log(`Next: firebase deploy --only hosting\n`);
