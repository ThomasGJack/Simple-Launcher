import { signInWithCustomToken, signOut as fbSignOut, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./config";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
const DISCORD_REDIRECT = "http://localhost:1420/auth/discord/callback";
const DISCORD_SCOPES = ["identify", "email"].join("+");

export function buildDiscordAuthUrl(state: string) {
  if (!DISCORD_CLIENT_ID) throw new Error("VITE_DISCORD_CLIENT_ID missing in .env");
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT,
    response_type: "code",
    scope: DISCORD_SCOPES.replace(/\+/g, " "),
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDiscordCode(code: string): Promise<User> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");

  const callable = httpsCallable<{ code: string; redirectUri: string }, { customToken: string }>(
    fb.functions,
    "discordAuth",
  );
  const { data } = await callable({ code, redirectUri: DISCORD_REDIRECT });
  const cred = await signInWithCustomToken(fb.auth, data.customToken);
  return cred.user;
}

export async function signOut() {
  const fb = getFirebase();
  if (!fb) return;
  await fbSignOut(fb.auth);
}
