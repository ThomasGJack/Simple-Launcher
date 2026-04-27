import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, X, Check, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import {
  setInvitationStatus,
  watchIncomingInvitations,
  type GameInvitation,
} from "@/firebase/invitations";
import { sounds } from "@/lib/sounds";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications";

/**
 * Floating popup that appears in the bottom-right whenever the current user
 * has at least one pending game invitation. Stacks if multiple come in at
 * once. On Accept, navigates to the inviter's module page so the user can
 * install/launch — the auto-launch chain (download + start the game) is
 * intentionally manual for safety; we don't want a malicious peer to spam
 * an auto-install.
 *
 * Mirrors a Native OS notification too so the user sees the ping even if
 * the launcher is minimized.
 */
export function InvitationPopupHost() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [incoming, setIncoming] = useState<GameInvitation[]>([]);
  /** Track invitation IDs we've already toasted to the OS so we don't
   *  spam Windows with the same notification on every Firestore snapshot. */
  const [notified, setNotified] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!me) {
      setIncoming([]);
      return;
    }
    return watchIncomingInvitations(me.uid, setIncoming);
  }, [me?.uid]);

  // OS-level ping the very first time we see an invitation locally
  useEffect(() => {
    for (const inv of incoming) {
      if (notified.has(inv.id)) continue;
      sounds.notification();
      notify({
        title: `${inv.fromName} t'invite à jouer`,
        body: `${inv.moduleName}${inv.note ? ` — « ${inv.note} »` : ""}`,
        metadata: { kind: "game-invitation", invitationId: inv.id },
      });
      setNotified((prev) => {
        const next = new Set(prev);
        next.add(inv.id);
        return next;
      });
    }
  }, [incoming, notified]);

  const visible = useMemo(() => incoming.slice(0, 3), [incoming]);
  if (visible.length === 0) return null;

  return (
    <div className="no-drag fixed bottom-24 right-6 z-50 flex flex-col gap-3">
      <AnimatePresence>
        {visible.map((inv) => (
          <InvitationCard
            key={inv.id}
            invitation={inv}
            onAccept={async () => {
              sounds.success();
              await setInvitationStatus(inv.id, "accepted").catch(() => {});
              logger.action("Game invitation accepted", {
                source: "InvitationPopup",
                metadata: { invitationId: inv.id, moduleId: inv.moduleId, fromUid: inv.fromUid },
              });
              navigate({ name: "module", moduleId: inv.moduleId });
            }}
            onDecline={async () => {
              sounds.click();
              await setInvitationStatus(inv.id, "declined").catch(() => {});
              logger.action("Game invitation declined", {
                source: "InvitationPopup",
                metadata: { invitationId: inv.id, moduleId: inv.moduleId, fromUid: inv.fromUid },
              });
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function InvitationCard({
  invitation,
  onAccept,
  onDecline,
}: {
  invitation: GameInvitation;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="relative w-80 overflow-hidden rounded-2xl glass-strong p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-accent/30"
    >
      {/* Subtle glow halo */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--color-accent-soft),transparent_60%)]"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
          <Sparkles className="size-3" /> Invitation gaming
        </div>

        <div className="flex items-center gap-3">
          {invitation.fromAvatar ? (
            <img
              src={invitation.fromAvatar}
              alt=""
              className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-accent/30"
            />
          ) : (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 font-display text-accent ring-1 ring-accent/30">
              {invitation.fromName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg-primary">
              {invitation.fromName}
            </div>
            <div className="text-[10px] text-fg-dim">t'invite à jouer</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
          {invitation.moduleIconUrl ? (
            <img
              src={invitation.moduleIconUrl}
              alt=""
              className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <Gamepad2 className="size-4" />
            </div>
          )}
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-fg-primary">
            {invitation.moduleName}
          </div>
        </div>

        {invitation.note && (
          <div className="mt-2 rounded-lg bg-accent/[0.06] px-3 py-1.5 text-xs italic text-fg-muted ring-1 ring-accent/15">
            « {invitation.note} »
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onAccept}
            className="no-drag inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] transition-shadow"
          >
            <Check className="size-3.5" /> Rejoindre
          </button>
          <button
            onClick={onDecline}
            className="no-drag inline-flex items-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary transition-colors"
            title="Refuser"
          >
            <X className="size-3.5" />
            Plus tard
          </button>
        </div>
      </div>
    </motion.div>
  );
}
