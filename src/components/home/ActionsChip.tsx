import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, MessageCircle, Mail } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { useConversations } from "@/store/firebaseStores";
import { watchIncomingInvitations, type GameInvitation } from "@/firebase/invitations";
import { unreadCount } from "@/types/messaging";
import { cn } from "@/lib/cn";

/**
 * Chip strip surfacing the things waiting for the user's attention right
 * now: unread DMs and pending game invitations. Each pill is clickable
 * and routes to the relevant page. Hidden entirely when nothing is
 * pending so the homepage stays clean.
 */
export function ActionsChip() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const conversations = useConversations(me?.uid);
  const [invitations, setInvitations] = useState<GameInvitation[]>([]);

  useEffect(() => {
    if (!me) return;
    return watchIncomingInvitations(me.uid, setInvitations);
  }, [me?.uid]);

  // Memoize the per-render reductions: HomePage re-renders every 30 s
  // (via setNow) which used to recompute these on every tick. Now they
  // only run when conversations / invitations actually change.
  const totalUnread = useMemo(() => {
    if (!me) return 0;
    return conversations.reduce((s, c) => s + unreadCount(c, me.uid), 0);
  }, [conversations, me?.uid]);
  const pendingInvites = useMemo(
    () => invitations.filter((i) => i.status === "pending").length,
    [invitations],
  );

  if (!me) return null;
  if (totalUnread === 0 && pendingInvites === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-5 flex flex-wrap gap-2"
    >
      <div className="inline-flex items-center gap-1.5 rounded-full bg-bg-soft/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.06]">
        <Bell className="size-3" />
        Actions à voir
      </div>

      <AnimatePresence>
        {totalUnread > 0 && (
          <ActionPill
            key="unread"
            icon={<MessageCircle className="size-3.5" />}
            label={
              totalUnread === 1
                ? "1 message non lu"
                : `${totalUnread} messages non lus`
            }
            tone="accent"
            onClick={() => navigate({ name: "messages" })}
          />
        )}
        {pendingInvites > 0 && (
          <ActionPill
            key="invites"
            icon={<Mail className="size-3.5" />}
            label={
              pendingInvites === 1
                ? "1 invitation à un jeu"
                : `${pendingInvites} invitations`
            }
            tone="amber"
            onClick={() => navigate({ name: "community" })}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ActionPill({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "accent" | "amber" | "emerald";
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      whileHover={{ y: -2, scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "no-drag inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-shadow",
        tone === "accent" &&
          "bg-accent/15 text-accent ring-accent/30 hover:shadow-[0_0_18px_var(--color-accent-soft)]",
        tone === "amber" &&
          "bg-amber-400/15 text-amber-300 ring-amber-400/30 hover:shadow-[0_0_18px_rgba(251,191,36,0.4)]",
        tone === "emerald" &&
          "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30 hover:shadow-[0_0_18px_rgba(74,222,128,0.4)]",
      )}
    >
      {icon}
      {label}
    </motion.button>
  );
}
