import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

initializeApp();

const DISCORD_CLIENT_SECRET = defineSecret("DISCORD_CLIENT_SECRET");
const DISCORD_CLIENT_ID = defineSecret("DISCORD_CLIENT_ID");

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  verified?: boolean;
  locale?: string;
};

export const discordAuth = onCall(
  {
    region: "europe-west1",
    secrets: [DISCORD_CLIENT_SECRET, DISCORD_CLIENT_ID],
    cors: true,
  },
  async (request) => {
    const { code, redirectUri } = (request.data ?? {}) as { code?: string; redirectUri?: string };
    if (!code || !redirectUri) {
      throw new HttpsError("invalid-argument", "Missing code or redirectUri");
    }
    logger.info("discordAuth start", { redirectUri, codeLen: code.length });

    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID.value(),
          client_secret: DISCORD_CLIENT_SECRET.value(),
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        logger.error("Discord token exchange failed", { status: tokenRes.status, detail });
        throw new HttpsError("permission-denied", `Discord token exchange failed: ${detail}`);
      }
      const tokens = (await tokenRes.json()) as DiscordTokenResponse;
      logger.info("Discord token received", { scope: tokens.scope });

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!userRes.ok) {
        const detail = await userRes.text();
        logger.error("Discord /users/@me failed", { status: userRes.status, detail });
        throw new HttpsError("unauthenticated", "Failed to fetch Discord user");
      }
      const discordUser = (await userRes.json()) as DiscordUser;
      logger.info("Discord user fetched", { id: discordUser.id, username: discordUser.username });

      const uid = `discord_${discordUser.id}`;
      const displayName = discordUser.global_name || discordUser.username;
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
        : null;

      const auth = getAuth();
      try {
        await auth.updateUser(uid, {
          displayName,
          ...(discordUser.email ? { email: discordUser.email, emailVerified: !!discordUser.verified } : {}),
          ...(avatarUrl ? { photoURL: avatarUrl } : {}),
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "auth/user-not-found") {
          await auth.createUser({
            uid,
            displayName,
            ...(discordUser.email ? { email: discordUser.email, emailVerified: !!discordUser.verified } : {}),
            ...(avatarUrl ? { photoURL: avatarUrl } : {}),
          });
        } else {
          logger.error("auth.updateUser failed", { code, err });
          throw err;
        }
      }

      const db = getFirestore();
      await db
        .collection("users")
        .doc(uid)
        .set(
          {
            discordId: discordUser.id,
            username: discordUser.username,
            displayName,
            avatarUrl,
            email: discordUser.email ?? null,
            locale: discordUser.locale ?? null,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      const customToken = await auth.createCustomToken(uid);
      logger.info("discordAuth done", { uid });
      return { customToken };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error("discordAuth unexpected error", { message, stack });
      throw new HttpsError("internal", message);
    }
  },
);

/**
 * Scheduled Cloud Function — runs every 24 hours and deletes log entries
 * (and ServerStats snapshots, and resolved invitations) older than the
 * retention window. Keeps Firestore quota under control without manual
 * sweeping.
 *
 * Retention windows:
 *   - logs                       : 30 days
 *   - serverStats subcollections : 14 days (the per-5-min snapshots are
 *                                  redundant past 2 weeks; the parent doc
 *                                  keeps the all-time peak forever)
 *   - invitations                : 7 days for resolved/expired (pending kept)
 */
export const cleanupOldData = onSchedule(
  {
    schedule: "every 24 hours",
    region: "europe-west1",
    timeoutSeconds: 540, // 9 min — Firestore deletes can take a while
    memory: "512MiB",
  },
  async () => {
    const db = getFirestore();
    const stats = { logs: 0, snapshots: 0, invitations: 0 };

    // --- /logs older than 30 days ----------------------------------------
    {
      const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const snap = await db
        .collection("logs")
        .where("serverTs", "<", cutoff)
        .limit(500)
        .get();
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      if (!snap.empty) await batch.commit();
      stats.logs = snap.size;
    }

    // --- /serverStats/{id}/snapshots/* older than 14 days -----------------
    {
      const cutoff = Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const allStats = await db.collection("serverStats").get();
      for (const stat of allStats.docs) {
        const oldSnaps = await stat.ref
          .collection("snapshots")
          .where("ts", "<", cutoff)
          .limit(500)
          .get();
        if (oldSnaps.empty) continue;
        const batch = db.batch();
        for (const s of oldSnaps.docs) batch.delete(s.ref);
        await batch.commit();
        stats.snapshots += oldSnaps.size;
      }
    }

    // --- /invitations resolved more than 7 days ago -----------------------
    {
      const cutoff = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const snap = await db
        .collection("invitations")
        .where("resolvedAt", "<", cutoff)
        .limit(500)
        .get();
      const batch = db.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      if (!snap.empty) await batch.commit();
      stats.invitations = snap.size;
    }

    logger.info("cleanupOldData done", stats);
  },
);
