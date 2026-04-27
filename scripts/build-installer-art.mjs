#!/usr/bin/env node
// Generate Simple Launcher installer artwork (NSIS) from the project logo.
// Output:
//   src-tauri/installer/header.bmp   — 150×57 banner shown at the top of every page
//   src-tauri/installer/sidebar.bmp  — 164×314 banner shown on the welcome / finish pages
//
// NSIS only accepts BMP. Sharp is used for the rich SVG-based composition,
// then Jimp converts the resulting PNG to BMP.

import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Jimp } from "jimp";

const root = join(fileURLToPath(import.meta.url), "../..");
const outDir = join(root, "src-tauri", "installer");
const logoPath = join(root, "logo.png");

const ACCENT = "#00d4ff";
const ACCENT_BRIGHT = "#5be3ff";
const FUCHSIA = "#ff3da3";
const BG_DEEP = "#020308";
const BG_MID = "#0a1220";
const BG_PANEL = "#0e1929";
const TEXT = "#ffffff";
const TEXT_MUTED = "#7da4c5";

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

  const bg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stop-color="${BG_DEEP}"/>
          <stop offset="50%" stop-color="${BG_MID}"/>
          <stop offset="100%" stop-color="${BG_DEEP}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.18" cy="0.5" r="0.55">
          <stop offset="0%"  stop-color="${ACCENT}" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect x="0" y="${H - 2}" width="${W}" height="2" fill="${ACCENT}"/>
    </svg>
  `);

  const text = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="60" y="24" font-family="Arial, sans-serif"
            font-size="14" font-weight="900" fill="${TEXT}" letter-spacing="1.2">
        SIMPLE
      </text>
      <text x="60" y="42" font-family="Arial, sans-serif"
            font-size="14" font-weight="900" fill="${ACCENT}" letter-spacing="1.2">
        LAUNCHER
      </text>
    </svg>
  `);

  const logo = await sharp(logoBuffer)
    .resize(50, 50, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await convertViaPng(
    sharp(bg)
      .composite([
        { input: logo, top: 3, left: 4 },
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

  const bg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="${BG_PANEL}"/>
          <stop offset="100%" stop-color="${BG_DEEP}"/>
        </linearGradient>
        <radialGradient id="glow1" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="0.85" cy="0.95" r="0.5">
          <stop offset="0%" stop-color="${FUCHSIA}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${FUCHSIA}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#glow1)"/>
      <rect width="${W}" height="${H}" fill="url(#glow2)"/>

      <!-- diagonal speed lines -->
      <g opacity="0.12">
        <line x1="-20" y1="40" x2="200" y2="80" stroke="${ACCENT_BRIGHT}" stroke-width="1"/>
        <line x1="-20" y1="60" x2="200" y2="100" stroke="${ACCENT_BRIGHT}" stroke-width="1"/>
        <line x1="-20" y1="280" x2="200" y2="240" stroke="${ACCENT_BRIGHT}" stroke-width="1"/>
        <line x1="-20" y1="290" x2="200" y2="250" stroke="${ACCENT_BRIGHT}" stroke-width="1"/>
      </g>

      <!-- rim -->
      <rect x="0" y="0" width="3" height="${H}" fill="${ACCENT}"/>
      <rect x="${W - 3}" y="0" width="3" height="${H}" fill="${ACCENT}" opacity="0.4"/>
    </svg>
  `);

  const text = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="${W / 2}" y="200" text-anchor="middle"
            font-family="Arial, sans-serif"
            font-size="22" font-weight="900" fill="${TEXT}" letter-spacing="3">
        SIMPLE
      </text>
      <text x="${W / 2}" y="226" text-anchor="middle"
            font-family="Arial, sans-serif"
            font-size="22" font-weight="900" fill="${ACCENT}" letter-spacing="3">
        LAUNCHER
      </text>
      <line x1="${W / 2 - 30}" y1="240" x2="${W / 2 + 30}" y2="240"
            stroke="${ACCENT}" stroke-width="2"/>
      <text x="${W / 2}" y="260" text-anchor="middle"
            font-family="Arial, sans-serif"
            font-size="9" font-weight="600" fill="${TEXT_MUTED}" letter-spacing="3">
        MULTI-JEUX · WINDOWS
      </text>
    </svg>
  `);

  const logo = await sharp(logoBuffer)
    .resize(132, 132, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await convertViaPng(
    sharp(bg)
      .composite([
        { input: logo, top: 38, left: Math.floor((W - 132) / 2) },
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
