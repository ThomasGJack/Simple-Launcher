import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * GitHub Releases integration. Lets the admin host modpacks on
 * GitHub instead of Firebase Storage — free, fast, never expires,
 * 2 GB per file. Auth via Personal Access Token (PAT) stored in the
 * Windows Credential Manager. No OAuth dance.
 *
 * Typical flow:
 *
 *   1. Admin clicks "Configurer GitHub" → modal explaining how to
 *      generate a PAT, plus a textarea for them to paste it.
 *   2. `ghTokenSet(pat)` validates + stores. Returns user info.
 *   3. Admin picks a repo (`ghListRepos()` populates the dropdown),
 *      a tag (defaults to today's CalVer), and uploads via
 *      `ghUploadModpack(...)`.
 *   4. The returned `downloadUrl` is auto-pasted into
 *      `nativeModpackUrl`, ready for the install path.
 *
 * Subscribe to `gh-upload-progress` for the progress bar (`ensuring
 * release` → `uploading` → `done`).
 */

export type GithubUser = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

export type GithubRepo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  permissions: { push: boolean; admin: boolean } | null;
};

export type GhUploadResult = {
  downloadUrl: string;
  releaseName: string;
  releaseTag: string;
  assetSize: number;
};

export type GhUploadProgress = {
  /** "ensuring-release" | "uploading" | "done" */
  phase: string;
  bytesUploaded: number;
  bytesTotal: number;
};

/** Validates a PAT (via `GET /user`) and stores it in the keyring on
 *  success. Returns the GitHub user info — `login` is the username,
 *  used for the "Connecté en tant que X" UI status. */
export async function ghTokenSet(token: string): Promise<GithubUser> {
  return invoke<GithubUser>("gh_token_set", { token });
}

/** Returns the GitHub user if a valid PAT is stored, `null`
 *  otherwise. Use on mount to decide whether to surface the
 *  "Configurer GitHub" call-to-action. */
export async function ghTokenStatus(): Promise<GithubUser | null> {
  return invoke<GithubUser | null>("gh_token_status");
}

/** Wipes the stored PAT. Idempotent. */
export async function ghTokenClear(): Promise<void> {
  await invoke<void>("gh_token_clear");
}

/** Lists the authenticated user's repos with push access (= those
 *  that can host releases). Sorted newest-first. Capped at 100. */
export async function ghListRepos(): Promise<GithubRepo[]> {
  return invoke<GithubRepo[]>("gh_list_repos");
}

/**
 * Uploads a local file as a release asset on the given repo. Creates
 * the release for `tag` if it doesn't exist yet. Returns the public
 * download URL ready to paste into `nativeModpackUrl`.
 *
 * `filePath` must be an absolute path on the local machine — Tauri's
 * file dialog (`@tauri-apps/plugin-dialog`) gives one. Uses Tauri
 * commands so the binary never goes through the JS runtime, keeping
 * memory usage low even for ≥ 1 GB modpacks.
 */
export async function ghUploadModpack(opts: {
  repoFullName: string;
  tag: string;
  releaseName?: string;
  filePath: string;
}): Promise<GhUploadResult> {
  return invoke<GhUploadResult>("gh_upload_modpack", {
    repoFullName: opts.repoFullName,
    tag: opts.tag,
    releaseName: opts.releaseName,
    filePath: opts.filePath,
  });
}

/** Subscribes to GitHub upload progress events. Returns an unlisten
 *  function the caller should call on unmount. */
export function onGhUploadProgress(
  cb: (p: GhUploadProgress) => void,
): Promise<UnlistenFn> {
  return listen<GhUploadProgress>("gh-upload-progress", (event) => cb(event.payload));
}
