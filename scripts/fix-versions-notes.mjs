#!/usr/bin/env node
// One-shot helper : recompute versions.json[0].notes from CHANGELOG.md
// using the cleaned (HTML-comment + empty-category-stripped) block. Used
// the day we noticed the v26.05.08 notes were dirty in the published
// versions.json + Discord webhook embed. Self-contained — re-uses the
// same stripping logic as release-launcher.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const versionsPath = join(root, "hosting", "launcher", "versions.json");
const changelogPath = join(root, "CHANGELOG.md");

const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
if (!versions[0]) {
  console.error("versions.json[0] missing");
  process.exit(1);
}
const target = versions[0];
console.log(`Fixing notes for ${target.displayVersion} (${target.version})…`);

// Find the matching `## [vX.Y.Z]` block in CHANGELOG.md
const lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);
const headerIdx = lines.findIndex((l) =>
  l.trim().startsWith(`## [${target.displayVersion}]`),
);
if (headerIdx === -1) {
  console.error(`Header for ${target.displayVersion} not found in CHANGELOG`);
  process.exit(1);
}
// End : next `## ` or EOF
let endIdx = lines.length;
for (let i = headerIdx + 1; i < lines.length; i++) {
  if (/^## /.test(lines[i])) {
    endIdx = i;
    break;
  }
}
const block = lines.slice(headerIdx + 1, endIdx);

const cleaned = stripEmptyCategories(
  stripTechnicalSection(stripHtmlComments(block)),
);
const newNotes = cleaned.join("\n").trim();

target.notes = newNotes;
writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + "\n", "utf8");
console.log("✓ versions.json updated");
console.log("\n--- New notes ---\n");
console.log(newNotes);

// ─── Same fns as release-launcher.mjs ───────────────────────────────

function stripHtmlComments(input) {
  const out = [];
  let inComment = false;
  for (const line of input) {
    if (inComment) {
      const closeIdx = line.indexOf("-->");
      if (closeIdx === -1) continue;
      const after = line.slice(closeIdx + 3);
      inComment = false;
      if (after.trim()) out.push(after);
      continue;
    }
    const openIdx = line.indexOf("<!--");
    if (openIdx === -1) {
      out.push(line);
      continue;
    }
    const before = line.slice(0, openIdx);
    const closeIdx = line.indexOf("-->", openIdx + 4);
    if (closeIdx !== -1) {
      const after = line.slice(closeIdx + 3);
      const cleaned = before + after;
      if (cleaned.trim()) out.push(cleaned);
      continue;
    }
    if (before.trim()) out.push(before);
    inComment = true;
  }
  return out;
}

function stripTechnicalSection(input) {
  const out = [];
  let inTech = false;
  for (const line of input) {
    const trimmed = line.trim();
    if (/^###\s+d[eé]tails techniques\s*$/i.test(trimmed)) {
      inTech = true;
      continue;
    }
    if (inTech && /^### /.test(trimmed)) {
      inTech = false;
    }
    if (!inTech) out.push(line);
  }
  return out;
}

function stripEmptyCategories(input) {
  const out = [];
  for (let i = 0; i < input.length; i++) {
    const line = input[i];
    if (/^### /.test(line.trim())) {
      let j = i + 1;
      let hasContent = false;
      while (j < input.length && !/^###?\s/.test(input[j].trim())) {
        if (input[j].trim()) {
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
