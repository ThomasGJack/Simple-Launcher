import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Edit3,
  Flame,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  LogOut,
  MessageCircle,
  Pin,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { statusFromLastSeen, type UserPresence, type UserPrivacy, type PresenceStatus } from "@/firebase/presence";
import { formatPlaytime } from "@/firebase/playtime";
import {
  useUsers,
  useModules,
  usePlaytime,
  useAchievements,
} from "@/store/firebaseStores";
import { sendGameInvitation } from "@/firebase/invitations";
import { saveProfileCustomization, uploadProfileBanner } from "@/firebase/userProfile";
import { PlayHeatmap } from "@/components/profile/PlayHeatmap";
import {
  PROFILE_THEME_LIST,
  profileThemeStyle,
  type ProfileThemeId,
} from "@/lib/profileThemes";
import { signOut } from "@/firebase/auth";
import { ACHIEVEMENTS, TIER_STYLES, TIER_WEIGHT } from "@/lib/achievements";
import {
  computeRarity,
  watchAchievementStats,
  type AchievementStats,
} from "@/firebase/achievementStats";
import { TierAvatar } from "@/components/tier/TierAvatar";
import { TierName } from "@/components/tier/TierName";
import { conversationIdFor } from "@/types/messaging";
import { ensureConversation } from "@/firebase/messaging";
import { sounds } from "@/lib/sounds";
import { logger } from "@/lib/logger";
import type { LauncherModule } from "@/types/module";
import { cn } from "@/lib/cn";

/**
 * Public-facing profile page — visible to any authenticated launcher user.
 * Shows a peer's avatar, status, top played games, total playtime, and the
 * achievements they've unlocked. Reachable by clicking on a friend's avatar
 * anywhere in the app (Community page, conversation header, etc.).
 *
 * Data sources:
 *  - `/users/{uid}` for the public profile (avatar, name, current activity)
 *  - `/users/{uid}/playtime` for the per-module playtime (read-allowed by
 *    rules for any authed user — public stats by design)
 *  - `/users/{uid}/achievements` for the unlocked badges
 */
export function PublicProfilePage() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const me = useAuthStore((s) => s.user);

  const targetUid = route.name === "user-profile" ? route.uid : null;

  const users = useUsers();
  const modules = useModules();
  const playtime = usePlaytime(targetUid);
  const unlocked = useAchievements(targetUid);

  const profile = useMemo(() => users.find((u) => u.uid === targetUid) ?? null, [users, targetUid]);
  const status = profile ? statusFromLastSeen(profile.lastSeen) : "offline";

  const totalMs = useMemo(() => playtime.reduce((s, p) => s + p.totalMs, 0), [playtime]);
  const totalLaunches = useMemo(
    () => playtime.reduce((s, p) => s + p.totalLaunches, 0),
    [playtime],
  );

  // The "showcase" — pinned modules first if the user customized that,
  // otherwise auto-computed from playtime. Limited to 5 in either case.
  const showcasePlayed = useMemo(() => {
    const playtimeById = new Map(playtime.map((p) => [p.moduleId, p] as const));
    const pinned = profile?.pinnedModuleIds ?? [];
    if (pinned.length > 0) {
      const pinnedRows = pinned
        .map((id) => ({
          entry: playtimeById.get(id) ?? { moduleId: id, totalMs: 0, totalLaunches: 0, lastPlayedAt: null },
          module: modules.find((m) => m.id === id) ?? null,
        }))
        .filter((row) => row.module);
      // If pinned doesn't fill 5, top up with the next most-played non-pinned ones.
      if (pinnedRows.length >= 5) return pinnedRows.slice(0, 5);
      const pinnedIds = new Set(pinned);
      const fillers = [...playtime]
        .filter((p) => !pinnedIds.has(p.moduleId))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, 5 - pinnedRows.length)
        .map((p) => ({
          entry: p,
          module: modules.find((m) => m.id === p.moduleId) ?? null,
        }))
        .filter((row) => row.module);
      return [...pinnedRows, ...fillers];
    }
    return [...playtime]
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 5)
      .map((p) => ({
        entry: p,
        module: modules.find((m) => m.id === p.moduleId) ?? null,
      }))
      .filter((row) => row.module);
  }, [playtime, modules, profile?.pinnedModuleIds]);

  const unlockedById = useMemo(() => new Set(unlocked.map((u) => u.id)), [unlocked]);
  const unlockedAtById = useMemo(
    () => new Map(unlocked.map((u) => [u.id, u.unlockedAt] as const)),
    [unlocked],
  );
  const visibleAchievements = ACHIEVEMENTS.filter((a) => !a.secret || unlockedById.has(a.id));

  // Trophy showcase — pick the user's 6 most prestigious unlocks
  // (platinum first, then by tier weight desc, then by most recent
  // unlock date among ties). Drives the highlight strip above the
  // detailed badge grid further down on the page.
  const trophyShowcase = useMemo(() => {
    const unlockedWithMeta = ACHIEVEMENTS.filter((a) => unlockedById.has(a.id));
    return unlockedWithMeta
      .sort((a, b) => {
        const tierDiff = TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier];
        if (tierDiff !== 0) return tierDiff;
        return (
          (unlockedAtById.get(b.id) ?? 0) - (unlockedAtById.get(a.id) ?? 0)
        );
      })
      .slice(0, 6);
  }, [unlockedById, unlockedAtById]);

  // Live rarity data — read once per public profile view. Used to show
  // "5 % des joueurs l'ont" under each badge in the showcase.
  const [rarityStats, setRarityStats] = useState<AchievementStats>({
    counts: {},
    totalUsers: 0,
  });
  useEffect(() => watchAchievementStats(setRarityStats), []);
  const rarityPercents = useMemo(() => computeRarity(rarityStats), [rarityStats]);

  const isMe = me?.uid === targetUid;
  const [editing, setEditing] = useState(false);

  // Apply the user's chosen profile theme (predefined preset OR custom hex)
  // as scoped CSS vars. The legacy `--color-accent` override is kept for
  // backward compat with components that still read that var directly.
  const themeId = profile?.profileTheme ?? "default";
  const themeStyle = profileThemeStyle(themeId, profile?.accentColor);
  const accentStyle: React.CSSProperties = {
    ...themeStyle,
    ...(profile?.accentColor
      ? ({ ["--color-accent" as string]: profile.accentColor } as React.CSSProperties)
      : {}),
  };

  // Visibility flags driven by the profile owner's privacy settings. Only
  // applies when viewing someone else — your own profile always shows
  // everything to yourself.
  const showActivity = isMe || (profile?.privacy.showActivity ?? true);
  const showPlaytime = isMe || (profile?.privacy.showPlaytime ?? true);
  const allowDirectMessages = isMe || (profile?.privacy.allowDirectMessages ?? true);

  const handleLogout = async () => {
    if (!confirm("Se déconnecter ?")) return;
    sounds.click();
    await signOut();
    navigate({ name: "login" });
  };

  const handleMessage = async () => {
    if (!me || !profile) return;
    sounds.click();
    const cid = conversationIdFor(me.uid, profile.uid);
    navigate({ name: "messages", conversationId: cid });
    try {
      await ensureConversation({
        meUid: me.uid,
        meName: me.displayName ?? "Anonyme",
        meAvatar: me.photoURL ?? null,
        peerUid: profile.uid,
        peerName: profile.displayName ?? profile.username ?? "Anonyme",
        peerAvatar: profile.avatarUrl,
      });
    } catch (err) {
      console.warn("[profile] startConversation failed:", err);
      sounds.error();
    }
  };

  if (!profile) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="rounded-2xl glass p-8 text-center">
          <Users className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
          <p className="text-sm text-fg-muted">Profil introuvable.</p>
          <button
            onClick={() => navigate({ name: "community" })}
            className="mt-4 rounded-xl bg-white/[0.04] px-4 py-2 text-xs text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  const statusMeta: Record<PresenceStatus, { color: string; label: string }> = {
    online: { color: "bg-success ring-success/40 shadow-[0_0_8px_var(--color-success,#4ade80)]", label: "En ligne" },
    idle: { color: "bg-amber-400 ring-amber-400/40", label: "Inactif" },
    offline: { color: "bg-fg-dim ring-fg-dim/40", label: "Hors ligne" },
  };

  return (
    <div className="scroll-y-only relative h-full p-12" style={accentStyle}>
      <button
        onClick={() => navigate(isMe ? { name: "home" } : { name: "community" })}
        className="mb-6 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-fg-muted hover:text-fg-primary transition-colors"
      >
        <ArrowLeft className="size-3.5" /> {isMe ? "Retour à l'accueil" : "Retour à la communauté"}
      </button>

      {/* Hero — banner image + avatar + name + status. Banner only renders
          when the user uploaded one; otherwise we fall back to a tinted
          glass card. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 overflow-hidden rounded-3xl glass-strong"
      >
        {profile.bannerUrl ? (
          <div className="relative h-40 overflow-hidden lg:h-48">
            <img
              src={profile.bannerUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            {/* Bottom fade so the avatar/name plate stays readable */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg-soft/95 to-transparent" />
          </div>
        ) : (
          <div
            className="h-16"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--profile-gradient-from, var(--color-accent)) 22%, transparent) 0%, color-mix(in srgb, var(--profile-gradient-via, var(--color-bg-soft)) 50%, transparent) 50%, color-mix(in srgb, var(--profile-gradient-to, #a855f7) 22%, transparent) 100%)",
            }}
          />
        )}
        <div className="flex items-center gap-5 p-6 pt-3">
        <div className="relative">
          <TierAvatar
            tier={profile.tier}
            src={profile.avatarUrl}
            displayName={profile.displayName ?? profile.username ?? "?"}
            size="xl"
          />
          <span
            className={cn(
              "absolute -bottom-1 -right-1 size-5 rounded-full ring-4 ring-bg-soft",
              statusMeta[status].color,
            )}
            title={statusMeta[status].label}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl text-fg-primary">
            <TierName
              tier={profile.tier}
              name={profile.displayName ?? profile.username ?? "Anonyme"}
            />
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {profile.username && profile.username !== profile.displayName && (
              <span className="text-fg-dim">@{profile.username}</span>
            )}
            <span className="text-fg-dim">·</span>
            <span>{statusMeta[status].label}</span>
            {profile.currentActivity && status === "online" && showActivity && (
              <>
                <span className="text-fg-dim">·</span>
                <span className="inline-flex items-center gap-1 text-accent">
                  <Gamepad2 className="size-3" /> Joue à {profile.currentActivity.moduleName}
                </span>
              </>
            )}
          </div>
          {profile.bio && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-muted">{profile.bio}</p>
          )}
        </div>
        {isMe ? (
          <div className="flex items-center gap-2">
            <ShareProfileButton discordId={profile.discordId} />
            <button
              onClick={() => {
                sounds.click();
                setEditing(true);
              }}
              className="no-drag inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] transition-shadow"
            >
              <Edit3 className="size-4" /> Modifier mon profil
            </button>
            <button
              onClick={handleLogout}
              className="no-drag inline-flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger ring-1 ring-danger/30 hover:bg-danger/20 transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="size-4" /> Déconnexion
            </button>
          </div>
        ) : me ? (
          <div className="flex items-center gap-2">
            {allowDirectMessages && (
              <button
                onClick={handleMessage}
                className="no-drag inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] transition-shadow"
              >
                <MessageCircle className="size-4" /> Message
              </button>
            )}
            <InviteToPlayButton
              modules={modules}
              onSend={async (m, note) => {
                if (!profile) return;
                await sendGameInvitation({
                  fromUid: me.uid,
                  fromName: me.displayName ?? "Anonyme",
                  fromAvatar: me.photoURL ?? null,
                  toUid: profile.uid,
                  moduleId: m.id,
                  moduleName: m.name,
                  moduleIconUrl: m.iconUrl ?? null,
                  note: note?.trim() ? note.trim() : undefined,
                });
                sounds.success();
                logger.action("Game invitation sent", {
                  source: "PublicProfilePage",
                  metadata: { toUid: profile.uid, moduleId: m.id },
                });
              }}
            />
          </div>
        ) : null}
      </div>
      </motion.div>

      <div className="grid grid-cols-12 gap-5">
        {/* Stats column */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-12 lg:col-span-4 space-y-3"
        >
          {showPlaytime && (
            <>
              <div className="rounded-2xl glass p-4">
                <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300">
                  <Clock className="size-3" /> Temps de jeu total
                </div>
                <div className="font-display text-3xl tabular-nums text-fg-primary">
                  {totalMs > 0 ? formatPlaytime(totalMs) : "—"}
                </div>
              </div>
              <div className="rounded-2xl glass p-4">
                <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rose-300">
                  <Flame className="size-3" /> Sessions cumulées
                </div>
                <div className="font-display text-3xl tabular-nums text-fg-primary">
                  {totalLaunches}
                </div>
              </div>
            </>
          )}
          <div className="rounded-2xl glass p-4">
            <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan-300">
              <Trophy className="size-3" /> Achievements
            </div>
            <div className="font-display text-3xl tabular-nums text-fg-primary">
              {unlocked.length}
              <span className="text-base text-fg-muted">/{ACHIEVEMENTS.filter((a) => !a.secret).length}</span>
            </div>
          </div>
        </motion.div>

        {/* Top played + achievements */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="col-span-12 lg:col-span-8 space-y-5"
        >
          {showPlaytime && (
          <div className="rounded-2xl glass p-5">
            <h2 className="mb-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
              {profile.pinnedModuleIds.length > 0 ? (
                <><Pin className="size-3" /> Jeux épinglés</>
              ) : (
                <><Trophy className="size-3" /> Top jeux</>
              )}
            </h2>
            {showcasePlayed.length === 0 ? (
              <p className="text-xs text-fg-dim">Aucune session enregistrée pour l'instant.</p>
            ) : (
              <div className="space-y-2">
                {showcasePlayed.map(({ entry, module }, idx) => (
                  module && (
                    <button
                      key={entry.moduleId}
                      onClick={() => navigate({ name: "module", moduleId: entry.moduleId })}
                      className="no-drag flex w-full items-center gap-3 rounded-xl bg-bg-base/30 p-2.5 text-left transition-colors hover:bg-bg-base/60"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 font-display text-sm text-accent">
                        {idx + 1}
                      </span>
                      {module.iconUrl ? (
                        <img src={module.iconUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                      ) : (
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 font-display text-accent">
                          {module.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-fg-primary">{module.name}</div>
                        <div className="text-[10px] text-fg-muted">
                          {formatPlaytime(entry.totalMs)} · {entry.totalLaunches} session{entry.totalLaunches > 1 ? "s" : ""}
                        </div>
                      </div>
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
          )}

          {/* Trophy showcase — the 6 most prestigious unlocked badges
              displayed front-and-center, with rarity %. Hidden if the
              user hasn't unlocked anything yet. */}
          {trophyShowcase.length > 0 && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/[0.08] via-amber-400/[0.04] to-transparent p-5 ring-1 ring-amber-400/20">
              <h2 className="mb-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-amber-300">
                <Trophy className="size-3" /> Vitrine — top {trophyShowcase.length}
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {trophyShowcase.map((ach) => {
                  const tier = TIER_STYLES[ach.tier];
                  const Icon = ach.icon;
                  const rarity =
                    rarityStats.totalUsers > 0
                      ? rarityPercents[ach.id] ?? 0
                      : null;
                  return (
                    <div
                      key={ach.id}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl bg-bg-base/40 p-3.5 ring-1 transition-all",
                        tier.ring,
                        tier.glow,
                      )}
                      title={ach.description}
                    >
                      <div
                        className={cn(
                          "grid size-12 place-items-center rounded-xl ring-1",
                          tier.bg,
                          tier.text,
                          tier.ring,
                        )}
                      >
                        <Icon className="size-6" strokeWidth={2} />
                      </div>
                      <div className="text-center">
                        <div className="text-[11px] font-medium leading-tight text-fg-primary">
                          {ach.title}
                        </div>
                        <div className="mt-0.5 text-[9px] uppercase tracking-wider text-fg-dim">
                          {tier.label}
                        </div>
                        {rarity != null && (
                          <div className="mt-1 text-[9px] text-cyan-300/80">
                            {rarity < 1
                              ? "< 1 %"
                              : `${rarity.toFixed(rarity < 10 ? 1 : 0)} % des joueurs`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl glass p-5">
            <h2 className="mb-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
              <Trophy className="size-3" /> Tous les badges
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {visibleAchievements.map((ach) => {
                const tier = TIER_STYLES[ach.tier];
                const isAchUnlocked = unlockedById.has(ach.id);
                const Icon = ach.icon;
                return (
                  <div
                    key={ach.id}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl bg-bg-base/30 p-3 ring-1 ring-white/[0.04] transition-all",
                      isAchUnlocked ? tier.glow : "opacity-40 grayscale",
                    )}
                    title={isAchUnlocked ? ach.description : "Non débloqué"}
                  >
                    <div
                      className={cn(
                        "grid size-10 place-items-center rounded-xl ring-1",
                        tier.bg,
                        tier.text,
                        tier.ring,
                      )}
                    >
                      <Icon className="size-5" strokeWidth={2} />
                    </div>
                    <div className="text-center">
                      <div className="text-[11px] font-medium leading-tight text-fg-primary">{ach.title}</div>
                      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-fg-dim">{tier.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Play heatmap — when does this user typically play ?
            Visible to everyone with a launcher account. Useful to
            spot good times to ping a friend for a session. */}
        {targetUid && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6"
          >
            <PlayHeatmap
              uid={targetUid}
              title={isMe ? "Quand tu joues" : "Quand iel joue"}
            />
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {editing && profile && isMe && (
          <EditProfileModal
            profile={profile}
            modules={modules}
            onClose={() => setEditing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
//                          EDIT PROFILE MODAL (self)
// ---------------------------------------------------------------------------

/**
 * Modal for editing one's own profile customization. Edits are saved to
 * `/users/{uid}` via `saveProfileCustomization`. Banner uploads go through
 * `uploadProfileBanner` which streams to Firebase Storage and returns the
 * resulting download URL — we then save that URL alongside the rest of
 * the patch.
 */
function EditProfileModal({
  profile,
  modules,
  onClose,
}: {
  profile: UserPresence;
  modules: LauncherModule[];
  onClose: () => void;
}) {
  const [bio, setBio] = useState(profile.bio ?? "");
  const [accentColor, setAccentColor] = useState(profile.accentColor ?? "");
  const [profileTheme, setProfileTheme] = useState<ProfileThemeId>(profile.profileTheme ?? "default");
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl ?? "");
  const [pinned, setPinned] = useState<string[]>(profile.pinnedModuleIds);
  const [privacy, setPrivacy] = useState<UserPrivacy>(profile.privacy);
  const [bannerUploading, setBannerUploading] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePin = (moduleId: string) => {
    setPinned((prev) => {
      if (prev.includes(moduleId)) return prev.filter((id) => id !== moduleId);
      // Cap at 3 pinned modules
      if (prev.length >= 3) return prev;
      return [...prev, moduleId];
    });
  };

  const handleBannerPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBannerUploading(0);
    try {
      const url = await uploadProfileBanner(profile.uid, file, (p) => {
        setBannerUploading(p);
      });
      setBannerUrl(url);
      sounds.success();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      sounds.error();
    } finally {
      setBannerUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveProfileCustomization(profile.uid, {
        bio: bio.trim() ? bio.trim() : null,
        accentColor: accentColor || null,
        profileTheme,
        bannerUrl: bannerUrl || null,
        pinnedModuleIds: pinned,
        privacy,
      });
      sounds.success();
      logger.action("Profile customization saved", {
        source: "EditProfileModal",
        metadata: { hasBanner: !!bannerUrl, accent: accentColor || null, pinnedCount: pinned.length },
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      sounds.error();
    } finally {
      setSaving(false);
    }
  };

  const launchableModules = modules.filter((m) => m.type === "hosted" || m.type === "minecraft");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/70 backdrop-blur-md p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl glass-strong ring-1 ring-accent/30"
      >
        <header className="flex items-center justify-between border-b border-white/[0.04] bg-bg-soft/40 px-5 py-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-accent">
              <Edit3 className="size-3" /> Personnalisation
            </div>
            <h2 className="mt-1 font-display text-2xl text-fg-primary">Mon profil</h2>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Banner */}
          <Section icon={ImageIcon} title="Bannière">
            <div className="relative h-32 overflow-hidden rounded-xl bg-bg-base/40 ring-1 ring-white/[0.04]">
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-xs text-fg-dim">
                  Aucune bannière
                </div>
              )}
              {bannerUploading !== null && (
                <div className="absolute inset-0 grid place-items-center bg-bg-base/70 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs text-accent">
                    <Loader2 className="size-4 animate-spin" /> {bannerUploading.toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label
                htmlFor="banner-upload"
                className="no-drag inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent ring-1 ring-accent/30 hover:bg-accent/20 transition-colors"
              >
                <ImageIcon className="size-3.5" /> Choisir un fichier
              </label>
              <input
                id="banner-upload"
                type="file"
                accept="image/*"
                onChange={(e) => handleBannerPick(e.target.files?.[0])}
                className="hidden"
              />
              {bannerUrl && (
                <button
                  type="button"
                  onClick={() => setBannerUrl("")}
                  className="no-drag inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-danger/10 hover:text-danger"
                >
                  <X className="size-3" /> Retirer
                </button>
              )}
              <span className="text-[10px] text-fg-dim">Recommandé : 1500×400, ratio 16:5</span>
            </div>
          </Section>

          {/* Bio */}
          <Section icon={Edit3} title="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Présente-toi en 1-2 phrases…"
              className="no-drag w-full resize-none rounded-xl bg-bg-base/40 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
            />
            <div className="mt-1 text-right text-[10px] text-fg-dim">{bio.length}/300</div>
          </Section>

          {/* Profile theme presets */}
          <Section icon={Sparkles} title="Thème de profil">
            <p className="mb-3 text-xs text-fg-muted">
              Choisis une ambiance de couleurs pour ton profil. Tes potes verront tout de suite ta touche perso.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PROFILE_THEME_LIST.map((t) => {
                const active = profileTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setProfileTheme(t.id)}
                    title={t.label}
                    className={
                      "no-drag relative h-16 overflow-hidden rounded-xl ring-1 transition-all " +
                      (active
                        ? "ring-2 ring-accent shadow-[0_0_18px_var(--color-accent-soft)]"
                        : "ring-white/10 hover:ring-white/30")
                    }
                    style={{
                      background: `linear-gradient(135deg, ${t.gradientFrom} 0%, ${t.gradientVia} 50%, ${t.gradientTo} 100%)`,
                    }}
                  >
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-bg-base/80 px-1.5 py-1 text-center text-[10px] font-medium text-fg-primary backdrop-blur-sm">
                      {t.label}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setProfileTheme("custom")}
                className={
                  "no-drag relative flex h-16 items-center justify-center rounded-xl bg-bg-base/40 ring-1 transition-all " +
                  (profileTheme === "custom"
                    ? "ring-2 ring-accent shadow-[0_0_18px_var(--color-accent-soft)]"
                    : "ring-white/10 hover:ring-white/30")
                }
              >
                <span className="text-[10px] uppercase tracking-wider text-fg-muted">Custom</span>
              </button>
            </div>
            {profileTheme === "custom" && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor || "#00d4ff"}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="size-10 cursor-pointer rounded-lg border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#00d4ff"
                  className="no-drag flex-1 rounded-xl bg-bg-base/40 px-3 py-2 font-mono text-xs text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
                />
              </div>
            )}
          </Section>

          {/* Pinned games */}
          <Section icon={Pin} title={`Jeux épinglés (${pinned.length}/3)`}>
            <p className="mb-2 text-xs text-fg-muted">
              Mets en avant jusqu'à 3 jeux sur ton profil — sinon le top est calculé depuis ton temps de jeu.
            </p>
            <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {launchableModules.length === 0 ? (
                <div className="col-span-full text-xs text-fg-dim">Pas de jeu disponible.</div>
              ) : (
                launchableModules.map((m) => {
                  const isPinned = pinned.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => togglePin(m.id)}
                      disabled={!isPinned && pinned.length >= 3}
                      className={cn(
                        "no-drag flex items-center gap-2 rounded-xl bg-bg-base/30 p-2 text-left transition-all",
                        isPinned
                          ? "ring-1 ring-accent/40 shadow-[0_0_12px_var(--color-accent-soft)]"
                          : "ring-1 ring-white/[0.04] hover:bg-bg-base/60",
                        !isPinned && pinned.length >= 3 && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {m.iconUrl ? (
                        <img src={m.iconUrl} alt="" className="size-7 shrink-0 rounded-md object-cover ring-1 ring-white/10" />
                      ) : (
                        <div className="grid size-7 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                          <Gamepad2 className="size-3" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-primary">{m.name}</span>
                      {isPinned && <Pin className="size-3 shrink-0 fill-accent text-accent" />}
                    </button>
                  );
                })
              )}
            </div>
          </Section>

          {/* Privacy */}
          <Section icon={Users} title="Confidentialité">
            <PrivacyToggle
              label="Afficher mon activité (joue à X)"
              checked={privacy.showActivity}
              onChange={(v) => setPrivacy((p) => ({ ...p, showActivity: v }))}
            />
            <PrivacyToggle
              label="Afficher mes stats de temps de jeu"
              checked={privacy.showPlaytime}
              onChange={(v) => setPrivacy((p) => ({ ...p, showPlaytime: v }))}
            />
            <PrivacyToggle
              label="Autoriser les messages directs"
              checked={privacy.allowDirectMessages}
              onChange={(v) => setPrivacy((p) => ({ ...p, allowDirectMessages: v }))}
            />
          </Section>

          {error && (
            <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-500/30">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-white/[0.04] bg-bg-soft/40 px-5 py-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="no-drag flex-1 rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || bannerUploading !== null}
            className={cn(
              "no-drag flex-[1.4] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-shadow",
              saving || bannerUploading !== null
                ? "bg-white/[0.04] text-fg-dim cursor-not-allowed"
                : "bg-accent text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]",
            )}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Edit3;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-accent">
        <Icon className="size-3" /> {title}
      </div>
      {children}
    </div>
  );
}

function PrivacyToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-bg-base/30 p-3 ring-1 ring-white/[0.04] transition-colors hover:bg-bg-base/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer accent-cyan-400"
      />
      <span className="flex-1 text-xs text-fg-primary">{label}</span>
    </label>
  );
}

/**
 * "Inviter à jouer" button that pops a tiny picker showing the user's
 * available modules (filtered to those launchable: hosted + minecraft).
 * Sends a Firestore invitation that the recipient sees as a popup card.
 */
function InviteToPlayButton({
  modules,
  onSend,
}: {
  modules: LauncherModule[];
  onSend: (module: LauncherModule, note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<LauncherModule | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const playable = modules.filter((m) => m.type === "hosted" || m.type === "minecraft");

  const handleSubmit = async () => {
    if (!picked) return;
    setSending(true);
    try {
      await onSend(picked, note);
      setOpen(false);
      setPicked(null);
      setNote("");
    } catch (err) {
      console.warn("[invite] send failed:", err);
      sounds.error();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          sounds.click();
          setOpen(true);
        }}
        className="no-drag inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
      >
        <Sparkles className="size-4" /> Inviter à jouer
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-bg-base/70 backdrop-blur-md p-6"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl glass-strong p-6"
          >
            <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-accent">
              <Sparkles className="size-3" /> Inviter à jouer
            </div>
            <h2 className="font-display text-2xl text-fg-primary">Quel jeu ?</h2>
            <p className="mt-1 text-xs text-fg-muted">
              Choisis un jeu de ta bibliothèque — l'invitation expire dans 30 min.
            </p>

            <div className="mt-4 max-h-60 space-y-1.5 overflow-y-auto">
              {playable.length === 0 ? (
                <div className="rounded-xl bg-bg-base/40 p-4 text-center text-xs text-fg-muted">
                  Aucun jeu invitable pour l'instant.
                </div>
              ) : (
                playable.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      sounds.click();
                      setPicked(m);
                    }}
                    className={cn(
                      "no-drag flex w-full items-center gap-3 rounded-xl bg-bg-base/30 p-2.5 text-left transition-colors hover:bg-bg-base/60",
                      picked?.id === m.id && "ring-1 ring-accent/40 bg-accent/10",
                    )}
                  >
                    {m.iconUrl ? (
                      <img src={m.iconUrl} alt="" className="size-9 rounded-lg object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent">
                        <Gamepad2 className="size-4" />
                      </div>
                    )}
                    <span className="truncate text-sm text-fg-primary">{m.name}</span>
                  </button>
                ))
              )}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="Petit mot ? « T'es chaud ce soir ? »"
              className="no-drag mt-4 w-full resize-none rounded-xl bg-bg-base/40 px-3 py-2 text-xs text-fg-primary placeholder:text-fg-dim ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
              rows={2}
            />

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="no-drag flex-1 rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={!picked || sending}
                className={cn(
                  "no-drag flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                  picked && !sending
                    ? "bg-accent text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]"
                    : "bg-white/[0.04] text-fg-dim cursor-not-allowed",
                )}
              >
                {sending ? "Envoi…" : "Envoyer l'invitation"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
//                           SHARE PROFILE BUTTON
// ---------------------------------------------------------------------------

/**
 * Copies the public web profile URL (simplelaunche.web.app/u/{discordId})
 * to the clipboard. Falls back gracefully when clipboard API is denied or
 * the discordId is missing.
 */
function ShareProfileButton({ discordId }: { discordId: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!discordId) return null;
  const url = `https://simplelaunche.web.app/u/${discordId}`;

  const handle = async () => {
    sounds.click();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      sounds.success();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[share] clipboard failed:", err);
      // Fallback: select the text in a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* give up */
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <button
      onClick={handle}
      title={url}
      className="no-drag inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.08] transition-colors"
    >
      {copied ? (
        <>
          <CheckIcon className="size-4 text-emerald-400" />
          Lien copié !
        </>
      ) : (
        <>
          <ShareIcon className="size-4" />
          Partager mon profil
        </>
      )}
    </button>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
