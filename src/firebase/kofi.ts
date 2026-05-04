import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Ko-fi page configuration. The user creates a Ko-fi page (free, no
 * company required) and configures memberships there. We just open
 * the URL in the system browser ; the actual payment happens on
 * ko-fi.com and the resulting webhook updates `users/{uid}.tier`
 * server-side (see functions/src/kofi.ts).
 *
 * To configure :
 *   1. Aller sur https://ko-fi.com et créer ton compte.
 *   2. Choisir un nom d'utilisateur — l'URL devient
 *      `https://ko-fi.com/<username>`.
 *   3. Mettre à jour KOFI_USERNAME ci-dessous avec ton username.
 *   4. Créer 3 memberships (1€/5€/10€/mois) avec les noms exacts
 *      "Soutien", "VIP" et "Légende".
 *
 * (Tu peux aussi externaliser dans VITE_KOFI_USERNAME si tu veux
 *  pouvoir changer sans rebuild — la valeur env l'emporte si fournie.)
 */
const KOFI_USERNAME =
  (import.meta.env.VITE_KOFI_USERNAME as string | undefined) ?? "simplelaunche";

export const KOFI_PAGE_URL = `https://ko-fi.com/${KOFI_USERNAME}`;
export const KOFI_TIERS_URL = `${KOFI_PAGE_URL}/tiers`;

/**
 * Copies the user's Firebase UID to the clipboard so they can paste
 * it into the Ko-fi message field during checkout. The UID is what
 * the backend webhook looks for to grant the right tier to the right
 * user. Throws if no clipboard access (rare in Tauri).
 */
export async function copyUserCodeToClipboard(uid: string): Promise<void> {
  await navigator.clipboard.writeText(uid);
}

/**
 * Opens the Ko-fi memberships page in the system browser. Prefers
 * Tauri's opener plugin so the URL escapes the launcher webview ;
 * Stripe-based 3DS challenges and Ko-fi's CSRF cookies behave better
 * outside an embedded webview.
 */
export async function openKofiTiers(): Promise<void> {
  await openUrl(KOFI_TIERS_URL);
}
