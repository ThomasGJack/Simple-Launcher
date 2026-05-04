/**
 * Stripe billing — supporter tier subscriptions.
 *
 * Three tiers map 1:1 to a Stripe Price :
 *   - supporter → 1 €/month   (env STRIPE_PRICE_SUPPORTER)
 *   - vip       → 5 €/month   (env STRIPE_PRICE_VIP)
 *   - legend    → 10 €/month  (env STRIPE_PRICE_LEGEND)
 *
 * Three Cloud Functions are exposed :
 *
 *   1. createSupporterCheckoutSession (callable)
 *      Builds a Stripe Checkout Session for the requested tier and
 *      returns the redirect URL. The launcher opens it in the system
 *      browser ; on success Stripe redirects to a thank-you page.
 *
 *   2. createSupporterPortalSession (callable)
 *      Builds a Stripe Customer Portal Session so the user can manage
 *      / cancel their subscription. Requires the user to already have
 *      a stripeCustomerId.
 *
 *   3. stripeWebhook (HTTP onRequest)
 *      Verifies signatures with STRIPE_WEBHOOK_SECRET and updates
 *      `users/{uid}.tier` based on subscription lifecycle events :
 *        - checkout.session.completed → grant tier
 *        - customer.subscription.deleted / payment_failed → revoke
 *        - customer.subscription.updated → re-grant on plan change
 *
 * Required Firebase secrets (set via `firebase functions:secrets:set NAME`)
 *   STRIPE_SECRET_KEY        sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET    whsec_... from the Stripe webhook UI
 *   STRIPE_PRICE_SUPPORTER   price_... (Soutien recurring 1€)
 *   STRIPE_PRICE_VIP         price_... (VIP recurring 5€)
 *   STRIPE_PRICE_LEGEND      price_... (Légende recurring 10€)
 *
 * Schema additions on users/{uid} :
 *   stripeCustomerId       : string         — set on first checkout
 *   stripeSubscriptionId   : string         — current sub id
 *   stripeSubscriptionStatus: "active" | "trialing" | "past_due" | "canceled"
 *   stripeCurrentPeriodEnd : number (ms)    — for renewal display
 *   tier                   : SupporterTier | null
 */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_PRICE_SUPPORTER = defineSecret("STRIPE_PRICE_SUPPORTER");
const STRIPE_PRICE_VIP = defineSecret("STRIPE_PRICE_VIP");
const STRIPE_PRICE_LEGEND = defineSecret("STRIPE_PRICE_LEGEND");

// Default landing page after a Stripe redirect — the launcher hosting
// domain. Update if the site moves.
const SUCCESS_URL = "https://simplelaunche.web.app/?stripe=success";
const CANCEL_URL = "https://simplelaunche.web.app/?stripe=cancel";
const PORTAL_RETURN_URL = "https://simplelaunche.web.app/";

type Tier = "supporter" | "vip" | "legend";

function priceIdForTier(tier: Tier): string {
  switch (tier) {
    case "supporter":
      return STRIPE_PRICE_SUPPORTER.value();
    case "vip":
      return STRIPE_PRICE_VIP.value();
    case "legend":
      return STRIPE_PRICE_LEGEND.value();
  }
}

function tierFromPriceId(priceId: string | undefined): Tier | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_SUPPORTER.value()) return "supporter";
  if (priceId === STRIPE_PRICE_VIP.value()) return "vip";
  if (priceId === STRIPE_PRICE_LEGEND.value()) return "legend";
  return null;
}

function stripeClient(): Stripe {
  // Pin to the SDK's bundled API version to keep types aligned ;
  // when the SDK upgrades, Stripe gives a deprecation window before
  // the old version stops responding.
  return new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: "2025-02-24.acacia" });
}

/**
 * Returns or creates a Stripe Customer for the given user UID. The
 * customerId is persisted on `users/{uid}.stripeCustomerId` so we
 * never create duplicates for the same Firebase user.
 */
async function getOrCreateCustomer(args: {
  stripe: Stripe;
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<string> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(args.uid);
  const userSnap = await userRef.get();
  const existing = userSnap.get("stripeCustomerId") as string | undefined;
  if (existing) return existing;

  const customer = await args.stripe.customers.create({
    email: args.email ?? undefined,
    name: args.displayName ?? undefined,
    metadata: { uid: args.uid },
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// ─── createSupporterCheckoutSession ──────────────────────────────────

export const createSupporterCheckoutSession = onCall(
  {
    region: "europe-west1",
    secrets: [
      STRIPE_SECRET_KEY,
      STRIPE_PRICE_SUPPORTER,
      STRIPE_PRICE_VIP,
      STRIPE_PRICE_LEGEND,
    ],
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connecte-toi pour souscrire.");
    }
    const { tier } = (request.data ?? {}) as { tier?: string };
    if (tier !== "supporter" && tier !== "vip" && tier !== "legend") {
      throw new HttpsError("invalid-argument", "Tier inconnu.");
    }

    const stripe = stripeClient();
    const uid = request.auth.uid;
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const email = (userSnap.get("email") as string | null) ?? null;
    const displayName = (userSnap.get("displayName") as string | null) ?? null;

    const customerId = await getOrCreateCustomer({ stripe, uid, email, displayName });

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceIdForTier(tier as Tier), quantity: 1 }],
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        allow_promotion_codes: true,
        metadata: { uid, tier },
        subscription_data: { metadata: { uid, tier } },
      });
      logger.info("checkout session created", { uid, tier, sessionId: session.id });
      return { url: session.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("createCheckoutSession failed", { uid, tier, message });
      throw new HttpsError("internal", message);
    }
  },
);

// ─── createSupporterPortalSession ─────────────────────────────────────

export const createSupporterPortalSession = onCall(
  {
    region: "europe-west1",
    secrets: [STRIPE_SECRET_KEY],
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Connecte-toi.");
    }
    const uid = request.auth.uid;
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const customerId = userSnap.get("stripeCustomerId") as string | undefined;
    if (!customerId) {
      throw new HttpsError("failed-precondition", "Pas de client Stripe enregistré.");
    }

    const stripe = stripeClient();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: PORTAL_RETURN_URL,
      });
      return { url: session.url };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("createPortalSession failed", { uid, message });
      throw new HttpsError("internal", message);
    }
  },
);

// ─── stripeWebhook ────────────────────────────────────────────────────

export const stripeWebhook = onRequest(
  {
    region: "europe-west1",
    secrets: [
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_SUPPORTER,
      STRIPE_PRICE_VIP,
      STRIPE_PRICE_LEGEND,
    ],
    // Stripe needs the *raw* request body to verify the signature ;
    // onRequest gives us `req.rawBody` for that.
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }
    const stripe = stripeClient();
    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      res.status(400).send("Missing stripe-signature header");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("webhook signature verify failed", { message });
      res.status(400).send(`Webhook signature failed: ${message}`);
      return;
    }

    try {
      await handleStripeEvent(event, stripe);
      res.status(200).send("ok");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("webhook handler failed", { type: event.type, message });
      // Stripe retries on non-2xx — but only retry server-side errors,
      // not data-shape ones we already logged. Returning 500 schedules
      // a retry; pick that for transient firestore failures.
      res.status(500).send(message);
    }
  },
);

async function handleStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  const db = getFirestore();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.uid as string | undefined;
      if (!uid) {
        logger.warn("checkout.session.completed without uid metadata", {
          sessionId: session.id,
        });
        return;
      }
      // The subscription exists by now — fetch it to read the price.
      const subId = session.subscription as string | null;
      if (!subId) return;
      const sub = await stripe.subscriptions.retrieve(subId);
      const priceId = sub.items.data[0]?.price?.id;
      const tier = tierFromPriceId(priceId);
      if (!tier) {
        logger.warn("unknown price on subscription", { subId, priceId });
        return;
      }
      await db.collection("users").doc(uid).set(
        {
          tier,
          stripeCustomerId: typeof session.customer === "string"
            ? session.customer
            : session.customer?.id,
          stripeSubscriptionId: subId,
          stripeSubscriptionStatus: sub.status,
          stripeCurrentPeriodEnd: ((sub as unknown) as { current_period_end?: number })
            .current_period_end
            ? ((sub as unknown) as { current_period_end: number }).current_period_end * 1000
            : null,
          tierGrantedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      logger.info("tier granted", { uid, tier, subId });
      return;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const uid = sub.metadata?.uid as string | undefined;
      if (!uid) {
        // Fall back: locate user by stripeCustomerId
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const found = await db
          .collection("users")
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();
        if (found.empty) {
          logger.warn("subscription.updated: no user found", { customerId });
          return;
        }
        const userDoc = found.docs[0];
        await applySubUpdate(userDoc.ref, sub);
        return;
      }
      await applySubUpdate(db.collection("users").doc(uid), sub);
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const found = await db
        .collection("users")
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();
      if (found.empty) return;
      const userDoc = found.docs[0];
      await userDoc.ref.set(
        {
          tier: null,
          stripeSubscriptionStatus: "canceled",
          tierRevokedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      logger.info("tier revoked (sub deleted)", { uid: userDoc.id });
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
      if (!customerId) return;
      const found = await db
        .collection("users")
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();
      if (found.empty) return;
      const userDoc = found.docs[0];
      await userDoc.ref.set(
        { stripeSubscriptionStatus: "past_due" },
        { merge: true },
      );
      logger.warn("payment failed", { uid: userDoc.id });
      return;
    }

    default:
      // Unhandled events (charge.*, customer.*, etc.) acked silently.
      return;
  }
}

async function applySubUpdate(
  userRef: FirebaseFirestore.DocumentReference,
  sub: Stripe.Subscription,
): Promise<void> {
  const priceId = sub.items.data[0]?.price?.id;
  const tier = tierFromPriceId(priceId);
  // Active / trialing → keep tier ; anything else (canceled, unpaid…)
  // → drop tier so it doesn't linger past payment failure grace period.
  const isLive = sub.status === "active" || sub.status === "trialing";
  await userRef.set(
    {
      tier: isLive ? tier : null,
      stripeSubscriptionId: sub.id,
      stripeSubscriptionStatus: sub.status,
      stripeCurrentPeriodEnd: ((sub as unknown) as { current_period_end?: number })
        .current_period_end
        ? ((sub as unknown) as { current_period_end: number }).current_period_end * 1000
        : null,
    },
    { merge: true },
  );
}
