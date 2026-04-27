const loaded = new Set<string>();

export async function loadFontFace(family: string, url: string): Promise<void> {
  const key = `${family}|${url}`;
  if (loaded.has(key)) return;
  loaded.add(key);

  if (url.includes("fonts.googleapis.com") || url.endsWith(".css")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.dynamicFont = family;
    document.head.appendChild(link);
  } else {
    const style = document.createElement("style");
    style.dataset.dynamicFont = family;
    style.textContent = `@font-face { font-family: "${family}"; src: url("${url}"); font-display: swap; }`;
    document.head.appendChild(style);
  }

  if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
    try {
      await document.fonts.load(`16px "${family}"`);
    } catch {
      /* ignore */
    }
  }
}
