import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, Copy, Check, Gamepad2, ExternalLink, MessageCircle } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { statusFromLastSeen, type UserPresence, type PresenceStatus } from "@/firebase/presence";
import { useUsers } from "@/store/firebaseStores";
import { ensureConversation } from "@/firebase/messaging";
import { conversationIdFor } from "@/types/messaging";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import { TierBannerOverlay } from "@/components/tier/TierBanner";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const INVITE_URL = "https://simplelaunche.web.app";
const INVITE_MESSAGE = `Salut ! Télécharge Simple Launcher pour qu'on joue ensemble : ${INVITE_URL}\n\nTu te connectes avec Discord, et on se voit en ligne dans le launcher 🎮`;

export function CommunityPage() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const users = useUsers();
  const [, setNow] = useState(Date.now());

  // Re-evaluate status periodically (lastSeen comparison is time-sensitive)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(() => {
    const order: Record<PresenceStatus, number> = { online: 0, idle: 1, offline: 2 };
    return [...users]
      .filter((u) => u.uid !== me?.uid)
      .map((u) => ({ user: u, status: statusFromLastSeen(u.lastSeen) }))
      .sort((a, b) => {
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return (b.user.lastSeen ?? 0) - (a.user.lastSeen ?? 0);
      });
  }, [users, me]);

  const onlineCount = sorted.filter((s) => s.status === "online").length;

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
          <Users className="size-3" /> Communauté
        </p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">
          {onlineCount} {onlineCount > 1 ? "amis en ligne" : "ami en ligne"}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Tous les Discord connectés à Simple Launcher. {sorted.length} compte{sorted.length !== 1 ? "s" : ""} au total.
        </p>
      </motion.div>

      <div className="grid grid-cols-12 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-12 lg:col-span-7"
        >
          {sorted.length === 0 ? (
            <div className="rounded-3xl glass p-10 text-center">
              <Users className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
              <p className="text-sm text-fg-muted">
                Pour l'instant t'es tout seul sur Simple Launcher. Invite tes potes Discord à droite →
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(({ user, status }) => (
                <UserRow
                  key={user.uid}
                  user={user}
                  status={status}
                  onClickActivity={() =>
                    user.currentActivity && navigate({ name: "module", moduleId: user.currentActivity.moduleId })
                  }
                  onClickMessage={() =>
                    me &&
                    startConversationWith(
                      { uid: me.uid, displayName: me.displayName, photoURL: me.photoURL },
                      user,
                      navigate,
                    )
                  }
                />
              ))}
            </div>
          )}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-12 lg:col-span-5"
        >
          <InviteCard />
          <DiscordNote />
        </motion.aside>
      </div>
    </div>
  );
}

/**
 * Creates the deterministic conversation document for the current user + the
 * target peer (idempotent: a no-op if it already exists), then routes the
 * UI to the messages page with that conversation pre-selected. Both users
 * land on the same Firestore doc the first time either one DMs.
 */
async function startConversationWith(
  me: { uid: string; displayName: string | null; photoURL: string | null },
  peer: UserPresence,
  navigate: (route: { name: "messages"; conversationId: string }) => void,
) {
  sounds.click();
  const cid = conversationIdFor(me.uid, peer.uid);
  // Navigate optimistically — the page works even if ensureConversation
  // hasn't completed yet (the live listener will pick it up).
  navigate({ name: "messages", conversationId: cid });
  try {
    await ensureConversation({
      meUid: me.uid,
      meName: me.displayName ?? "Anonyme",
      meAvatar: me.photoURL ?? null,
      peerUid: peer.uid,
      peerName: peer.displayName ?? peer.username ?? "Anonyme",
      peerAvatar: peer.avatarUrl,
    });
  } catch (err) {
    console.warn("[community] startConversation failed:", err);
    sounds.error();
  }
}

function UserRow({
  user,
  status,
  onClickActivity,
  onClickMessage,
}: {
  user: UserPresence;
  status: PresenceStatus;
  onClickActivity: () => void;
  onClickMessage: () => void;
}) {
  const statusMeta: Record<PresenceStatus, { color: string; label: string }> = {
    online: { color: "bg-success ring-success/40 shadow-[0_0_8px_var(--color-success,#4ade80)]", label: "En ligne" },
    idle: { color: "bg-amber-400 ring-amber-400/40", label: "Inactif" },
    offline: { color: "bg-fg-dim ring-fg-dim/40", label: "Hors ligne" },
  };
  const meta = statusMeta[status];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 2 }}
      className="relative flex items-center gap-4 rounded-2xl glass p-4"
    >
      <TierBannerOverlay tier={user.tier} rounded="2xl" />
      <button
        onClick={() => useUIStore.getState().navigate({ name: "user-profile", uid: user.uid })}
        className="no-drag relative shrink-0 transition-transform hover:scale-105"
        title={`Voir le profil de ${user.displayName ?? user.username ?? "ce pote"}`}
      >
        <TierAvatar
          tier={user.tier}
          src={user.avatarUrl}
          displayName={user.displayName ?? user.username ?? "?"}
          size="md"
        />
        <span
          className={cn(
            "absolute -left-0.5 -top-0.5 size-3.5 rounded-full ring-2 ring-bg-soft",
            meta.color,
          )}
          title={meta.label}
        />
      </button>

      <button
        onClick={() => useUIStore.getState().navigate({ name: "user-profile", uid: user.uid })}
        className="no-drag min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <TierName
            tier={user.tier}
            name={user.displayName ?? user.username ?? "Anonyme"}
            className="truncate font-medium text-fg-primary transition-colors hover:text-accent"
          />
          {user.username && user.username !== user.displayName && (
            <span className="text-xs text-fg-dim">@{user.username}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
          {user.currentActivity && status === "online" ? (
            // Use a span (not a nested button) — the parent text container is
            // already a button that navigates to the profile, and we stop
            // propagation here so a click on the activity opens the module
            // instead of bubbling up to the profile-navigation handler.
            <span
              role="link"
              onClick={(e) => {
                e.stopPropagation();
                onClickActivity();
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-accent transition-colors hover:text-fg-primary"
            >
              <Gamepad2 className="size-3" /> Joue à {user.currentActivity.moduleName}
            </span>
          ) : (
            <span>{meta.label}</span>
          )}
        </div>
      </button>

      <button
        onClick={onClickMessage}
        onMouseEnter={() => sounds.hover()}
        className="no-drag inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent/[0.08] px-3 py-2 text-xs font-medium text-accent ring-1 ring-accent/20 transition-all hover:bg-accent/[0.15] hover:shadow-[0_0_16px_var(--color-accent-soft)]"
        title={`Envoyer un message à ${user.displayName ?? user.username ?? "ce pote"}`}
      >
        <MessageCircle className="size-3.5" />
        Message
      </button>
    </motion.div>
  );
}

function InviteCard() {
  const [copied, setCopied] = useState(false);

  const copy = async (what: "link" | "message") => {
    const text = what === "link" ? INVITE_URL : INVITE_MESSAGE;
    try {
      await navigator.clipboard.writeText(text);
      sounds.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      sounds.error();
    }
  };

  return (
    <div className="rounded-3xl glass-strong p-6">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
        <ExternalLink className="size-3" /> Inviter
      </div>
      <h3 className="font-display text-2xl text-fg-primary">Invite tes potes</h3>
      <p className="mt-1 text-sm text-fg-muted">
        Partage le lien dans un DM Discord. Une fois qu'ils ont créé un compte, ils apparaissent ici.
      </p>

      <div className="mt-5 rounded-xl bg-bg-base/50 p-3 ring-1 ring-white/[0.06]">
        <p className="whitespace-pre-line text-xs text-fg-muted">{INVITE_MESSAGE}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => copy("message")}
          className="no-drag inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_28px_var(--color-accent-glow)]"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copié !" : "Copier le message"}
        </button>
        <button
          onClick={() => copy("link")}
          className="no-drag inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-fg-primary ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
        >
          <Copy className="size-4" />
          Lien seul
        </button>
      </div>
    </div>
  );
}

function DiscordNote() {
  return (
    <div className="mt-4 rounded-2xl glass p-5 text-xs text-fg-muted">
      <p>
        <strong className="text-fg-primary">Pourquoi pas la liste d'amis Discord directement ?</strong>
      </p>
      <p className="mt-2 leading-relaxed">
        Discord ne donne plus accès à la liste d'amis via OAuth (depuis 2022, raisons de privacy). Comme tout le monde sur Simple Launcher passe par Discord pour s'authentifier, la liste ci-dessus = ton cercle Discord effectif sur le launcher.
      </p>
    </div>
  );
}
