/**
 * Shared helpers for handling user-provided links in markdown content
 * (news bodies, crew chat messages, module descriptions, etc.).
 *
 * Two independent concerns :
 *
 *  1. Auto-linkification : `marked`'s GFM autolink only triggers in
 *     specific positions ; URLs tucked mid-sentence often slip
 *     through. We pre-process by wrapping bare http(s) URLs in
 *     `<...>` (markdown autolink syntax) so `marked` turns them
 *     into clickable anchors deterministically.
 *
 *  2. Click interception : Tauri 2's default behaviour for
 *     `<a href="https://...">` is to navigate the launcher's
 *     webview itself, which is silently blocked by Tauri's
 *     security policy → "le clic ne fait rien". We intercept the
 *     click, call `tauri-plugin-opener` to open the URL in the
 *     OS browser instead.
 *
 * Both are reusable across any place we render user-provided
 * markdown to keep the link UX consistent.
 */

import { type MouseEvent as ReactMouseEvent } from "react";
import { sounds } from "@/lib/sounds";
import { openImage } from "@/store/imageViewer";

/**
 * Match http(s) URLs that are NOT already wrapped in markdown link
 * syntax `[..](url)`, autolink syntax `<url>`, or following an
 * inline-link reference like `[label]: url`. The negative look-behind
 * `(?<!\]\(|<|\]:?\s)` is what makes this safe to apply blindly.
 *
 * Tail trimming `[^\s<>().,!?:;]` avoids gobbling trailing punctuation
 * (e.g. `https://x.com.` → URL is `https://x.com`, period stays).
 */
const URL_AUTOLINK_RE =
  /(?<!\]\(|<|\]:?\s)(https?:\/\/[^\s<>()]+[^\s<>().,!?:;])/g;

/**
 * Transform any bare http(s) URL in the source into a markdown
 * autolink (`<url>`). Idempotent — already-linked URLs are skipped
 * via the look-behind.
 */
export function preprocessAutolinks(src: string): string {
  return src.replace(URL_AUTOLINK_RE, "<$1>");
}

/**
 * `onClick` handler to install on any container whose innerHTML may
 * include user-rendered links. Catches clicks bubbling up from any
 * `<a>` with an http(s) href, swallows the default in-webview
 * navigation, and forwards the URL to the OS via
 * `tauri-plugin-opener`.
 *
 * The plugin is imported dynamically the first time a link is
 * clicked, to keep it out of the initial bundle.
 *
 * Use as :
 *   <div onClick={handleExternalLinkClick} dangerouslySetInnerHTML={...} />
 */
export function handleExternalLinkClick(e: ReactMouseEvent<HTMLElement>) {
  // 1) Image cliquée dans le markdown rendu → ouvrir notre lightbox
  //    intégrée plutôt qu'une nav webview qui sortirait de l'app.
  const imgTarget = (e.target as HTMLElement | null)?.closest?.("img");
  if (imgTarget) {
    const src = imgTarget.getAttribute("src");
    if (src && /^https?:\/\//i.test(src)) {
      e.preventDefault();
      e.stopPropagation();
      sounds.click();
      const alt = imgTarget.getAttribute("alt") || null;
      openImage(src, alt);
      return;
    }
  }

  // 2) Lien externe — délègue à l'OS (browser) via tauri-plugin-opener.
  //    On ne peut pas faire mieux pour des liens externes : on ne va
  //    pas naviguer dans la webview du launcher (security policy
  //    bloque + le user perdrait son state).
  const target = (e.target as HTMLElement | null)?.closest?.("a");
  if (!target) return;
  const href = target.getAttribute("href");
  if (!href) return;
  if (!/^https?:\/\//i.test(href)) return;
  e.preventDefault();
  e.stopPropagation();
  sounds.click();
  void (async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(href);
    } catch (err) {
      console.warn("[link] failed to open in system browser:", err);
    }
  })();
}
