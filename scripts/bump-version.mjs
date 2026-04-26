#!/usr/bin/env node
// Bump the launcher version to today's date (calver scheme YY.MMDD.S).
//
// Behavior:
//   - If current version's date matches today → increment the sequence
//     (e.g. 26.426.0 → 26.426.1, displayed as v26.04.26 → v26.04.26.2).
//   - Otherwise → set today's date with sequence 0
//     (e.g. 25.1231.5 → 26.426.0).
//   - Writes the new version to tauri.conf.json, package.json, and
//     src-tauri/Cargo.toml.
//
// Usage: node scripts/bump-version.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
const packageJsonPath = join(root, "package.json");
const cargoTomlPath = join(root, "src-tauri", "Cargo.toml");

const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const oldVersion = conf.version;
const newVersion = computeNextVersion(oldVersion, new Date());

if (newVersion === oldVersion) {
  console.log(`Version inchangée : ${oldVersion} → ${formatDisplay(newVersion)}`);
  process.exit(0);
}

console.log(`Bump : ${oldVersion} (${formatDisplay(oldVersion)}) → ${newVersion} (${formatDisplay(newVersion)})`);

conf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + "\n");

let pkg = readFileSync(packageJsonPath, "utf8");
pkg = pkg.replace(/("version"\s*:\s*")[^"]*(")/, `$1${newVersion}$2`);
writeFileSync(packageJsonPath, pkg);

let cargo = readFileSync(cargoTomlPath, "utf8");
cargo = cargo.replace(/^(version\s*=\s*")[^"]*(")/m, `$1${newVersion}$2`);
writeFileSync(cargoTomlPath, cargo);

console.log("✓ Bump fait dans tauri.conf.json + package.json + Cargo.toml.");

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

function computeNextVersion(currentSemver, today) {
  const yy = today.getUTCFullYear() % 100;
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const current = parseVersion(currentSemver);
  if (current && current.year === yy && current.month === month && current.day === day) {
    return `${yy}.${month * 100 + day}.${current.sequence + 1}`;
  }
  return `${yy}.${month * 100 + day}.0`;
}
