// Themes saisonniers — Halloween (15 oct → 5 nov) et Noël (15 déc → 5 jan).
// Inject des CSS vars sur <html> pour rebadger l'accent color.
//
// Le mode est piloté par Firestore (admin-only) plutôt que par chaque
// user. Mode par défaut "auto" — le launcher détecte la saison à partir
// de la date système. L'admin peut forcer/désactiver depuis le panel
// admin → onglet Saisons (cf. firebase/seasonalConfig.ts).
//
// Pas de particles ni d'emojis dans la sidebar pour l'instant — juste
// la palette change. Particles en Phase ultérieure (besoin de configurer
// tsParticles avec des préset "leaves" / "snowflakes" custom).

export type SeasonId = "halloween" | "christmas";
export type SeasonalMode = "auto" | "halloween" | "christmas" | "off";

export type SeasonalTheme = {
  id: SeasonId;
  /** Label affiché en Settings + dans la sidebar quand actif. */
  label: string;
  /** Emoji décoratif affiché dans la sidebar quand actif. */
  emoji: string;
  /** Hex de l'accent — overrides --color-accent. */
  accent: string;
  /** Variant chaud / soutien (ex: la couleur secondaire pour les
   *  glows). Pour MVP : utilisé comme overlay décoratif sur le hero. */
  accentSecondary: string;
};

export const SEASONAL_THEMES: Record<SeasonId, SeasonalTheme> = {
  halloween: {
    id: "halloween",
    label: "Halloween",
    emoji: "🎃",
    accent: "#fb923c", // orange-400
    accentSecondary: "#9333ea", // purple-600
  },
  christmas: {
    id: "christmas",
    label: "Noël",
    emoji: "🎄",
    accent: "#dc2626", // red-600
    accentSecondary: "#10b981", // emerald-500
  },
};

/**
 * Calcule la saison active à une date donnée. Ranges hardcodées pour
 * MVP — modifier ici si on veut allonger / raccourcir.
 */
export function getActiveSeason(date: Date = new Date()): SeasonId | null {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Halloween : 15 oct → 5 nov
  if ((month === 10 && day >= 15) || (month === 11 && day <= 5)) {
    return "halloween";
  }
  // Noël : 15 déc → 5 jan
  if ((month === 12 && day >= 15) || (month === 1 && day <= 5)) {
    return "christmas";
  }
  return null;
}

/**
 * Résout le thème à appliquer selon le mode :
 *   - "auto" : utilise getActiveSeason (peut retourner null hors saison)
 *   - "halloween" / "christmas" : force le thème
 *   - "off" : retourne null (pas de saison)
 */
export function resolveSeasonalTheme(
  mode: SeasonalMode,
  date: Date = new Date(),
): SeasonalTheme | null {
  switch (mode) {
    case "off":
      return null;
    case "auto": {
      const id = getActiveSeason(date);
      return id ? SEASONAL_THEMES[id] : null;
    }
    case "halloween":
    case "christmas":
      return SEASONAL_THEMES[mode];
  }
}

/**
 * Applique (ou retire) le thème saisonnier sur le document. Override
 * `--color-accent`, `--color-accent-soft`, `--color-accent-glow` et
 * pose `data-season=<id>` sur `<html>` pour permettre des CSS
 * conditionnels.
 *
 * Pour retirer (mode off / hors saison), passer null.
 */
export function applySeasonalTheme(theme: SeasonalTheme | null): void {
  const root = document.documentElement;
  if (!theme) {
    root.removeAttribute("data-season");
    // Ne pas remove --color-accent ici — le store accentColor du user
    // pourrait l'avoir set. App.tsx re-applique l'user accent après si
    // besoin. Pour MVP : on remove juste, le default index.css reprend.
    root.style.removeProperty("--color-accent");
    root.style.removeProperty("--color-accent-soft");
    root.style.removeProperty("--color-accent-glow");
    return;
  }
  root.setAttribute("data-season", theme.id);
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-accent-soft", `${theme.accent}33`);
  root.style.setProperty("--color-accent-glow", `${theme.accent}80`);
}

/**
 * Boot synchrone — appelé une fois au démarrage de l'app, AVANT que la
 * première frame s'affiche. Applique le thème "auto" (basé sur la date
 * système) pour éviter un flash visuel pendant que le watch Firestore
 * se connecte.
 *
 * Le mode override admin (si différent de "auto") est appliqué ensuite
 * via le watcher Firestore que l'App component installe une fois l'auth
 * résolue (cf. App.tsx, useEffect dépendant de `user`). Pour 99% des
 * sessions, "auto" = mode admin → pas de re-render perceptible.
 */
export function bootSeasonalTheme(): void {
  applySeasonalTheme(resolveSeasonalTheme("auto"));
}
