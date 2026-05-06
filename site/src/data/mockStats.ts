/**
 * Stats agrégées de la communauté pour la section Manifesto (§2). Les
 * vraies valeurs vivent dans Firestore mais sont restreintes aux
 * authed users (firestore.rules) — donc inaccessibles sans auth.
 *
 * Les chiffres ci-dessous sont des estimations basses crédibles (le
 * crew est petit). Pas de surenchère — on garde la promesse de
 * "petit crew d'amis" honnête.
 */

export type CommunityStat = {
  label: string;
  value: number;
  unit?: string;
  /** Decimal places displayed (default 0). */
  precision?: number;
  /** Animation duration (sec) for count-up. */
  duration?: number;
};

export const MOCK_STATS: CommunityStat[] = [
  { label: "Membres du crew", value: 217 },
  { label: "Parties lancées (30j)", value: 8421 },
  { label: "Heures cumulées", value: 12340, unit: "h" },
  { label: "Modpacks officiels", value: 9 },
];
