import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Sparkles, Check } from "lucide-react";
import {
  COSMETICS,
  RARITY_STYLES,
  isUnlocked,
  type Cosmetic,
} from "@/lib/cosmetics";
import {
  setEquippedFrame,
  watchGrantedCosmetics,
  type GrantedCosmetic,
} from "@/firebase/cosmetics";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { AvatarFrame } from "./AvatarFrame";
import { getActiveSeason } from "@/lib/seasonal";
import type { SupporterTier } from "@/lib/supporterTier";

/**
 * Gallery des cosmétiques du user. Affiche toutes les cosmétiques
 * du catalog, marque celles débloquées (équipables) et celles
 * verrouillées (avec hint sur la condition d'unlock).
 *
 * Utilisable dans la page Profile via un onglet ou une modal.
 *
 * Props :
 *   - `tier` : tier Ko-fi du user (peut être null), résolu par le caller
 *   - `currentEquipped` : ID de la frame actuellement équipée
 *
 * En MVP, on ne propose que les frames d'avatar. Les badges et
 * banners seront ajoutés plus tard.
 */
export function CosmeticsGallery({
  tier,
  currentEquipped,
}: {
  tier: SupporterTier | null;
  currentEquipped: string | null;
}) {
  const me = useAuthStore((s) => s.user);
  const [granted, setGranted] = useState<GrantedCosmetic[]>([]);
  const [busy, setBusy] = useState(false);
  const activeSeason = getActiveSeason();

  useEffect(() => {
    if (!me) return;
    return watchGrantedCosmetics(me.uid, setGranted);
  }, [me]);

  const grantedIds = useMemo(() => granted.map((g) => g.id), [granted]);
  const ctx = useMemo(
    () => ({
      tier,
      activeSeason,
      grantedCosmeticIds: grantedIds,
    }),
    [tier, activeSeason, grantedIds],
  );

  const handleEquip = async (cosmetic: Cosmetic) => {
    if (!me || busy) return;
    if (!isUnlocked(cosmetic.id, ctx)) return;
    setBusy(true);
    try {
      const target = cosmetic.id === "frame.none" ? null : cosmetic.id;
      await setEquippedFrame(me.uid, target);
      sounds.success();
    } catch (err) {
      console.warn("[cosmetics] equip failed:", err);
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  const frames = COSMETICS.filter((c) => c.kind === "frame");

  if (!me) {
    return (
      <div className="rounded-2xl bg-white/[0.025] p-6 text-center text-sm text-fg-muted ring-1 ring-white/[0.06]">
        Connecte-toi pour gérer tes cosmétiques.
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-fg-primary">
            Cadres d'avatar
          </h3>
          <p className="text-xs text-fg-muted">
            Décore ton avatar avec un cadre. Certains sont réservés aux
            soutiens, aux saisons, ou se débloquent via achievement.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {frames.map((c) => {
          const unlocked = isUnlocked(c.id, ctx);
          const isEquipped = currentEquipped === c.id || (c.id === "frame.none" && !currentEquipped);
          const rarity = RARITY_STYLES[c.rarity];
          return (
            <button
              key={c.id}
              onClick={() => handleEquip(c)}
              disabled={!unlocked || busy}
              className={cn(
                "group relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition ring-1",
                isEquipped
                  ? "bg-accent/10 ring-accent/40"
                  : unlocked
                    ? "bg-white/[0.03] ring-white/[0.05] hover:bg-white/[0.06]"
                    : "bg-white/[0.02] ring-white/[0.04] opacity-60 cursor-not-allowed",
              )}
              title={unlocked ? c.description : `Verrouillé : ${unlockHint(c)}`}
            >
              {/* Preview de la frame autour d'un avatar mock */}
              <div className="relative">
                <AvatarFrame frameId={c.id} size={56}>
                  <div
                    className="grid size-full place-items-center bg-gradient-to-br from-accent/40 to-fuchsia-500/40 font-display text-xl text-fg-primary"
                  >
                    {(me.displayName ?? "?").trim().charAt(0).toUpperCase()}
                  </div>
                </AvatarFrame>
                {!unlocked && (
                  <div className="absolute inset-0 grid place-items-center rounded-full bg-bg-base/60 backdrop-blur-sm">
                    <Lock className="size-4 text-fg-dim" />
                  </div>
                )}
                {isEquipped && (
                  <div className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-bg-base ring-2 ring-bg-base">
                    <Check className="size-3" strokeWidth={3} />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-fg-primary">
                  {c.label}
                </div>
                <div
                  className={cn(
                    "mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ring-1",
                    rarity.bg,
                    rarity.text,
                    rarity.ring,
                  )}
                >
                  {rarity.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}

function unlockHint(c: Cosmetic): string {
  switch (c.unlockSource) {
    case "default":
      return "disponible par défaut";
    case "tier-supporter":
      return "tier Soutien (Ko-fi)";
    case "tier-vip":
      return "tier VIP (Ko-fi)";
    case "tier-legend":
      return "tier Légende (Ko-fi)";
    case "seasonal-halloween":
      return "saison Halloween (15 oct → 5 nov)";
    case "seasonal-christmas":
      return "saison Noël (15 déc → 5 jan)";
    case "admin":
      return "grant admin manuel";
    case "achievement":
      return "achievement à débloquer";
  }
}
