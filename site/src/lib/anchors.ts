// Smooth scroll vers une ancre. La page utilise `scroll-behavior: smooth`
// au niveau html (cf. site.css) donc un simple `location.hash = "#id"`
// suffit dans les cas standard. Cette helper sert pour les boutons
// programmatiques qui veulent contrôler le scroll (offset, focus).

export function scrollToAnchor(id: string, opts?: { offset?: number }) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = opts?.offset ?? 0;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}

/** Ancres de la single-page — keep this in sync with App.tsx section IDs. */
export const ANCHORS = {
  hero: "crew",
  manifesto: "manifesto",
  profile: "profile",
  library: "library",
  heatmap: "heatmap",
  achievements: "achievements",
  tiers: "tiers",
  launcher: "launcher",
  how: "how",
  faq: "faq",
  download: "download",
} as const;
