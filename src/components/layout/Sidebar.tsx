import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Home, Library, Settings, LogIn, Shield, Users, Star, MessageCircle, TerminalSquare } from "lucide-react";
import { useUIStore, type Route } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useFavoritesStore } from "@/store/favorites";
import { isAdmin } from "@/lib/admin";
import { sounds } from "@/lib/sounds";
import { watchModules } from "@/firebase/modules";
import { watchUserShortcuts } from "@/firebase/shortcuts";
import { watchConversationsFor } from "@/firebase/messaging";
import { unreadCount, otherParticipant, type Conversation } from "@/types/messaging";
import { notify } from "@/lib/notifications";
import type { LauncherModule } from "@/types/module";
import { cn } from "@/lib/cn";

export function Sidebar() {
  const { route, navigate } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const favoriteIds = useFavoritesStore((s) => s.favorites);
  const [hosted, setHosted] = useState<LauncherModule[]>([]);
  const [shortcuts, setShortcuts] = useState<LauncherModule[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Tracks the last-seen state of each conversation to detect new arrivals.
  // Map: conversationId → lastMessage.sentAt of the last message we observed.
  // When a new message lands AND it's from someone else AND we're not on the
  // messages page, we play the receive chime.
  const lastSeenMsgRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return watchModules(setHosted);
  }, []);
  useEffect(() => {
    if (!user) {
      setShortcuts([]);
      return;
    }
    return watchUserShortcuts(user.uid, setShortcuts);
  }, [user]);

  // Watch all conversations for the current user — feeds both the unread
  // badge on the sidebar and the global "new message" chime when a DM
  // arrives from outside the messages page.
  useEffect(() => {
    if (!user) {
      setConversations([]);
      lastSeenMsgRef.current.clear();
      return;
    }
    return watchConversationsFor(user.uid, (next) => {
      // Detect new arrivals from peers (not me) since the previous snapshot.
      // First snapshot seeds the map without ringing — we only chime on
      // strictly fresher activity.
      const seen = lastSeenMsgRef.current;
      const isFirstSnapshot = seen.size === 0;
      let shouldChime = false;
      for (const c of next) {
        const lastSent = c.lastMessage?.sentAt ?? 0;
        const previouslySeen = seen.get(c.id) ?? 0;
        if (
          !isFirstSnapshot &&
          c.lastMessage &&
          c.lastMessage.senderUid !== user.uid &&
          lastSent > previouslySeen
        ) {
          shouldChime = true;
        }
        seen.set(c.id, lastSent);
      }
      // Don't chime if the user is already on the messages page (the chat
      // panel itself handles the receive sound there).
      const onMessagesPage = route.name === "messages";
      if (shouldChime && !onMessagesPage) {
        sounds.messageReceived();
        // Also fire an OS-level notification if the launcher window is
        // not focused — this is the killer feature that lets users hear
        // friend pings even when the launcher is minimized to the tray.
        const newest = next.find(
          (c) => c.lastMessage && c.lastMessage.senderUid !== user.uid &&
            c.lastMessage.sentAt > (seen.get(c.id) ?? 0) - 1,
        );
        if (newest && newest.lastMessage) {
          const peerUid = otherParticipant(newest, user.uid);
          const peerName = newest.participantNames[peerUid] ?? "Anonyme";
          notify({
            title: peerName,
            body: newest.lastMessage.text,
            metadata: { conversationId: newest.id, kind: "new-message" },
          });
        }
      }
      setConversations(next);
    });
  }, [user, route.name]);

  const totalUnread = useMemo(() => {
    if (!user) return 0;
    return conversations.reduce((sum, c) => sum + unreadCount(c, user.uid), 0);
  }, [conversations, user]);

  const favoriteModules = useMemo(() => {
    const all = [...shortcuts, ...hosted];
    const byId = new Map(all.map((m) => [m.id, m] as const));
    return Array.from(favoriteIds)
      .map((id) => byId.get(id))
      .filter((m): m is LauncherModule => !!m);
  }, [favoriteIds, hosted, shortcuts]);

  const isActive = (target: Route) => {
    if (target.name !== route.name) return false;
    if (target.name === "module" && route.name === "module") {
      return target.moduleId === route.moduleId;
    }
    // For "messages", the sidebar entry should highlight whether or not a
    // specific conversation is selected — both /messages and
    // /messages?conversationId=xxx count as the same root.
    return true;
  };

  return (
    <aside className="no-drag flex w-20 shrink-0 flex-col items-center justify-between overflow-y-auto border-r border-white/[0.04] bg-bg-soft/60 py-5 backdrop-blur-md">
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => navigate({ name: "home" })}
          className="group relative grid size-12 place-items-center overflow-hidden rounded-xl transition-transform hover:scale-105"
        >
          <img src="/logo.png" alt="Simple Launcher" className="size-12 object-cover" />
          <div className="absolute inset-0 rounded-xl ring-1 ring-accent/30 group-hover:ring-accent/60 group-hover:shadow-[0_0_24px_var(--color-accent-glow)]" />
        </button>

        <div className="my-2 h-px w-8 bg-white/[0.06]" />

        <nav className="flex flex-col items-center gap-2">
          <NavButton
            icon={Home}
            label="Accueil"
            active={isActive({ name: "home" })}
            onClick={() => navigate({ name: "home" })}
          />
          <NavButton
            icon={Library}
            label="Bibliothèque"
            active={isActive({ name: "library" })}
            onClick={() => navigate({ name: "library" })}
          />
          <NavButton
            icon={Users}
            label="Communauté"
            active={isActive({ name: "community" })}
            onClick={() => navigate({ name: "community" })}
          />
          <NavButton
            icon={MessageCircle}
            label="Messages"
            active={isActive({ name: "messages" })}
            badge={totalUnread}
            onClick={() => navigate({ name: "messages" })}
          />
        </nav>

        {favoriteModules.length > 0 && (
          <>
            <div className="my-2 h-px w-8 bg-white/[0.06]" />
            <div className="flex flex-col items-center gap-2">
              {favoriteModules.map((m) => (
                <FavoriteButton
                  key={m.id}
                  module={m}
                  active={isActive({ name: "module", moduleId: m.id })}
                  onClick={() => navigate({ name: "module", moduleId: m.id })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 pt-3">
        {isAdmin(user) && (
          <>
            <NavButton
              icon={Shield}
              label="Admin"
              active={isActive({ name: "admin" })}
              onClick={() => navigate({ name: "admin" })}
            />
            <NavButton
              icon={TerminalSquare}
              label="Logs"
              active={isActive({ name: "admin-logs" })}
              onClick={() => navigate({ name: "admin-logs" })}
            />
          </>
        )}
        <NavButton
          icon={Settings}
          label="Paramètres"
          active={isActive({ name: "settings" })}
          onClick={() => navigate({ name: "settings" })}
        />

        {user ? (
          <AvatarButton
            photoURL={user.photoURL}
            displayName={user.displayName ?? "Profil"}
            active={
              isActive({ name: "user-profile", uid: user.uid }) ||
              isActive({ name: "profile" })
            }
            onClick={() => navigate({ name: "user-profile", uid: user.uid })}
          />
        ) : (
          <NavButton
            icon={LogIn}
            label="Connexion"
            active={isActive({ name: "login" })}
            onClick={() => navigate({ name: "login" })}
          />
        )}
      </div>
    </aside>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  /** Optional integer to show in a small bubble at the top-right of the icon
   *  (used for the unread messages count). Hidden when 0 or undefined. */
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        sounds.click();
        onClick();
      }}
      onMouseEnter={() => sounds.hover()}
      className={cn(
        "group relative grid size-12 place-items-center rounded-xl transition-colors",
        active ? "text-accent" : "text-fg-muted hover:text-fg-primary",
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl bg-accent/10 ring-1 ring-accent/40 shadow-[0_0_24px_var(--color-accent-soft)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Icon className="relative z-10 size-5" strokeWidth={2} />
      {badge !== undefined && badge > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="absolute -right-1 -top-1 z-20 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-bg-base shadow-[0_0_8px_var(--color-accent-glow)] ring-2 ring-bg-soft"
        >
          {badge > 9 ? "9+" : badge}
        </motion.span>
      )}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-primary opacity-0 shadow-lg ring-1 ring-white/[0.06] transition-opacity group-hover:opacity-100 z-50">
        {label}
      </span>
    </button>
  );
}

function FavoriteButton({
  module,
  active,
  onClick,
}: {
  module: LauncherModule;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        sounds.click();
        onClick();
      }}
      onMouseEnter={() => sounds.hover()}
      className="group relative grid size-12 place-items-center rounded-xl"
      title={module.name}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl ring-2 ring-accent shadow-[0_0_24px_var(--color-accent-glow)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {module.iconUrl ? (
        <img
          src={module.iconUrl}
          alt={module.name}
          className={cn(
            "relative z-10 size-9 rounded-lg object-cover transition-all",
            active ? "ring-1 ring-bg-base" : "ring-1 ring-white/10 group-hover:ring-amber-300/60",
          )}
        />
      ) : (
        <div
          className={cn(
            "relative z-10 grid size-9 place-items-center rounded-lg bg-amber-300/10 font-display text-sm text-amber-300",
            active ? "ring-1 ring-bg-base" : "ring-1 ring-white/10 group-hover:ring-amber-300/60",
          )}
        >
          {module.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <Star className="absolute -right-0.5 -top-0.5 z-10 size-3 fill-amber-300 text-amber-300 drop-shadow-[0_0_4px_rgba(252,211,77,0.6)]" />
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-primary opacity-0 shadow-lg ring-1 ring-white/[0.06] transition-opacity group-hover:opacity-100 z-50">
        {module.name}
      </span>
    </button>
  );
}

function AvatarButton({
  photoURL,
  displayName,
  active,
  onClick,
}: {
  photoURL: string | null;
  displayName: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        sounds.click();
        onClick();
      }}
      onMouseEnter={() => sounds.hover()}
      className="group relative grid size-12 place-items-center rounded-xl"
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl ring-2 ring-accent shadow-[0_0_24px_var(--color-accent-glow)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {photoURL ? (
        <img
          src={photoURL}
          alt={displayName}
          className={cn(
            "relative z-10 size-9 rounded-lg object-cover transition-all",
            active ? "ring-1 ring-bg-base" : "ring-1 ring-white/10 group-hover:ring-accent/50",
          )}
        />
      ) : (
        <div
          className={cn(
            "relative z-10 grid size-9 place-items-center rounded-lg bg-accent/15 font-display text-sm text-accent",
            active ? "ring-1 ring-bg-base" : "ring-1 ring-white/10 group-hover:ring-accent/50",
          )}
        >
          {displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-primary opacity-0 shadow-lg ring-1 ring-white/[0.06] transition-opacity group-hover:opacity-100 z-50">
        {displayName}
      </span>
    </button>
  );
}
