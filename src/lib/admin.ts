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

export function adminDiscordIds(): string[] {
  return [...ADMIN_DISCORD_IDS];
}
