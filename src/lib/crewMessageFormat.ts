import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Parse a crew message's body into safe HTML. Supports a tight subset
 * of Markdown :
 *
 *   **bold**, *italic*, ~~strikethrough~~, `code`, ```code blocks```
 *   [link](url), block-quotes (>), bullet lists (- *).
 *
 * No headings, no images (those are handled by the imageUrl field
 * separately in Phase 4). Sanitised through DOMPurify with a strict
 * tag whitelist before returning.
 *
 * Mentions of the form `<@uid>` are NOT processed here — the renderer
 * splits them out first and renders them as React `<MentionPill>`s,
 * passing only the surrounding text segments through markdown.
 */
const ALLOWED_TAGS = [
  "a",
  "br",
  "code",
  "em",
  "strong",
  "del",
  "p",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "span",
] as const;
const ALLOWED_ATTR = ["href", "rel", "target", "class"] as const;

marked.use({
  breaks: true,
  gfm: true,
});

export function renderMessageMarkdown(text: string): string {
  if (!text) return "";
  // marked is sync when given a string — cast away the union with
  // Promise to keep the call site simple.
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    // Add target=_blank + rel for outbound links; the launcher's
    // Tauri webview picks them up via `tauri-plugin-opener`.
    ADD_ATTR: ["target", "rel"],
  });
}

// ─── Mentions ────────────────────────────────────────────────────────

/** Token shape produced by `splitMessageMentions`. */
export type MessageToken =
  | { kind: "text"; text: string }
  | { kind: "mention"; uid: string };

const MENTION_RE = /<@([a-zA-Z0-9_-]+)>/g;

/**
 * Split a message body into a sequence of text + mention tokens. The
 * caller renders text through markdown and mentions as `<MentionPill>`.
 * Robust to malformed/empty mention markers (they fall through as raw
 * text).
 */
export function splitMessageMentions(text: string): MessageToken[] {
  if (!text) return [];
  const out: MessageToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      out.push({ kind: "text", text: text.slice(lastIndex, idx) });
    }
    out.push({ kind: "mention", uid: match[1] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return out;
}

/** Extract every uid mentioned in the message, dedup'd. Used at send
 *  time to drive the notifications fan-out. */
export function extractMentionedUids(text: string): string[] {
  const set = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    set.add(match[1]);
  }
  return Array.from(set);
}

/**
 * Convert an `@username` typed by the user into the canonical `<@uid>`
 * marker before save. Caller passes the autocomplete-resolved (uid,
 * displayName) pairs so we can rewrite the literal text into uid
 * tokens. Names with spaces are matched greedily.
 */
export function injectMentionTokens(
  text: string,
  resolved: Array<{ uid: string; displayName: string }>,
): string {
  let out = text;
  // Sort by name length desc so "@Jean Dupont" wins over "@Jean".
  const sorted = [...resolved].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  );
  for (const r of sorted) {
    const escaped = r.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}\\b`, "g");
    out = out.replace(re, `<@${r.uid}>`);
  }
  return out;
}
