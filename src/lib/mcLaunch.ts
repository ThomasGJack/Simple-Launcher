import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Frontend wrappers for the native Minecraft launch path. Ties together
 * everything else: account (mc_auth) + Java (mc_java) + game files
 * (mc_vanilla / mc_fabric) and spawns the actual `javaw` process.
 *
 * Once started, stdout/stderr of the game stream back through the
 * `mc-launch-log` event channel so the UI can show a live console.
 */

export type LaunchOptions = {
  /** Stable instance id (use the Firestore module id). Drives the
   *  per-instance dirs (.minecraft, natives, logs). */
  instanceId: string;
  /** Vanilla MC version like "1.20.1". */
  mcVersion: string;
  /** Pick of loader. Forge / NeoForge install via their installer JAR;
   *  Fabric merges its profile JSON; Vanilla skips loader handling. */
  loader: "vanilla" | "fabric" | "forge" | "neoforge";
  /** Required for any non-vanilla loader. */
  loaderVersion?: string;
  /** UUID (no dashes) of the account stored via `mcAuthLogin`. */
  accountUuid: string;
  /** Heap allocation in MiB. 0 / undefined → defaults to 2 GiB. */
  maxRamMb?: number;
  /** Extra JVM args appended after the manifest's. */
  extraJvmArgs?: string[];
  /** Window resolution. Default 854×480 (Mojang's). */
  resolution?: [number, number];
  /** Optional server address to auto-join on launch — `host` or
   *  `host:port`. When set, MC opens directly into the server's
   *  loading screen instead of the main menu. */
  serverAddress?: string;
};

export type LaunchLogLine = {
  instanceId: string;
  /** "stdout" | "stderr" | "info" | "exit" */
  stream: string;
  line: string;
};

/**
 * Launches Minecraft with the given options. Returns once the process
 * has been spawned (NOT when the game exits — exit is emitted via the
 * `mc-launch-log` channel with `stream: "exit"`).
 */
export async function mcNativeLaunch(options: LaunchOptions): Promise<void> {
  await invoke<void>("mc_native_launch", { options });
}

/** Subscribes to the launch log stream. Returns an unlisten function. */
export function onMcLaunchLog(
  cb: (line: LaunchLogLine) => void,
): Promise<UnlistenFn> {
  return listen<LaunchLogLine>("mc-launch-log", (event) => cb(event.payload));
}
