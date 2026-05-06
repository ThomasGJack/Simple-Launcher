#!/usr/bin/env node
// Generate Simple Launcher installer artwork (NSIS) from the project logo.
// Output:
//   src-tauri/installer/header.bmp   — 150×57 banner shown at the top of every page
//   src-tauri/installer/sidebar.bmp  — 164×314 banner shown on the welcome / finish pages
//
// NSIS only accepts BMP. Sharp is used for the rich SVG-based composition,
// then Jimp converts the resulting PNG to BMP.
//
// The artwork is intentionally premium-feeling — multi-layer gradients,
// soft glows, clean typography — to match the in-app cyan theme. This
// is what the user sees during install / update so it's the first
// impression of the brand outside the launcher itself.

import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Jimp } from "jimp";

const root = join(fileURLToPath(import.meta.url), "../..");
const outDir = join(root, "src-tauri", "installer");
const logoPath = join(root, "logo.png");

// Brand palette — kept aligned with src/index.css custom properties so
// the installer feels like a continuation of the launcher itself.
const ACCENT = "#00d4ff";
const ACCENT_BRIGHT = "#5be3ff";
const ACCENT_DEEP = "#0096b8";
const FUCHSIA = "#ff3da3";
const VIOLET = "#7b5bff";
const BG_DEEP = "#02060c";
const BG_MID = "#0a1525";
const BG_PANEL = "#0f1d31";
const TEXT = "#ffffff";
const TEXT_MUTED = "#7da4c5";
const TEXT_DIM = "#52708a";

async function main() {
  await mkdir(outDir, { recursive: true });

  const logoBuffer = await readFile(logoPath);
  console.log("[1/2] Building header.bmp (150×57)…");
  await buildHeader(logoBuffer);

  console.log("[2/2] Building sidebar.bmp (164×314)…");
  await buildSidebar(logoBuffer);

  console.log(`\n✓ Installer art written to ${outDir}\n`);
}

async function buildHeader(logoBuffer) {
  const W = 150;
  const H = 57;

  // Background layer — multi-stop gradient + soft cyan radial pulse
  // anchored on the logo side. Tighter contrast than v1 so the
  // wordmark reads cleanly even on cheap LCDs.
  const bg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stop-color="${BG_DEEP}"/>
          <stop offset="40%" stop-color="${BG_MID}"/>
          <stop offset="100%" stop-color="${BG_DEEP}"/>
        </linearGradient>
        <radialGradient id="haloLogo" cx="0.18" cy="0.5" r="0.55">
          <stop offset="0%"  stop-color="${ACCENT}" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="${ACCENT}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="haloRight" cx="0.92" cy="0.5" r="0.45">
          <stop offset="0%"  stop-color="${VIOLET}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${VIOLET}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#haloLogo)"/>
      <rect width="${W}" height="${H}" fill="url(#haloRight)"/>
      <!-- Bottom accent rule with a subtle highlight slice on top -->
      <rect x="0" y="${H - 2}" width="${W}" height="2" fill="${ACCENT}"/>
      <rect x="0" y="${H - 3}" width="${W}" height="1" fill="${ACCENT_BRIGHT}" opacity="0.45"/>
    </svg>
  `);

  // Wordmark — slightly more confident type stack with letter-spacing
  // tuned to match the in-app font-display feel.
  const text = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="62" y="24" font-family="Segoe UI, Arial, sans-serif"
            font-size="14" font-weight="900" fill="${TEXT}" letter-spacing="1.4">
        SIMPLE
      </text>
      <text x="62" y="42" font-family="Segoe UI, Arial, sans-serif"
            font-size="14" font-weight="900" fill="${ACCENT}" letter-spacing="1.4">
        LAUNCHER
      </text>
      <!-- Micro tagline under the wordmark -->
      <text x="62" y="51" font-family="Segoe UI, Arial, sans-serif"
            font-size="5" font-weight="700" fill="${TEXT_DIM}" letter-spacing="2.5">
        MULTI · JEUX · WINDOWS
      </text>
    </svg>
  `);

  // Logo composited to a sharp 50x50, no upscaling artifacts.
  const logo = await sharp(logoBuffer)
    .resize(50, 50, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await convertViaPng(
    sharp(bg)
      .composite([
        { input: logo, top: 3, left: 5 },
        { input: text, top: 0, left: 0 },
      ])
      .toColorspace("srgb")
      .removeAlpha(),
    join(outDir, "header.bmp"),
  );
}

async function buildSidebar(logoBuffer) {
  const W = 164;
  const H = 314;

  // Three-layer composite for depth :
  //   1. Vertical bg gradient (panel → deep)
  //   2. Two soft radial halos (top cyan, bottom-right fuchsia)
  //   3. Decorative diagonal speed lines + neon rim
  const bg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="${BG_PANEL}"/>
          <stop offset="60%" stop-color="${BG_MID}"/>
          <stop offset="100%" stop-color="${BG_DEEP}"/>
        </linearGradient>
        <radialGradient id="halo1" cx="0.5" cy="0.28" r="0.7">
          <stop offset="0%"  stop-color="${ACCENT}" stop-opacity="0.85"/>
          <stop offset="50%" stop-color="${ACCENT}" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="halo2" cx="0.85" cy="0.95" r="0.55">
          <stop offset="0%"  stop-color="${FUCHSIA}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${FUCHSIA}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="halo3" cx="0.1" cy="0.85" r="0.4">
          <stop offset="0%"  stop-color="${VIOLET}" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="${VIOLET}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hairline" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="${ACCENT}" stop-opacity="0"/>
          <stop offset="50%" stop-color="${ACCENT}"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#halo1)"/>
      <rect width="${W}" height="${H}" fill="url(#halo2)"/>
      <rect width="${W}" height="${H}" fill="url(#halo3)"/>

      <!-- Subtle dotted texture in the upper area where the logo sits.
           Reads as a tech / scan-line vibe without dominating. -->
      <g opacity="0.08">
        ${Array.from({ length: 14 })
          .map(
            (_, row) =>
              `<line x1="0" y1="${20 + row * 12}" x2="${W}" y2="${20 + row * 12}" stroke="${ACCENT_BRIGHT}" stroke-width="0.5" stroke-dasharray="1 3"/>`,
          )
          .join("\n")}
      </g>

      <!-- Diagonal speed lines, top + bottom corners -->
      <g opacity="0.16">
        <line x1="-20" y1="40"  x2="200" y2="80"  stroke="${ACCENT_BRIGHT}" stroke-width="1"/>
        <line x1="-20" y1="55"  x2="200" y2="95"  stroke="${ACCENT_BRIGHT}" stroke-width="0.6"/>
        <line x1="-20" y1="280" x2="200" y2="240" stroke="${ACCENT_BRIGHT}" stroke-width="1"/>
        <line x1="-20" y1="293" x2="200" y2="253" stroke="${ACCENT_BRIGHT}" stroke-width="0.6"/>
      </g>

      <!-- Neon rim — bright on the outer edge, soft on the right side -->
      <rect x="0" y="0" width="3" height="${H}" fill="url(#hairline)"/>
      <rect x="${W - 1}" y="0" width="1" height="${H}" fill="${ACCENT}" opacity="0.3"/>
    </svg>
  `);

  // Wordmark + decorative divider + tagline. Tightened spacing and
  // added a small bullet ribbon under the title to read more like a
  // "branded splash" and less like an ad.
  const text = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="${W / 2}" y="200" text-anchor="middle"
            font-family="Segoe UI, Arial, sans-serif"
            font-size="22" font-weight="900" fill="${TEXT}" letter-spacing="3.5">
        SIMPLE
      </text>
      <text x="${W / 2}" y="226" text-anchor="middle"
            font-family="Segoe UI, Arial, sans-serif"
            font-size="22" font-weight="900" fill="${ACCENT}" letter-spacing="3.5">
        LAUNCHER
      </text>

      <!-- Decorative divider : two short cyan bars + dot in the middle -->
      <line x1="${W / 2 - 36}" y1="240" x2="${W / 2 - 6}" y2="240"
            stroke="${ACCENT}" stroke-width="1.5"/>
      <circle cx="${W / 2}" cy="240" r="2" fill="${ACCENT}"/>
      <line x1="${W / 2 + 6}" y1="240" x2="${W / 2 + 36}" y2="240"
            stroke="${ACCENT}" stroke-width="1.5"/>

      <text x="${W / 2}" y="258" text-anchor="middle"
            font-family="Segoe UI, Arial, sans-serif"
            font-size="9" font-weight="700" fill="${TEXT_MUTED}" letter-spacing="3">
        MULTI · JEUX · WINDOWS
      </text>

      <!-- Footer chip : small "v.X" hint that this is an installer
           build. Doesn't include the actual semver since the BMP
           is generated once and cached — generic phrasing keeps
           it accurate across releases. -->
      <text x="${W / 2}" y="294" text-anchor="middle"
            font-family="Segoe UI, Arial, sans-serif"
            font-size="7" font-weight="600" fill="${TEXT_DIM}" letter-spacing="2.5">
        INSTALLATION · CONFIGURATION
      </text>
    </svg>
  `);

  const logo = await sharp(logoBuffer)
    .resize(140, 140, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await convertViaPng(
    sharp(bg)
      .composite([
        { input: logo, top: 30, left: Math.floor((W - 140) / 2) },
        { input: text, top: 0, left: 0 },
      ])
      .toColorspace("srgb")
      .removeAlpha(),
    join(outDir, "sidebar.bmp"),
  );
}

async function convertViaPng(sharpPipeline, bmpPath) {
  const pngBuffer = await sharpPipeline.png().toBuffer();
  const img = await Jimp.read(pngBuffer);
  await img.write(bmpPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
