import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  Megaphone,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  markAllAsRead,
  markAsRead,
  type AppNotification,
  type NotificationKind,
} from "@/firebase/notifications";
import { useAuthStore } from "@/store/auth";
import { useNotifications } from "@/store/firebaseStores";
import { useUIStore } from "@/store/ui";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Slide-over panel that lists every notification the user has received,
 * with read/unread state and per-entry click-to-navigate.
 *
 * The bell button that opens this panel lives in the Sidebar — it
 * displays an unread count badge using the same `useNotifications`
 * subscription so opening / not opening this panel doesn't matter.
 */
export function NotificationsCenter({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const notifs = useNotifications(user?.uid);

  const unreadIds = useMemo(
    () => notifs.filter((n) => n.readAtMs === null).map((n) => n.id),
    [notifs],
  );

  const handleClickNotif = async (n: AppNotification) => {
    if (!user) return;
    sounds.click();
    if (n.readAtMs === null) {
      await markAsRead(user.uid, n.id).catch((err) =>
        console.warn("[notifications] mark read failed:", err),
      );
    }
    if (n.link) {
      const route = parseLink(n.link);
      if (route) {
        navigate(route);
        onClose();
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!user || unreadIds.length === 0) return;
    sounds.click();
    await markAllAsRead(user.uid, unreadIds).catch((err) =>
      console.warn("[notifications] mark all read failed:", err),
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Click-anywhere backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[92vw] flex-col bg-bg-soft/95 backdrop-blur-md ring-1 ring-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
              <div className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <Bell className="size-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Notifications</div>
                <div className="text-xs text-fg-muted">
                  {notifs.length === 0
                    ? "Aucune"
                    : unreadIds.length > 0
                      ? `${unreadIds.length} non lue${unreadIds.length > 1 ? "s" : ""} sur ${notifs.length}`
                      : `${notifs.length} entrée${notifs.length > 1 ? "s" : ""}`}
                </div>
              </div>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadIds.length === 0}
                className="rounded-md bg-bg-elevated px-2.5 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base disabled:opacity-40"
                title="Tout marquer comme lu"
              >
                <CheckCheck className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* List */}
            <div className="info-scroll flex-1 overflow-y-auto p-3">
              {notifs.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div>
                    <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-white/[0.03] text-fg-dim ring-1 ring-white/[0.04]">
                      <Bell className="size-6" />
                    </div>
                    <div className="text-sm text-fg-muted">
                      Pas encore de notifications.
                    </div>
                    <div className="mt-1 text-xs text-fg-dim">
                      Achievements, invitations, news — tout arrivera ici.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {notifs.map((n) => (
                    <NotifRow
                      key={n.id}
                      notif={n}
                      onClick={() => handleClickNotif(n)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function NotifRow({
  notif,
  onClick,
}: {
  notif: AppNotification;
  onClick: () => void;
}) {
  const Icon = ICON_BY_KIND[notif.kind] ?? Bell;
  const unread = notif.readAtMs === null;
  const dt = notif.createdAtMs ? new Date(notif.createdAtMs) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors",
        unread
          ? "bg-accent/[0.05] ring-1 ring-accent/20 hover:bg-accent/[0.08]"
          : "bg-white/[0.02] ring-1 ring-white/[0.04] hover:bg-white/[0.04]",
      )}
    >
      <div
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1",
          unread
            ? "bg-accent/15 text-accent ring-accent/30"
            : "bg-white/[0.04] text-fg-muted ring-white/[0.06]",
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              unread ? "text-fg-primary" : "text-fg-muted",
            )}
          >
            {notif.title}
          </span>
          {unread && (
            <span className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_var(--color-accent-glow)]" />
          )}
          <span className="ml-auto shrink-0 text-[10px] text-fg-dim">
            {dt ? formatRelative(dt) : ""}
          </span>
        </div>
        {notif.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-fg-muted">
            {notif.description}
          </div>
        )}
      </div>
    </button>
  );
}

const ICON_BY_KIND: Record<NotificationKind, LucideIcon> = {
  achievement: Sparkles,
  invitation: UserPlus,
  friend: Users,
  news: Megaphone,
  release: Sparkles,
  system: Wrench,
};

/** Naive "X min ago" formatter — good enough for a notif panel. Falls
 *  back to a short date for entries older than a week. */
function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "à l'instant";
  if (diff < hour) return `il y a ${Math.floor(diff / min)} min`;
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Parses a serialized link like "module:abc" / "messages" / "crews:xyz"
 *  into a route compatible with `useUIStore.navigate()`. Returns null on
 *  unknown formats so the row still acts as "mark as read" without
 *  navigating. */
function parseLink(link: string): Parameters<ReturnType<typeof useUIStore.getState>["navigate"]>[0] | null {
  if (link === "home") return { name: "home" };
  if (link === "library") return { name: "library" };
  if (link === "messages") return { name: "messages" };
  if (link === "community") return { name: "community" };
  if (link === "settings") return { name: "settings" };
  if (link === "profile") return { name: "profile" };
  if (link === "sessions") return { name: "sessions" };
  const [head, ...rest] = link.split(":");
  const tail = rest.join(":");
  if (head === "module" && tail) return { name: "module", moduleId: tail };
  if (head === "crews" && tail) return { name: "crews", crewId: tail };
  if (head === "messages" && tail)
    return { name: "messages", conversationId: tail };
  if (head === "user" && tail) return { name: "user-profile", uid: tail };
  return null;
}
