import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Library, Settings, LogIn, Shield, Users, Star, MessageCircle, CalendarDays, Castle, Crown } from "lucide-react";
import { useUIStore, type Route } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useFavoritesStore } from "@/store/favorites";
import { isAdmin } from "@/lib/admin";
import { sounds } from "@/lib/sounds";
import { useModules, useConversations } from "@/store/firebaseStores";
import { watchUserShortcuts } from "@/firebase/shortcuts";
import { unreadCount, otherParticipant, type Conversation } from "@/types/messaging";
import { notify } from "@/lib/notifications";
import type { LauncherModule } from "@/types/module";
import { cn } from "@/lib/cn";

export function Sidebar() {
  const { route, navigate } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const favoriteIds = useFavoritesStore((s) => s.favorites);
  const hosted = useModules();
  const [shortcuts, setShortcuts] = useState<LauncherModule[]>([]);
  const conversations = useConversations(user?.uid);
  // Tracks the last-seen state of each conversation to detect new arrivals.
  // Map: conversationId → lastMessage.sentAt of the last message we observed.
  // When a new message lands AND it's from someone else AND we're not on the
  // messages page, we play the receive chime.
  const lastSeenMsgRef = useRef<Map<string, number>>(new Map());
  // Track the latest route in a ref so the chime side-effect can read it
  // without re-subscribing every navigation. Previously `route.name` was a
  // useEffect dep which caused the conversations watcher to be torn down +
  // re-built on every navigation — wasteful network round-trip.
  const routeNameRef = useRef(route.name);
  useEffect(() => {
    routeNameRef.current = route.name;
  }, [route.name]);

  useEffect(() => {
    if (!user) {
      setShortcuts([]);
      return;
    }
    return watchUserShortcuts(user.uid, setShortcuts);
  }, [user]);

  // Side-effect: chime + native notification on new incoming messages.
  // Reacts to the conversations array (now sourced from the centralised
  // store) by diffing against `lastSeenMsgRef`. We deliberately don't read
  // `route.name` from props here — it would re-fire on every navigation.
  // Instead, we read it through `routeNameRef` so the effect only runs
  // when the *conversations* themselves change.
  useEffect(() => {
    if (!user) {
      lastSeenMsgRef.current.clear();
      return;
    }
    const seen = lastSeenMsgRef.current;
    const isFirstSnapshot = seen.size === 0;
    let shouldChime = false;
    for (const c of conversations) {
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
    const onMessagesPage = routeNameRef.current === "messages";
    if (shouldChime && !onMessagesPage) {
      sounds.messageReceived();
      const newest = conversations.find(
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
  }, [conversations, user]);

  const totalUnread = useMemo(() => {
    if (!user) return 0;
    return conversations.reduce((sum: number, c: Conversation) => sum + unreadCount(c, user.uid), 0);
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
        {/* Logo doubles as the "Accueil" button — clicking it navigates
            home. We share the `sidebar-active` layoutId with NavButton so
            the accent ring smoothly transitions in/out as the user moves
            between home and other routes. */}
        <LogoButton
          active={isActive({ name: "home" })}
          onClick={() => navigate({ name: "home" })}
        />

        <div className="my-2 h-px w-8 bg-white/[0.06]" />

        <nav className="flex flex-col items-center gap-2">
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
            icon={CalendarDays}
            label="Sessions"
            active={isActive({ name: "sessions" })}
            onClick={() => navigate({ name: "sessions" })}
          />
          <NavButton
            icon={Castle}
            label="Clans"
            active={isActive({ name: "crews" })}
            onClick={() => navigate({ name: "crews" })}
          />
          <NavButton
            icon={MessageCircle}
            label="Messages"
            active={isActive({ name: "messages" })}
            badge={totalUnread}
            onClick={() => navigate({ name: "messages" })}
          />
          <NavButton
            icon={Crown}
            label="VIP"
            active={isActive({ name: "vip" })}
            goldNeon
            onClick={() => navigate({ name: "vip" })}
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
          <NavButton
            icon={Shield}
            label="Admin"
            active={isActive({ name: "admin" })}
            onClick={() => navigate({ name: "admin" })}
          />
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

// React.memo guard: NavButton renders 6+ times per Sidebar render, but
// its inputs (label/icon/active/badge) only change when navigation or
// the unread count changes. Without memo, all buttons re-render every
// time the parent ticks (e.g. on any sidebar state update). With memo,
// only the affected button is reconciled.
const NavButton = memo(function NavButton({
  icon: Icon,
  label,
  active,
  badge,
  goldNeon,
  onClick,
}: {
  icon: typeof Library;
  label: string;
  active?: boolean;
  /** Optional integer to show in a small bubble at the top-right of the icon
   *  (used for the unread messages count). Hidden when 0 or undefined. */
  badge?: number;
  /** When true, paints the icon in gold and pulses a soft amber halo
   *  behind it. Used by the VIP entry so it visually pops above the
   *  uniformly-monochrome rest of the sidebar — supporters tier shouldn't
   *  feel like just another nav option. */
  goldNeon?: boolean;
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
        goldNeon
          ? "text-amber-300"
          : active
            ? "text-accent"
            : "text-fg-muted hover:text-fg-primary",
      )}
    >
      {/* Gold treatment for the VIP entry — multi-layered to actually
          grab the eye:
          (1) wide outer glow that pulses
          (2) inner halo with inset glow
          (3) thin rotating ring
          (4) three orbiting sparkles
          (5) the icon itself wobbles + scales gently
          Together they read as "premium / clickable / alive" without
          overwhelming the rest of the sidebar. */}
      {goldNeon && (
        <>
          {/* (1) Wide pulsing aura — extends slightly beyond the button bounds */}
          <motion.span
            aria-hidden
            className="absolute -inset-1.5 rounded-2xl blur-md"
            style={{
              background:
                "radial-gradient(circle, rgba(255,215,0,0.55) 0%, rgba(255,107,53,0.35) 40%, transparent 75%)",
            }}
            animate={{ opacity: [0.4, 0.95, 0.4], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* (2) Inner halo with inset/outer shadow */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-xl"
            style={{
              background:
                "radial-gradient(circle, rgba(255,215,0,0.4) 0%, rgba(255,107,53,0.18) 50%, transparent 75%)",
              boxShadow:
                "inset 0 0 14px rgba(255,215,0,0.5), 0 0 18px rgba(255,215,0,0.5)",
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* (3) Slowly rotating thin gold ring */}
          <motion.span
            aria-hidden
            className="absolute inset-[-2px] rounded-xl"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(255,215,0,0.85) 90deg, transparent 180deg, rgba(255,107,53,0.7) 270deg, transparent 360deg)",
              WebkitMask:
                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              padding: 1,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
          {/* (4) Three sparkles orbiting around the icon */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute left-1/2 top-1/2 z-20 size-1.5 rounded-full bg-amber-200"
              style={{
                marginLeft: -3,
                marginTop: -3,
                boxShadow:
                  "0 0 8px rgba(255,215,0,1), 0 0 14px rgba(255,107,53,0.7)",
              }}
              animate={{
                rotate: 360,
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                rotate: {
                  duration: 3.2,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * (3.2 / 3),
                },
                opacity: {
                  duration: 3.2,
                  repeat: Infinity,
                  times: [0, 0.15, 0.85, 1],
                  delay: i * (3.2 / 3),
                },
              }}
            >
              <span
                className="block size-1.5 rounded-full bg-amber-200"
                style={{ transform: "translate(20px, 0)" }}
              />
            </motion.span>
          ))}
        </>
      )}
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className={cn(
            "absolute inset-0 rounded-xl ring-1",
            goldNeon
              ? "bg-amber-300/20 ring-amber-300/70 shadow-[0_0_32px_rgba(255,215,0,0.7)]"
              : "bg-accent/10 ring-accent/40 shadow-[0_0_24px_var(--color-accent-soft)]",
          )}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {goldNeon ? (
        <motion.span
          className="relative z-10"
          animate={{
            rotate: [-6, 6, -6],
            scale: [1, 1.12, 1],
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon
            className="size-5 drop-shadow-[0_0_10px_rgba(255,215,0,1)] [filter:drop-shadow(0_0_5px_rgba(255,107,53,0.85))]"
            strokeWidth={2.4}
          />
        </motion.span>
      ) : (
        <Icon className="relative z-10 size-5" strokeWidth={2} />
      )}
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
});

/**
 * The launcher logo at the very top of the sidebar — also acts as the
 * "Accueil" button. Visually richer than a plain `NavButton` (the logo
 * artwork is the centerpiece) but still participates in the
 * `sidebar-active` layoutId animation when home is the current route.
 */
function LogoButton({
  active,
  onClick,
}: {
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
      className="group relative grid size-12 place-items-center overflow-hidden rounded-xl transition-transform hover:scale-105"
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 z-10 rounded-xl ring-2 ring-accent shadow-[0_0_24px_var(--color-accent-glow)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <img src="/logo.png" alt="Simple Launcher" className="size-12 object-cover" />
      {!active && (
        <div className="absolute inset-0 rounded-xl ring-1 ring-accent/30 group-hover:ring-accent/60 group-hover:shadow-[0_0_24px_var(--color-accent-glow)]" />
      )}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-primary opacity-0 shadow-lg ring-1 ring-white/[0.06] transition-opacity group-hover:opacity-100 z-50">
        Accueil
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
