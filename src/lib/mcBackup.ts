import { invoke } from "@tauri-apps/api/core";
import { achievementFlags } from "@/lib/achievementFlags";

/**
 * Frontend wrapper for the auto-backup pipeline of native Minecraft
 * saves. Mirror of `src-tauri/src/mc_backup.rs`.
 *
 * Backups are created automatically before each native launch (throttled
 * to once per 24 h, see `pre_launch_backup_if_due`). The user can also
 * trigger one manually via the action panel "Backup maintenant" button,
 * and restore any past backup from the same UI.
 *
 * Storage layout (per instance) :
 *   .../instances/{id}/backups/{timestamp_ms}.zip
 * Each zip contains the full `.minecraft/saves/` tree at the time of
 * backup. Restoring renames the current saves/ to
 * `saves.before-restore-{ts}/` before extracting, so the user always has
 * an undo path if they restored the wrong backup.
 */

export type BackupEntry = {
  /** Filename without `.zip` — also the `created_at_ms` as a string. */
  id: string;
  createdAtMs: number;
  sizeBytes: number;
};

/** Force-create a backup right now, bypassing the 24 h throttle. */
export async function mcBackupCreate(instanceId: string): Promise<BackupEntry> {
  return invoke<BackupEntry>("mc_backup_create", { instanceId });
}

export async function mcBackupList(instanceId: string): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("mc_backup_list", { instanceId });
}

export async function mcBackupDelete(instanceId: string, backupId: string): Promise<void> {
  return invoke<void>("mc_backup_delete", { instanceId, backupId });
}

/** Restore a backup. Stashes current saves/ to
 *  `saves.before-restore-{ts}/` before extracting the zip — so the user
 *  has a recovery path if they restored the wrong backup. */
export async function mcBackupRestore(instanceId: string, backupId: string): Promise<void> {
  await invoke<void>("mc_backup_restore", { instanceId, backupId });
  // Restore succeeded → unlock #32 "Phoenix".
  achievementFlags.markMcBackupRestored();
}
