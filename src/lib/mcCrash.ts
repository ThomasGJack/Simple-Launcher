import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrapper for the Minecraft crash collector. Mirrors
 * `src-tauri/src/mc_crash.rs`.
 *
 * Triggered automatically by `NativeMinecraftActionPanel` when a launch
 * exits with a non-zero code. Powers the `CrashReportModal` which lets
 * the user :
 *
 *   - View the tail of `logs/latest.log` (in-app, no file explorer).
 *   - Browse the most recent crash-reports/*.txt with stack traces.
 *   - Send everything to the admin via Firestore for remote debug.
 *   - Reinstall the modpack as a quick recovery.
 */

export type CrashReport = {
  filename: string;
  modifiedAtMs: number;
  sizeBytes: number;
  contents: string;
  truncated: boolean;
};

export type CrashCollectSnapshot = {
  latestLogTail: string;
  latestLogTruncated: boolean;
  crashReports: CrashReport[];
  modsCount: number;
  generatedAtMs: number;
};

export async function mcCrashCollect(instanceId: string): Promise<CrashCollectSnapshot> {
  return invoke<CrashCollectSnapshot>("mc_crash_collect", { instanceId });
}
