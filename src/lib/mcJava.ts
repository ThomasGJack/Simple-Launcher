import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrapper around the Rust `mc_java_*` Tauri commands. Java
 * runtime detection + auto-download from Adoptium. The native Minecraft
 * launch path uses these to pick a compatible JRE for any given MC
 * version, installing one in the background if the user doesn't already
 * have a suitable one on the system.
 */

export type JavaInstallation = {
  /** Absolute path to `javaw.exe`. */
  path: string;
  /** Major version (8, 11, 17, 21, …). */
  majorVersion: number;
  /** Full version string (e.g. "17.0.12"). */
  versionString: string;
  /** Where this Java was found:
   *  - `runtimes` — installed by Simple Launcher itself
   *  - `env` — picked up via `JAVA_HOME`
   *  - `program-files` — auto-detected in a standard install dir */
  source: "runtimes" | "env" | "program-files" | string;
  /** True if it lives under our managed `runtimes/` dir (= we can
   *  uninstall it without breaking other software on the user's box). */
  managed: boolean;
};

/** Lists every Java installation we found on the user's machine. */
export async function mcJavaList(): Promise<JavaInstallation[]> {
  return invoke<JavaInstallation[]>("mc_java_list");
}

/**
 * Downloads + extracts an Adoptium Temurin JRE for the given major
 * version into Simple Launcher's managed `runtimes/` directory. ~50 MB
 * on the wire so this can take 10-60 s depending on connection. The
 * frontend should show a "downloading Java N…" spinner.
 */
export async function mcJavaInstall(major: number): Promise<JavaInstallation> {
  return invoke<JavaInstallation>("mc_java_install", { major });
}

/**
 * Resolves the right Java for a given MC version. Returns immediately
 * if a compatible JRE is already on the system; otherwise downloads one
 * from Adoptium and returns once it's ready. Mojang's mapping:
 *  - MC ≤ 1.16  → Java 8
 *  - MC = 1.17  → Java 16
 *  - MC 1.18 – 1.20.4 → Java 17
 *  - MC ≥ 1.20.5 → Java 21
 *
 * A newer major Java is always accepted (JVMs are backward-compatible),
 * but we prefer the exact major when possible.
 */
export async function mcJavaResolve(mcVersion: string): Promise<JavaInstallation> {
  return invoke<JavaInstallation>("mc_java_resolve", { mcVersion });
}
