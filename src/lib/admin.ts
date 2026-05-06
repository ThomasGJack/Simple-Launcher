import type { User } from "firebase/auth";

const ADMIN_DISCORD_IDS: string[] = ((import.meta.env.VITE_ADMIN_DISCORD_IDS as string | undefined) ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

export function isAdmin(user: User | null): boolean {
  if (!user || !user.uid.startsWith("discord_")) return false;
  const discordId = user.uid.replace("discord_", "");
  return ADMIN_DISCORD_IDS.includes(discordId);
}

/**
 * Same check but accepts a raw uid string (e.g. when iterating
 * a member list and we want to badge launcher admins as Owners
 * on the master crew). Returns true for `discord_<id>` UIDs that
 * appear in the admin allowlist.
 */
export function isAdminUid(uid: string | null | undefined): boolean {
  if (!uid || !uid.startsWith("discord_")) return false;
  const discordId = uid.replace("discord_", "");
  return ADMIN_DISCORD_IDS.includes(discordId);
}

export function adminDiscordIds(): string[] {
  return [...ADMIN_DISCORD_IDS];
}
