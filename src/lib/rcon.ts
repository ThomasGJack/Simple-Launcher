import { invoke } from "@tauri-apps/api/core";

/**
 * Thin TS wrapper over the Rust RCON Tauri commands. Sessions are tracked
 * server-side (in-process); the frontend only juggles the opaque session
 * id returned by `connect()`. Always call `close(sessionId)` when the user
 * leaves the console panel — otherwise the TCP socket stays open.
 */

export type RconResponse = {
  body: string;
};

export async function rconConnect(host: string, port: number, password: string): Promise<string> {
  return invoke<string>("rcon_connect", { host, port, password });
}

export async function rconSend(sessionId: string, command: string): Promise<RconResponse> {
  return invoke<RconResponse>("rcon_send", { sessionId, command });
}

export async function rconClose(sessionId: string): Promise<void> {
  return invoke<void>("rcon_close", { sessionId });
}
