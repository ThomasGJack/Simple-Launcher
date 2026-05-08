// Cosmetics débloquables — frames d'avatar (MVP). Les badges et
// banners viendront en Phase ultérieure (cf. POSTMVP_TODO).
//
// Architecture :
//   - Catalog hardcodé ci-dessous (registry des cosmétiques dispo)
//   - Conditions d'unlock évaluées client-side via `isUnlocked(ctx)`
//   - Persistence : sous-coll `/users/{uid}/cosmetics/{cosmeticId}`
//     (cf. `src/firebase/cosmetics.ts`) — un doc = un unlock
//   - Equip : champ `equippedCosmetics` sur le user doc principal
//
// Sources d'unlock supportées :
//   - default  : disponible pour tous les users dès le début
//   - tier-*   : nécessite un tier Ko-fi (supporter / vip / legend)
//   - seasonal-* : disponible pendant la saison active
//   - admin    : grant manuel par l'admin du launcher
//   - achievement-* : auto-grant quand l'achievement correspondant
//                    est débloqué (Phase ultérieure)

import type { SupporterTier } from "./supporterTier";
import type { SeasonId } from "./seasonal";

export type CosmeticKind = "frame";

export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export type CosmeticUnlockSource =
  | "default"
  | "tier-supporter"
  | "tier-vip"
  | "tier-legend"
  | "seasonal-halloween"
  | "seasonal-christmas"
  | "admin"
  | "achievement";

/**
 * Description visuelle d'une frame d'avatar. Le composant
 * `<AvatarFrame>` lit ces props et rend un SVG autour d'un avatar.
 */
export type FrameSpec = {
  strokeColor: string;
  /** Épaisseur du trait en px. */
  strokeWidth: number;
  /** Optional : gradient circulaire (start → end). Si null, couleur
   *  pleine. */
  gradient?: [string, string];
  /** Pattern visuel. */
  pattern?: "solid" | "double" | "dashed" | "rainbow";
  /** Animation : rotation continue, pulse, etc. */
  animate?: "none" | "rotate" | "pulse" | "rainbow-shift";
};

export type Cosmetic = {
  id: string;
  kind: CosmeticKind;
  label: string;
  description: string;
  rarity: CosmeticRarity;
  unlockSource: CosmeticUnlockSource;
  frame?: FrameSpec;
};

export const COSMETICS: Cosmetic[] = [
  {
    id: "frame.none",
    kind: "frame",
    label: "Aucun",
    description: "Pas de cadre.",
    rarity: "common",
    unlockSource: "default",
  },
  {
    id: "frame.cyan-ring",
    kind: "frame",
    label: "Anneau cyan",
    description: "Cadre cyan simple, l'accent signature du launcher.",
    rarity: "common",
    unlockSource: "default",
    frame: {
      strokeColor: "#00d4ff",
      strokeWidth: 2,
      pattern: "solid",
      animate: "none",
    },
  },
  {
    id: "frame.dashed-cyan",
    kind: "frame",
    label: "Anneau pointillé",
    description: "Style technique, traits discontinus.",
    rarity: "common",
    unlockSource: "default",
    frame: {
      strokeColor: "#00d4ff",
      strokeWidth: 2,
      pattern: "dashed",
    },
  },
  {
    id: "frame.bronze",
    kind: "frame",
    label: "Anneau bronze",
    description: "Réservé aux Soutiens. Bronze chaud + halo.",
    rarity: "rare",
    unlockSource: "tier-supporter",
    frame: {
      strokeColor: "#cd7f32",
      strokeWidth: 3,
      gradient: ["#cd7f32", "#ffb75e"],
      pattern: "solid",
      animate: "pulse",
    },
  },
  {
    id: "frame.vip-double",
    kind: "frame",
    label: "Anneau VIP",
    description: "Cyan + violet, cadre épais double.",
    rarity: "epic",
    unlockSource: "tier-vip",
    frame: {
      strokeColor: "#a855f7",
      strokeWidth: 3,
      gradient: ["#22d3ee", "#a855f7"],
      pattern: "double",
      animate: "rotate",
    },
  },
  {
    id: "frame.legend-rainbow",
    kind: "frame",
    label: "Anneau Légende",
    description: "Rainbow tournant — réservé aux Légendes.",
    rarity: "legendary",
    unlockSource: "tier-legend",
    frame: {
      strokeColor: "#ffd700",
      strokeWidth: 3,
      pattern: "rainbow",
      animate: "rainbow-shift",
    },
  },
  {
    id: "frame.halloween-pumpkin",
    kind: "frame",
    label: "Anneau Halloween",
    description: "Orange + violet, dispo seulement en saison.",
    rarity: "epic",
    unlockSource: "seasonal-halloween",
    frame: {
      strokeColor: "#fb923c",
      strokeWidth: 3,
      gradient: ["#fb923c", "#9333ea"],
      pattern: "double",
      animate: "pulse",
    },
  },
  {
    id: "frame.christmas-snow",
    kind: "frame",
    label: "Anneau Noël",
    description: "Rouge + vert, dispo seulement en saison.",
    rarity: "epic",
    unlockSource: "seasonal-christmas",
    frame: {
      strokeColor: "#dc2626",
      strokeWidth: 3,
      gradient: ["#dc2626", "#10b981"],
      pattern: "double",
      animate: "pulse",
    },
  },
];

/**
 * Context utilisé pour évaluer si une cosmétique est unlocked. Fourni
 * par le caller (typiquement la page Profile / Settings).
 */
export type UnlockContext = {
  tier: SupporterTier | null;
  activeSeason: SeasonId | null;
  /** Liste des cosmétiques explicitement granted via Firestore (admin
   *  grant, achievement auto-grant, etc.). */
  grantedCosmeticIds: string[];
};

export function isUnlocked(cosmeticId: string, ctx: UnlockContext): boolean {
  const c = COSMETICS.find((x) => x.id === cosmeticId);
  if (!c) return false;
  // Si c'est dans grantedCosmeticIds, c'est forcément unlocked
  // (admin grant, achievement, etc.)
  if (ctx.grantedCosmeticIds.includes(cosmeticId)) return true;
  switch (c.unlockSource) {
    case "default":
      return true;
    case "tier-supporter":
      return ctx.tier === "supporter" || ctx.tier === "vip" || ctx.tier === "legend";
    case "tier-vip":
      return ctx.tier === "vip" || ctx.tier === "legend";
    case "tier-legend":
      return ctx.tier === "legend";
    case "seasonal-halloween":
      return ctx.activeSeason === "halloween";
    case "seasonal-christmas":
      return ctx.activeSeason === "christmas";
    case "admin":
    case "achievement":
      return false; // doit être explicitement granted
  }
}

export function getCosmetic(id: string | null): Cosmetic | null {
  if (!id) return null;
  return COSMETICS.find((c) => c.id === id) ?? null;
}

export const RARITY_STYLES: Record<
  CosmeticRarity,
  { label: string; ring: string; text: string; bg: string }
> = {
  common: {
    label: "Commun",
    ring: "ring-white/20",
    text: "text-fg-muted",
    bg: "bg-white/[0.04]",
  },
  rare: {
    label: "Rare",
    ring: "ring-cyan-500/40",
    text: "text-cyan-300",
    bg: "bg-cyan-500/10",
  },
  epic: {
    label: "Épique",
    ring: "ring-purple-500/40",
    text: "text-purple-300",
    bg: "bg-purple-500/10",
  },
  legendary: {
    label: "Légendaire",
    ring: "ring-amber-500/50",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
  },
};
