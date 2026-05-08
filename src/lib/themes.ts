// Themes complets — fonts + layouts. La couleur d'accent et le
// soundpack sont gérés séparément (cf. `useSettingsStore.accentColor`
// et `soundpacks.ts`) pour rester indépendants.
//
// Architecture :
//   - Registry de fonts (Google Fonts) avec preview live
//   - Custom font URL : permet de coller un import Google Fonts
//   - Layouts : compact / comfortable (default) / spacious — change
//     les CSS vars `--spacing-base` et `--font-size-base`

import { loadFontFace } from "./dynamicFont";

// ─── Fonts ────────────────────────────────────────────────────────────

export type FontPreset = {
  /** ID localStorage. */
  id: string;
  /** Nom affiché. */
  label: string;
  /** Family CSS — appliquée en priorité dans `--font-sans`. */
  family: string;
  /** URL Google Fonts ou autre source @font-face. Si null, la font
   *  est supposée déjà disponible (system / déjà bundlée). */
  url: string | null;
  /** Description courte, montrée dans le panel. */
  description: string;
};

export const FONT_PRESETS: FontPreset[] = [
  {
    id: "inter",
    label: "Inter",
    family: "Inter",
    url: null, // bundled au build via index.html
    description: "Le défaut — moderne, neutre, anti-fatigue.",
  },
  {
    id: "outfit",
    label: "Outfit",
    family: "Outfit",
    url: "https://fonts.googleapis.com/css2?family=Outfit:wght@300..700&display=swap",
    description: "Géométrique chaude, plus arrondie que Inter.",
  },
  {
    id: "manrope",
    label: "Manrope",
    family: "Manrope",
    url: "https://fonts.googleapis.com/css2?family=Manrope:wght@300..700&display=swap",
    description: "Sans-serif moderne, légèrement condensée.",
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    family: '"JetBrains Mono"',
    url: null, // bundled
    description: "Monospace pour qui aime le terminal partout.",
  },
  {
    id: "space",
    label: "Space Grotesk",
    family: '"Space Grotesk"',
    url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap",
    description: "Géométrique technique, vibe sci-fi sobre.",
  },
];

const LS_FONT = "theme.font.id.v1";
const LS_FONT_CUSTOM = "theme.font.custom.v1";

export function loadFontPresetId(): string {
  try {
    return localStorage.getItem(LS_FONT) ?? "inter";
  } catch {
    return "inter";
  }
}
export function saveFontPresetId(id: string): void {
  try {
    localStorage.setItem(LS_FONT, id);
  } catch {
    /* ignore */
  }
}

export type CustomFont = { family: string; url: string };
export function loadCustomFont(): CustomFont | null {
  try {
    const raw = localStorage.getItem(LS_FONT_CUSTOM);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.family === "string" &&
      typeof parsed.url === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
export function saveCustomFont(font: CustomFont | null): void {
  try {
    if (font) localStorage.setItem(LS_FONT_CUSTOM, JSON.stringify(font));
    else localStorage.removeItem(LS_FONT_CUSTOM);
  } catch {
    /* ignore */
  }
}

/**
 * Applique la font choisie (preset ou custom) au document. Override
 * `--font-sans` qui est utilisée partout dans index.css.
 */
export async function applyFont(): Promise<void> {
  const customFont = loadCustomFont();
  if (customFont) {
    await loadFontFace(customFont.family, customFont.url);
    document.documentElement.style.setProperty(
      "--font-sans",
      `${customFont.family}, system-ui, sans-serif`,
    );
    return;
  }
  const id = loadFontPresetId();
  const preset = FONT_PRESETS.find((p) => p.id === id) ?? FONT_PRESETS[0];
  if (preset.url) {
    await loadFontFace(preset.family, preset.url);
  }
  document.documentElement.style.setProperty(
    "--font-sans",
    `${preset.family}, system-ui, sans-serif`,
  );
}

// ─── Layouts ──────────────────────────────────────────────────────────

export type LayoutId = "compact" | "comfortable" | "spacious";

export type LayoutSpec = {
  id: LayoutId;
  label: string;
  description: string;
  /** Multiplicateur appliqué sur les espacements + tailles de texte.
   *  Exposé comme CSS var sur <html>. */
  scale: number;
};

export const LAYOUTS: LayoutSpec[] = [
  {
    id: "compact",
    label: "Compact",
    description: "Plus dense, plus de contenu visible. Bon sur petit écran.",
    scale: 0.92,
  },
  {
    id: "comfortable",
    label: "Confort",
    description: "Le défaut — équilibré.",
    scale: 1,
  },
  {
    id: "spacious",
    label: "Aéré",
    description: "Plus d'espace blanc, plus relaxant pour les longues sessions.",
    scale: 1.1,
  },
];

const LS_LAYOUT = "theme.layout.v1";

export function loadLayoutId(): LayoutId {
  try {
    const raw = localStorage.getItem(LS_LAYOUT);
    if (raw === "compact" || raw === "comfortable" || raw === "spacious") {
      return raw;
    }
    return "comfortable";
  } catch {
    return "comfortable";
  }
}

export function saveLayoutId(id: LayoutId): void {
  try {
    localStorage.setItem(LS_LAYOUT, id);
  } catch {
    /* ignore */
  }
}

/**
 * Applique le layout : pose `data-layout` sur <html> + une CSS var
 * `--layout-scale` que les composants peuvent multiplier sur leurs
 * paddings / font-sizes (utilisation discrétionnaire — pour MVP, on
 * pose juste le data-attribute, la propagation aux composants vient
 * en Phase ultérieure).
 */
export function applyLayout(id: LayoutId = loadLayoutId()): void {
  const layout = LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[1];
  document.documentElement.setAttribute("data-layout", layout.id);
  document.documentElement.style.setProperty(
    "--layout-scale",
    String(layout.scale),
  );
}
