#!/usr/bin/env node
// Generate Simple Launcher installer artwork (NSIS) from the project logo.
// Output:
//   src-tauri/installer/header.bmp   — 150×57 banner shown at the top of every page
//   src-tauri/installer/sidebar.bmp  — 164×314 banner shown on the welcome / finish pages
//
// NSIS only accepts BMP. Sharp is used for the rich SVG-based composition,
// then Jimp converts the resulting PNG to BMP.

import { readFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Jimp } from "jimp";

const root = join(fileURLToPath(import.meta.url), "../..");
const outDir = join(root, "src-tauri", "installer");
const logoPath = join(root, "logo.png");

const ACCENT = "#00d4ff";
const ACCENT_GLOW = "#3affffff";
const BG_BASE = "#07090d";
const BG_SOFT = "#0d1117";
const TEXT = "#f5f7fa";
const TEXT_MUTED = "#97a3b6";

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

  const bgSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${BG_BASE}"/>
          <stop offset="60%" stop-color="${BG_SOFT}"/>
          <stop offset="100%" stop-color="${BG_BASE}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.18" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect x="0" y="${H - 1}" width="${W}" height="1" fill="${ACCENT}" opacity="0.5"/>
    </svg>
  `);

  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="60" y="26" font-family="'Segoe UI','Inter',sans-serif"
            font-size="13" font-weight="700" fill="${TEXT}" letter-spacing="1">
        SIMPLE
      </text>
      <text x="60" y="44" font-family="'Segoe UI','Inter',sans-serif"
            font-size="13" font-weight="700" fill="${ACCENT}" letter-spacing="1">
        LAUNCHER
      </text>
    </svg>
  `);

  const logo = await sharp(logoBuffer)
    .resize(46, 46, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await convertViaPng(
    sharp(bgSvg)
      .composite([
        { input: logo, top: 5, left: 6 },
        { input: textSvg, top: 0, left: 0 },
      ])
      .toColorspace("srgb")
      .removeAlpha(),
    join(outDir, "header.bmp"),
  );
}

async function buildSidebar(logoBuffer) {
  const W = 164;
  const H = 314;

  const bgSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${BG_SOFT}"/>
          <stop offset="100%" stop-color="${BG_BASE}"/>
        </linearGradient>
        <radialGradient id="glow1" cx="0.5" cy="0.28" r="0.55">
          <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="0.7" cy="0.85" r="0.45">
          <stop offset="0%" stop-color="#ff00aa" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ff00aa" stop-opacity="0"/>
        </radialGradient>
        <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="${TEXT}" stroke-opacity="0.04" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#grid)"/>
      <rect width="${W}" height="${H}" fill="url(#glow1)"/>
      <rect width="${W}" height="${H}" fill="url(#glow2)"/>
      <rect x="0" y="0" width="${W}" height="2" fill="${ACCENT}" opacity="0.5"/>
      <rect x="0" y="${H - 2}" width="${W}" height="2" fill="${ACCENT}" opacity="0.3"/>
    </svg>
  `);

  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="${W / 2}" y="180" text-anchor="middle"
            font-family="'Segoe UI','Inter',sans-serif"
            font-size="22" font-weight="800" fill="${TEXT}" letter-spacing="2">
        SIMPLE
      </text>
      <text x="${W / 2}" y="208" text-anchor="middle"
            font-family="'Segoe UI','Inter',sans-serif"
            font-size="22" font-weight="800" fill="${ACCENT}" letter-spacing="2">
        LAUNCHER
      </text>
      <text x="${W / 2}" y="240" text-anchor="middle"
            font-family="'Segoe UI','Inter',sans-serif"
            font-size="9" font-weight="500" fill="${TEXT_MUTED}" letter-spacing="3">
        MULTI-JEUX · WINDOWS
      </text>
      <line x1="${W / 2 - 24}" y1="252" x2="${W / 2 + 24}" y2="252" stroke="${ACCENT}" stroke-width="1" opacity="0.5"/>
    </svg>
  `);

  const logo = await sharp(logoBuffer)
    .resize(120, 120, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await convertViaPng(
    sharp(bgSvg)
      .composite([
        { input: logo, top: 28, left: Math.floor((W - 120) / 2) },
        { input: textSvg, top: 0, left: 0 },
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
