import { signInWithCustomToken, signOut as fbSignOut, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getFirebase } from "./config";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
const DISCORD_SCOPES = ["identify", "email"].join(" ");

type DiscordCallbackParams = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loginWithDiscord(): Promise<User> {
  if (!DISCORD_CLIENT_ID) throw new Error("VITE_DISCORD_CLIENT_ID missing");

  const port = await invoke<number>("start_oauth_listener");
  const redirectUri = `http://localhost:${port}/`;
  const state = randomState();

  const codePromise = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const errorTimeout = setTimeout(() => {
      cleanup();
      reject(new Error("OAuth timeout"));
    }, 300_000);

    const cleanup = () => {
      clearTimeout(errorTimeout);
      unlistenCallback?.();
      unlistenError?.();
    };

    let unlistenCallback: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    listen<DiscordCallbackParams>("oauth-callback", (event) => {
      const { code, state: returnedState, error, error_description } = event.payload;
      cleanup();
      if (error) {
        reject(new Error(error_description || error));
        return;
      }
      if (returnedState !== state) {
        reject(new Error("State mismatch — possible CSRF"));
        return;
      }
      if (!code) {
        reject(new Error("No code returned"));
        return;
      }
      resolve({ code, redirectUri });
    }).then((u) => {
      unlistenCallback = u;
    });

    listen<string>("oauth-error", (event) => {
      cleanup();
      reject(new Error(event.payload));
    }).then((u) => {
      unlistenError = u;
    });
  });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DISCORD_SCOPES,
    state,
    prompt: "none",
  });
  await openUrl(`https://discord.com/oauth2/authorize?${params.toString()}`);

  const { code, redirectUri: usedRedirect } = await codePromise;

  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");

  const callable = httpsCallable<{ code: string; redirectUri: string }, { customToken: string }>(
    fb.functions,
    "discordAuth",
  );
  const { data } = await callable({ code, redirectUri: usedRedirect });
  const cred = await signInWithCustomToken(fb.auth, data.customToken);
  return cred.user;
}

export async function signOut() {
  const fb = getFirebase();
  if (!fb) return;
  await fbSignOut(fb.auth);
}
