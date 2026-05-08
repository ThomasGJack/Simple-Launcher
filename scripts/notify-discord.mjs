#!/usr/bin/env node
// Post a Discord embed announcing the latest release.
//
// Reads `hosting/launcher/versions.json` (cumulative history written by
// scripts/release-launcher.mjs) and POSTs an embed to a Discord webhook.
// The webhook URL is read from env var DISCORD_RELEASE_WEBHOOK_URL — if
// not set, the script no-ops silently (so calling it from CI without the
// secret doesn't fail the pipeline).
//
// Usage :
//   node scripts/notify-discord.mjs                 ← latest release
//   node scripts/notify-discord.mjs --version 26.506.16
//   node scripts/notify-discord.mjs --dry-run       ← print payload, no POST
//
// Setup :
//   1. Discord channel → Settings → Integrations → New Webhook
//   2. Pick channel + name "Simple Launcher" + paste the launcher logo
//   3. Copy webhook URL → put in `.env` :
//      DISCORD_RELEASE_WEBHOOK_URL=https://discord.com/api/webhooks/...
//   4. The release pipeline calls `npm run release:notify` after deploy.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const versionsPath = join(root, "hosting", "launcher", "versions.json");

// ─── Config ───────────────────────────────────────────────────────────
const SITE_URL = "https://simplelaunche.web.app";
const DOWNLOAD_URL = `${SITE_URL}/download/SimpleLauncher-Setup.exe`;
const CHANGELOG_URL = `${SITE_URL}/changelog.html`;
const LOGO_URL = `${SITE_URL}/logo.png`;
const GOLD_COLOR = 0xfcd34d; // Or = couleur Simple Games (cf. site web)

// ─── Load .env if present (no dotenv dep — minimal parser) ────────────
loadDotEnvFromRoot();

// ─── Args ─────────────────────────────────────────────────────────────
const argVersion = getArgValue("--version");
const dryRun = process.argv.includes("--dry-run");

// ─── Resolve target release ───────────────────────────────────────────
if (!existsSync(versionsPath)) {
  console.error(`[notify-discord] ${versionsPath} introuvable. Lance d'abord npm run release:launcher.`);
  process.exit(1);
}

const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
if (!Array.isArray(versions) || versions.length === 0) {
  console.error("[notify-discord] versions.json vide.");
  process.exit(1);
}

const target = argVersion
  ? versions.find((v) => v.version === argVersion || v.displayVersion === argVersion)
  : versions[0];

if (!target) {
  console.error(`[notify-discord] Version "${argVersion}" introuvable dans versions.json.`);
  process.exit(1);
}

// ─── Build embed ──────────────────────────────────────────────────────
const description = formatNotesForDiscord(target.notes ?? "");
const payload = {
  username: "Simple Launcher",
  avatar_url: LOGO_URL,
  embeds: [
    {
      title: `★ Simple Launcher · ${target.displayVersion ?? "v" + target.version}`,
      url: CHANGELOG_URL,
      description: description || "_Mise à jour disponible — voir le changelog complet._",
      color: GOLD_COLOR,
      thumbnail: { url: LOGO_URL },
      fields: [
        {
          name: "📦 Téléchargement",
          value: `[Setup.exe (~5 MB)](${DOWNLOAD_URL})`,
          inline: true,
        },
        {
          name: "📝 Changelog complet",
          value: `[Voir l'historique](${CHANGELOG_URL})`,
          inline: true,
        },
      ],
      footer: {
        text: "Simple Games · Auto-update activé",
        icon_url: LOGO_URL,
      },
      timestamp: target.pub_date ?? new Date().toISOString(),
    },
  ],
};

// ─── Dry-run : print and exit ─────────────────────────────────────────
if (dryRun) {
  console.log("[notify-discord] --dry-run ; payload :\n");
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

// ─── Webhook URL guard ────────────────────────────────────────────────
const webhookUrl = process.env.DISCORD_RELEASE_WEBHOOK_URL;
if (!webhookUrl) {
  console.warn(
    "[notify-discord] DISCORD_RELEASE_WEBHOOK_URL non défini — skip silencieux.\n" +
      "  Pour activer : ajouter la variable dans .env (cf. .env.example) ou en\n" +
      "  inline : DISCORD_RELEASE_WEBHOOK_URL=https://... npm run release:notify",
  );
  process.exit(0);
}

// ─── POST to webhook ──────────────────────────────────────────────────
console.log(`[notify-discord] POST → ${target.displayVersion ?? target.version}…`);
const res = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const detail = await res.text();
  console.error(`[notify-discord] ✗ Discord a refusé : HTTP ${res.status}\n${detail}`);
  process.exit(1);
}

console.log(`[notify-discord] ✓ Notification envoyée (${target.displayVersion ?? target.version}).`);

// ─────────────────────────────────────────────────────────────────────

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? null : process.argv[idx + 1] ?? null;
}

/**
 * Convert Markdown release notes into a Discord-friendly format. Discord
 * supports a subset of Markdown : bold, italic, code, lists, hyperlinks.
 * Heading levels (## / ###) don't render — convert them to bold lines.
 * Truncate to 4096 chars (Discord embed.description limit).
 */
function formatNotesForDiscord(md) {
  if (!md) return "";
  let out = md
    // Promote ### / ## / # headers to bold
    .replace(/^### (.+)$/gm, "**$1**")
    .replace(/^## (.+)$/gm, "**$1**")
    .replace(/^# (.+)$/gm, "**$1**")
    // Strip our markdown link syntax `[text](path)` for relative source
    // paths (path starts with `(src/`, `(scripts/`, etc.) — they're not
    // useful in a Discord context. Leave http(s) links alone.
    .replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]+\)/g, "$1")
    // Clean trailing whitespace per line
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Discord embed.description limit is 4096 chars
  if (out.length > 3900) {
    out = out.slice(0, 3900).trimEnd() + "…\n\n*[Tronqué — voir le changelog complet]*";
  }
  return out;
}

/**
 * Minimal .env loader — read KEY=VALUE pairs from `.env` at repo root.
 * Doesn't override variables already set in process.env.
 */
function loadDotEnvFromRoot() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip surrounding quotes if any
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore — .env is optional
  }
}
