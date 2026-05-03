import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref as storageRef,
  uploadString,
} from "firebase/storage";
import { invoke } from "@tauri-apps/api/core";
import { getFirebase } from "./config";

/**
 * File-based logging stored on Firebase Storage. Each launcher session
 * produces one `.log` text file uploaded to:
 *
 *   users/{uid}/logs/{fileName}
 *
 * Where fileName = `session-{sessionId}-{startedAtMillis}.log`. Retention
 * is enforced by a daily Cloud Function that deletes files older than 7
 * days (path-prefix scan + delete).
 */

export type LogFileEntry = {
  /** Storage object name (= `session-…-….log`). */
  name: string;
  /** Full Storage path (`users/{uid}/logs/{name}`). */
  fullPath: string;
  /** Bytes (approx — Firebase doesn't always return size on listAll, so
   *  this can be 0 if the metadata fetch is skipped). */
  size: number;
};

/** Uploads (or replaces) a log file's content on Storage. */
export async function uploadLogFile(
  uid: string,
  fileName: string,
  content: string,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const path = `users/${uid}/logs/${fileName}`;
  const ref = storageRef(fb.storage, path);
  await uploadString(ref, content, "raw", {
    contentType: "text/plain; charset=utf-8",
    customMetadata: {
      uid,
      sessionFile: "1",
      uploadedAt: String(Date.now()),
    },
  });
  return path;
}

/** Lists every log file currently stored for the given user. */
export async function listUserLogFiles(uid: string): Promise<LogFileEntry[]> {
  const fb = getFirebase();
  if (!fb) return [];
  const ref = storageRef(fb.storage, `users/${uid}/logs/`);
  const result = await listAll(ref);
  return result.items.map((item) => ({
    name: item.name,
    fullPath: item.fullPath,
    size: 0,
  }));
}

/** Returns a temporary download URL for a log file. The admin UI uses
 *  this for the "ouvrir dans le navigateur" link. */
export async function getLogFileDownloadUrl(fullPath: string): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  return getDownloadURL(storageRef(fb.storage, fullPath));
}

/** Streams a log file's text content into memory (admin viewer).
 *
 * Tauri 2 webview blocks cross-origin `fetch()` calls to external hosts
 * (Firebase Storage CDN), even when the URL embeds a signed download
 * token — preflight fails with "Failed to fetch". We work around this by
 * resolving the download URL in JS (the SDK's bundled XHR copes fine with
 * Firebase auth) then performing the actual byte-fetch in Rust via the
 * `logs_fetch_text` Tauri command. Rust's `reqwest` doesn't go through
 * the webview, so CORS doesn't apply. Falls back to a plain web `fetch`
 * if `invoke` isn't available (e.g. running in a browser preview). */
export async function readLogFileContent(fullPath: string): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const url = await getDownloadURL(storageRef(fb.storage, fullPath));
  // Prefer the Rust-side fetch when running inside Tauri.
  if (typeof invoke === "function" && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return invoke<string>("logs_fetch_text", { url });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en lisant le log`);
  return res.text();
}

/** Admin-only: delete a log file early (the daily cleanup will do it
 *  automatically after 7 days, but the admin can clean up earlier). */
export async function deleteLogFile(fullPath: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteObject(storageRef(fb.storage, fullPath));
}

/**
 * Parses the timestamp + version + short session id from a log file name.
 *
 * New format: `2026-04-29_23-27_v26.04.29.10_4d8bb1e3.log`
 *   → ts: epoch millis of the date+time prefix
 *   → version: "v26.04.29.10"
 *   → shortId: "4d8bb1e3"
 *
 * Legacy fallback: `session-{uuid}-{millis}.log` (pre-refonte names).
 */
export type ParsedLogFileName = {
  ts: number | null;
  version: string | null;
  shortId: string | null;
};

export function parseLogFileName(name: string): ParsedLogFileName {
  // New format: 2026-04-29_23-27_v26.04.29.10_4d8bb1e3.log
  const newMatch = name.match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})_(v[\w.-]+)_([0-9a-f]{8})\.log$/i,
  );
  if (newMatch) {
    const [, y, m, d, h, mi, version, shortId] = newMatch;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(mi),
    );
    return {
      ts: Number.isFinite(date.getTime()) ? date.getTime() : null,
      version,
      shortId,
    };
  }
  // Legacy: session-{uuid}-{millis}.log
  const legacyMatch = name.match(/-(\d{10,})\.log$/);
  if (legacyMatch) {
    const ts = Number(legacyMatch[1]);
    return {
      ts: Number.isFinite(ts) ? ts : null,
      version: null,
      shortId: null,
    };
  }
  return { ts: null, version: null, shortId: null };
}

/** @deprecated use `parseLogFileName` for the structured result. */
export function parseLogFileTs(name: string): number | null {
  return parseLogFileName(name).ts;
}
