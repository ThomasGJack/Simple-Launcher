/**
 * Predefined profile themes — let users tint their public profile + sidebar
 * avatar with a coordinated palette without inventing colors. Each theme
 * provides:
 *   - `accent`   : the primary accent color (used for ring, glow, badges)
 *   - `gradientFrom/Via/To` : the hero banner gradient (CSS color-mix friendly)
 *
 * IDs are stable strings stored in Firestore on the user doc; the `custom`
 * theme means "use the legacy free-form `accentColor` field instead".
 */

export type ProfileThemeId =
  | "default"
  | "aurora"
  | "sunset"
  | "forest"
  | "peach"
  | "lagoon"
  | "nebula"
  | "ember"
  | "custom";

export type ProfileTheme = {
  id: ProfileThemeId;
  label: string;
  accent: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
};

export const PROFILE_THEMES: Record<Exclude<ProfileThemeId, "custom">, ProfileTheme> = {
  default: {
    id: "default",
    label: "Cyan / Violet",
    accent: "#00d4ff",
    gradientFrom: "#00d4ff",
    gradientVia: "#1a3554",
    gradientTo: "#a855f7",
  },
  aurora: {
    id: "aurora",
    label: "Rouge / Violet",
    accent: "#ff4d6d",
    gradientFrom: "#ff4d6d",
    gradientVia: "#3b1f3f",
    gradientTo: "#9333ea",
  },
  sunset: {
    id: "sunset",
    label: "Rouge / Bleu",
    accent: "#ef4444",
    gradientFrom: "#ef4444",
    gradientVia: "#1e293b",
    gradientTo: "#3b82f6",
  },
  forest: {
    id: "forest",
    label: "Vert / Jaune",
    accent: "#22c55e",
    gradientFrom: "#22c55e",
    gradientVia: "#1f2937",
    gradientTo: "#facc15",
  },
  peach: {
    id: "peach",
    label: "Ambre / Rose",
    accent: "#fb923c",
    gradientFrom: "#fb923c",
    gradientVia: "#3b2530",
    gradientTo: "#f472b6",
  },
  lagoon: {
    id: "lagoon",
    label: "Cyan / Menthe",
    accent: "#06b6d4",
    gradientFrom: "#06b6d4",
    gradientVia: "#0d3a3a",
    gradientTo: "#5eead4",
  },
  nebula: {
    id: "nebula",
    label: "Violet / Fuchsia",
    accent: "#a855f7",
    gradientFrom: "#a855f7",
    gradientVia: "#2e1b3a",
    gradientTo: "#ec4899",
  },
  ember: {
    id: "ember",
    label: "Or / Rouge",
    accent: "#f59e0b",
    gradientFrom: "#f59e0b",
    gradientVia: "#3a1f1f",
    gradientTo: "#dc2626",
  },
};

export const PROFILE_THEME_LIST: ProfileTheme[] = Object.values(PROFILE_THEMES);

export function getProfileTheme(id: ProfileThemeId | undefined | null): ProfileTheme | null {
  if (!id || id === "custom") return null;
  return PROFILE_THEMES[id] ?? PROFILE_THEMES.default;
}

/**
 * Build the inline style object that injects the theme's CSS vars on a
 * scope (typically the profile root or sidebar avatar wrapper). Components
 * downstream consume `var(--profile-accent)` etc.
 */
export function profileThemeStyle(
  themeId: ProfileThemeId | undefined,
  customAccent?: string | null,
): React.CSSProperties {
  const t = getProfileTheme(themeId);
  if (t) {
    return {
      ["--profile-accent" as string]: t.accent,
      ["--profile-gradient-from" as string]: t.gradientFrom,
      ["--profile-gradient-via" as string]: t.gradientVia,
      ["--profile-gradient-to" as string]: t.gradientTo,
    } as React.CSSProperties;
  }
  if (customAccent) {
    return {
      ["--profile-accent" as string]: customAccent,
      ["--profile-gradient-from" as string]: customAccent,
      ["--profile-gradient-via" as string]: "var(--color-bg-soft)",
      ["--profile-gradient-to" as string]: "var(--color-accent)",
    } as React.CSSProperties;
  }
  return {};
}
