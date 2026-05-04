/**
 * Ko-fi billing — supporter tier subscriptions via Ko-fi memberships.
 *
 * Ko-fi sends a webhook to a public URL on every transaction (donation,
 * shop order, subscription payment, etc.). We listen here, verify the
 * `verification_token` matches our shared secret, then update
 * `users/{uid}.tier` based on the membership tier the user paid for.
 *
 * ─────────────────────────────────────────────────────────────────
 * 1. CONFIGURATION CÔTÉ KO-FI
 * ─────────────────────────────────────────────────────────────────
 *
 * a. Créer un compte sur https://ko-fi.com (gratuit, perso, sans
 *    société requise — Ko-fi gère la facturation à ta place).
 *
 * b. Créer 3 "Memberships" dans Ko-fi (Settings → Memberships) :
 *      - "Soutien"  à 1 €/mois   (active "Allow message" requis)
 *      - "VIP"      à 5 €/mois
 *      - "Légende"  à 10 €/mois
 *    IMPORTANT : les noms des tiers DOIVENT contenir "Soutien", "VIP",
 *    ou "Légende" (case-insensitive), sinon le webhook ignore la
 *    transaction. Voir tierFromKofiName() ci-dessous.
 *
 * c. Activer les webhooks dans Ko-fi (More → API & Webhooks) :
 *      - Webhook URL : https://europe-west1-<projectId>.cloudfunctions.net/kofiWebhook
 *      - Cocher "Send shop, donation and membership events"
 *      - Copier le "Verification Token" affiché en haut.
 *
 * d. Sauvegarder ce token comme secret Firebase :
 *      firebase functions:secrets:set KOFI_VERIFICATION_TOKEN
 *      (coller le token quand demandé)
 *
 * e. Déployer : firebase deploy --only functions
 *
 * ─────────────────────────────────────────────────────────────────
 * 2. FLUX UTILISATEUR
 * ─────────────────────────────────────────────────────────────────
 *
 * 1. Dans le launcher, le user clique sur "Souscrire" pour un tier.
 * 2. Le launcher copie son UID Firebase dans le presse-papier et ouvre
 *    Ko-fi dans le navigateur système.
 * 3. Le user choisit la membership Ko-fi correspondante et colle son
 *    UID dans le champ "Message" pendant le checkout (étape critique
 *    documentée dans la modal).
 * 4. Ko-fi traite le paiement, puis appelle ce webhook.
 * 5. On parse le message → on retrouve l'UID → on grant le tier.
 *
 * ─────────────────────────────────────────────────────────────────
 * 3. ANNULATION / EXPIRATION
 * ─────────────────────────────────────────────────────────────────
 *
 * Ko-fi n'envoie PAS de webhook quand un user annule sa membership.
 * On envoie un payment chaque mois — si on n'en reçoit pas pendant
 * > 35 jours, on considère l'abo annulé. Le scheduled job
 * `cleanupExpiredKofiSubscriptions` (dans index.ts) tourne toutes
 * les 24 h et révoque les tiers stale.
 */

import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const KOFI_VERIFICATION_TOKEN = defineSecret("KOFI_VERIFICATION_TOKEN");

type SupporterTier = "supporter" | "vip" | "legend";

/**
 * Shape of the JSON Ko-fi POSTs (inside form field "data").
 * See https://help.ko-fi.com/hc/en-us/articles/360004162298 for the
 * authoritative spec — we only declare fields we read.
 */
type KofiPayload = {
  verification_token: string;
  message_id: string;
  timestamp: string;
  type: "Donation" | "Subscription" | "Commission" | "Shop Order";
  is_public: boolean;
  from_name: string;
  message: string | null;
  amount: string;
  url: string;
  email: string;
  currency: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  shop_items: unknown;
  tier_name: string | null;
  shipping: unknown;
};

/**
 * Map a Ko-fi tier name (free-form text the creator typed in Ko-fi
 * settings) to one of our 3 SupporterTier values. Case + accent
 * insensitive so "soutien", "Soutien", "Soutien Bronze" all resolve
 * to "supporter".
 */
function tierFromKofiName(name: string | null): SupporterTier | null {
  if (!name) return null;
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents
  if (n.includes("soutien") || n.includes("supporter")) return "supporter";
  if (n.includes("vip")) return "vip";
  if (n.includes("legende") || n.includes("legend")) return "legend";
  return null;
}

/**
 * Extract a Firebase UID from the free-form Ko-fi message. We expect
 * the user to paste their UID (Discord-style "discord_<digits>") into
 * the message field during checkout. The regex is lenient — it'll
 * match the UID even surrounded by other text.
 */
function extractUserUid(message: string | null): string | null {
  if (!message) return null;
  // Discord auth IDs follow the pattern "discord_<digits>". Other auth
  // providers might use different patterns later — extend here.
  const m = message.match(/discord_\d+/);
  return m ? m[0] : null;
}

// ─── Webhook ────────────────────────────────────────────────────────

export const kofiWebhook = onRequest(
  {
    region: "europe-west1",
    secrets: [KOFI_VERIFICATION_TOKEN],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Ko-fi posts as application/x-www-form-urlencoded with a single
    // "data" field containing the JSON payload. onRequest parses the
    // form-encoded body for us, so req.body.data is the JSON string.
    let payload: KofiPayload;
    try {
      const raw = (req.body as { data?: unknown }).data;
      if (typeof raw !== "string") throw new Error("Missing 'data' field");
      payload = JSON.parse(raw) as KofiPayload;
    } catch (err) {
      logger.error("kofi: invalid payload", { err: String(err) });
      res.status(400).send("Invalid payload");
      return;
    }

    // Verify the shared secret. Reject mismatches loudly — this is the
    // only thing protecting us from anyone POSTing fake transactions.
    // Trim both sides because secrets set via `echo "..." | firebase` end
    // up with a trailing \n that wouldn't match Ko-fi's clean payload.
    const expectedToken = KOFI_VERIFICATION_TOKEN.value().trim();
    const receivedToken = (payload.verification_token ?? "").trim();
    if (receivedToken !== expectedToken) {
      // Log the first 8 chars of each side so we can diagnose without
      // dumping the full secret. Useful when the user has different
      // tokens stored on Ko-fi vs Firebase.
      logger.warn("kofi: token mismatch", {
        type: payload.type,
        from: payload.from_name,
        receivedPrefix: receivedToken.slice(0, 8),
        expectedPrefix: expectedToken.slice(0, 8),
        receivedLen: receivedToken.length,
        expectedLen: expectedToken.length,
      });
      res.status(403).send("Forbidden");
      return;
    }

    const db = getFirestore();

    // Always log the raw transaction to /kofiTransactions for audit.
    // Idempotent on kofi_transaction_id so duplicate webhook deliveries
    // (Ko-fi sometimes retries) don't double-grant.
    await db
      .collection("kofiTransactions")
      .doc(payload.kofi_transaction_id)
      .set(
        {
          ...payload,
          receivedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    // We only care about subscription/membership payments — donations
    // and shop orders ack 200 but don't trigger any tier change.
    if (payload.type !== "Subscription" || !payload.is_subscription_payment) {
      logger.info("kofi: non-subscription event", {
        type: payload.type,
        is_sub: payload.is_subscription_payment,
      });
      res.status(200).send("ok");
      return;
    }

    const uid = extractUserUid(payload.message);
    if (!uid) {
      logger.warn("kofi: no UID in message", {
        message: payload.message?.slice(0, 100),
        from: payload.from_name,
        email: payload.email,
      });
      // Acknowledge so Ko-fi doesn't retry, but flag it so we can
      // grant the tier manually via the admin panel after asking the
      // user for their UID.
      await db.collection("kofiUnmatched").add({
        ...payload,
        receivedAt: FieldValue.serverTimestamp(),
      });
      res.status(200).send("ok (unmatched)");
      return;
    }

    const tier = tierFromKofiName(payload.tier_name);
    if (!tier) {
      logger.warn("kofi: unknown tier name", { name: payload.tier_name });
      res.status(200).send("ok (unknown tier)");
      return;
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      logger.warn("kofi: user not found", { uid });
      res.status(200).send("ok (user not found)");
      return;
    }

    await userRef.set(
      {
        tier,
        kofiTierName: payload.tier_name,
        kofiSubscriberEmail: payload.email,
        kofiLastPaymentAt: FieldValue.serverTimestamp(),
        kofiSubscriptionActive: true,
        kofiTransactionId: payload.kofi_transaction_id,
        tierGrantedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    logger.info("kofi: tier granted", {
      uid,
      tier,
      kofiTier: payload.tier_name,
      isFirst: payload.is_first_subscription_payment,
    });
    res.status(200).send("ok");
  },
);

// ─── Scheduled cleanup ──────────────────────────────────────────────

/**
 * Ko-fi doesn't send a "subscription cancelled" webhook — they just
 * stop sending monthly payments. We assume any user whose last
 * payment is older than 35 days has cancelled, and revoke their tier.
 *
 * The 35-day window covers normal billing variance (a payment day
 * delayed by a few days due to bank cycles) without hanging an extra
 * month of free tier on cancellations.
 */
export const cleanupExpiredKofiSubscriptions = onSchedule(
  {
    schedule: "every 24 hours",
    region: "europe-west1",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - 35 * 24 * 60 * 60 * 1000);

    const expired = await db
      .collection("users")
      .where("kofiSubscriptionActive", "==", true)
      .where("kofiLastPaymentAt", "<", cutoff)
      .limit(500)
      .get();

    if (expired.empty) {
      logger.info("kofi cleanup: no expired subscriptions");
      return;
    }

    const batch = db.batch();
    for (const doc of expired.docs) {
      batch.update(doc.ref, {
        tier: null,
        kofiSubscriptionActive: false,
        tierRevokedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    logger.info("kofi cleanup: revoked", { count: expired.size });
  },
);
