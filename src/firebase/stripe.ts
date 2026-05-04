import { httpsCallable } from "firebase/functions";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getFirebase } from "./config";
import type { SupporterTier } from "@/lib/supporterTier";

/**
 * Wrappers around the Cloud Functions that drive Stripe billing. All
 * three functions live in `functions/src/stripe.ts` and are exported
 * from the project's main `functions/src/index.ts`.
 *
 * Why open the URL via Tauri's opener (system browser) and not in-app
 * webview : Stripe Checkout / Customer Portal handles 3DS, Apple Pay,
 * cookies, etc. better in a real browser, and Tauri's webview can hit
 * cookie/privacy weirdness that blocks Stripe flows. After the user
 * completes the flow, Stripe redirects to https://simplelaunche.web.app
 * (a normal browser tab) ; the webhook on the backend updates
 * `users/{uid}.tier` server-side, so the launcher reflects the change
 * automatically as soon as the Firestore listener picks it up.
 */

/**
 * Starts a Stripe Checkout flow for the requested tier. Opens the
 * Stripe-hosted page in the system browser. Throws if the user is
 * not authenticated or if the Cloud Function fails.
 */
export async function startSupporterCheckout(tier: SupporterTier): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non initialisé");
  const fn = httpsCallable<{ tier: SupporterTier }, { url: string }>(
    fb.functions,
    "createSupporterCheckoutSession",
  );
  const { data } = await fn({ tier });
  if (!data?.url) throw new Error("URL de paiement manquante");
  await openUrl(data.url);
}

/**
 * Opens the Stripe Customer Portal so the user can update their
 * payment method, change plan, or cancel. Requires the user to have
 * an active subscription (i.e. a stripeCustomerId on file).
 */
export async function openSupporterPortal(): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non initialisé");
  const fn = httpsCallable<Record<string, never>, { url: string }>(
    fb.functions,
    "createSupporterPortalSession",
  );
  const { data } = await fn({});
  if (!data?.url) throw new Error("URL du portail manquante");
  await openUrl(data.url);
}
