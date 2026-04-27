import DOMPurify from "dompurify";

const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "player.twitch.tv",
];

let hooksInstalled = false;

function ensureHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "iframe") {
      const src = (node as HTMLIFrameElement).getAttribute("src") ?? "";
      try {
        const url = new URL(src);
        if (!ALLOWED_IFRAME_HOSTS.includes(url.host)) {
          (node as HTMLIFrameElement).remove();
        }
      } catch {
        (node as HTMLIFrameElement).remove();
      }
    }
  });

  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName.startsWith("on")) {
      data.keepAttr = false;
    }
    if (data.attrName === "href" || data.attrName === "src") {
      const v = data.attrValue;
      if (v.startsWith("javascript:") || v.startsWith("data:text/html")) {
        data.keepAttr = false;
      }
    }
  });
}

export function sanitizeHtml(dirty: string): string {
  ensureHooks();
  return DOMPurify.sanitize(dirty, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"],
    FORBID_TAGS: ["script", "style", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
}
