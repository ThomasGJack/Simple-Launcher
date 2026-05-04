/**
 * Paid supporter tiers — surfaced on the VIP page and gating a few
 * power-user features (notably creating private crews). Until the
 * Stripe / Firebase Billing wiring is in place, the admin grants tiers
 * manually via the admin panel.
 *
 * Order matters: it represents progressive privilege (supporter <
 * vip < legend). Use `tierAtLeast` to gate features cleanly.
 */
export type SupporterTier = "supporter" | "vip" | "legend";

const TIER_RANK: Record<SupporterTier, number> = {
  supporter: 1,
  vip: 2,
  legend: 3,
};

export const TIER_LABEL: Record<SupporterTier, string> = {
  supporter: "Soutien",
  vip: "VIP",
  legend: "Légende",
};

/** True if the user's tier is at least the requested level. `null`
 *  (free user) returns false for any non-null requirement. */
export function tierAtLeast(
  userTier: SupporterTier | null | undefined,
  required: SupporterTier,
): boolean {
  if (!userTier) return false;
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

/** True if the user has any paid tier. Used as the simplest "is paid
 *  supporter" check for features that don't care about the specific
 *  tier (e.g. unlocking custom crew creation). */
export function hasAnyTier(
  userTier: SupporterTier | null | undefined,
): boolean {
  return !!userTier;
}
