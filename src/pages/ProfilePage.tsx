import { useState } from "react";
import { motion } from "framer-motion";
import { LogOut, Calendar, Mail, Hash, Gamepad2, Clock, Rocket, Trophy, Sigma, Flame, ChevronDown, ChevronUp, Share2 } from "lucide-react";
import { ShareProfileModal } from "@/components/profile/ShareProfileModal";
import { sounds } from "@/lib/sounds";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { signOut } from "@/firebase/auth";
import { formatPlaytime } from "@/firebase/playtime";
import { useAchievements, useModules, usePlaytime } from "@/store/firebaseStores";
import { ACHIEVEMENTS } from "@/lib/achievements";

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const playtime = usePlaytime(user?.uid);
  const unlockedAchievements = useAchievements(user?.uid);
  const modules = useModules();
  const [showAllModules, setShowAllModules] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (!user) return null;

  const discordId = user.uid.startsWith("discord_") ? user.uid.replace("discord_", "") : null;
  const created = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;

  const totalMs = playtime.reduce((sum, p) => sum + p.totalMs, 0);
  const totalLaunches = playtime.reduce((sum, p) => sum + p.totalLaunches, 0);
  const moduleById = new Map(modules.map((m) => [m.id, m] as const));
  const sortedPlaytime = [...playtime].sort((a, b) => b.totalMs - a.totalMs);
  const topPlaytime = showAllModules ? sortedPlaytime : sortedPlaytime.slice(0, 5);

  // Average session length — totalMs divided by totalLaunches across all
  // modules. Falls back to 0 when there are no launches yet (avoids /0).
  const avgSessionMs = totalLaunches > 0 ? Math.round(totalMs / totalLaunches) : 0;

  // Earliest cross-module launch — proxy for "joined gaming crew" date.
  // `lastPlayedAt` is per-module; the min across modules gives the date
  // of the FIRST per-module session ever, which is close enough to "first
  // launch" without us having to track a separate timestamp.
  const firstLaunchMs = playtime
    .map((p) => p.lastPlayedAt)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .reduce<number | null>((min, v) => (min === null || v < min ? v : min), null);

  // Next milestone progress — shows progress bar toward the next playtime
  // achievement (1h, 10h, 100h). When all three are unlocked, hides the bar.
  const milestones = [
    { label: "1 heure de jeu", thresholdMs: 60 * 60 * 1000 },
    { label: "10 heures de jeu", thresholdMs: 10 * 60 * 60 * 1000 },
    { label: "100 heures de jeu", thresholdMs: 100 * 60 * 60 * 1000 },
  ];
  const nextMilestone = milestones.find((m) => totalMs < m.thresholdMs) ?? null;
  const milestoneProgress = nextMilestone
    ? Math.min(100, (totalMs / nextMilestone.thresholdMs) * 100)
    : 100;

  // Achievements unlocked count (excludes the secret platinum entry from
  // the denominator since it's a meta-achievement). Using set lookup so
  // this stays O(N).
  const unlockedSet = new Set(unlockedAchievements.map((a) => a.id));
  const unlockableTotal = ACHIEVEMENTS.filter((a) => !a.secret).length;
  const unlockedCount = ACHIEVEMENTS.filter((a) => !a.secret && unlockedSet.has(a.id)).length;

  const handleLogout = async () => {
    await signOut();
    navigate({ name: "login" });
  };

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Profil</p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Mon compte</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-2xl rounded-3xl glass-strong p-8"
      >
        <div className="flex items-center gap-6">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName ?? "Avatar"}
              className="size-24 rounded-2xl ring-2 ring-accent/40 shadow-[0_0_32px_var(--color-accent-soft)]"
            />
          ) : (
            <div className="grid size-24 place-items-center rounded-2xl bg-accent/15 font-display text-3xl text-accent ring-2 ring-accent/40">
              {(user.displayName ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="font-display text-3xl text-fg-primary">{user.displayName ?? "Utilisateur"}</div>
            <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#5865F2]/15 px-3 py-1 text-xs font-medium text-[#A5B4FC] ring-1 ring-[#5865F2]/30">
              <span className="size-1.5 rounded-full bg-[#5865F2]" />
              Connecté via Discord
            </div>
          </div>
          {discordId && (
            <button
              type="button"
              onClick={() => {
                sounds.click();
                setShareOpen(true);
              }}
              className="no-drag inline-flex items-center gap-1.5 self-start rounded-xl bg-accent/10 px-3 py-2 text-xs font-medium text-accent ring-1 ring-accent/30 transition-all hover:bg-accent/20 hover:shadow-[0_0_18px_var(--color-accent-soft)]"
              title="Lien public + QR code de mon profil"
            >
              <Share2 className="size-3.5" />
              Partager
            </button>
          )}
        </div>

        <div className="mt-8 grid gap-3">
          {user.email && <InfoRow icon={Mail} label="Email" value={user.email} />}
          {discordId && <InfoRow icon={Hash} label="Discord ID" value={discordId} mono />}
          {created && (
            <InfoRow
              icon={Calendar}
              label="Premier login"
              value={created.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            />
          )}
        </div>

        <div className="mt-8 border-t border-white/[0.06] pt-6">
          <button
            onClick={handleLogout}
            className="no-drag inline-flex items-center gap-2 rounded-xl bg-danger/10 px-5 py-2.5 text-sm font-medium text-danger ring-1 ring-danger/30 transition-all hover:bg-danger/20 hover:ring-danger/50"
          >
            <LogOut className="size-4" />
            Se déconnecter
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 max-w-2xl rounded-3xl glass p-7"
      >
        <div className="mb-5 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
          <Clock className="size-3" /> Mes statistiques
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <StatBox icon={Clock} label="Temps total" value={formatPlaytime(totalMs)} />
          <StatBox icon={Rocket} label="Lancements" value={String(totalLaunches)} />
          <StatBox
            icon={Sigma}
            label="Session moyenne"
            value={avgSessionMs > 0 ? formatPlaytime(avgSessionMs) : "—"}
          />
          <button
            type="button"
            onClick={() => {
              sounds.click();
              navigate({ name: "achievements" });
            }}
            className="no-drag group relative overflow-hidden rounded-xl bg-amber-400/[0.06] p-4 text-left ring-1 ring-amber-400/20 transition hover:bg-amber-400/[0.1] hover:ring-amber-400/40 hover:shadow-[0_0_24px_rgba(252,211,77,0.3)]"
          >
            <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300">
              <Trophy className="size-3" /> Achievements
            </div>
            <div className="font-display text-3xl tabular-nums text-fg-primary">
              {unlockedCount}
              <span className="text-base text-fg-muted">/{unlockableTotal}</span>
            </div>
            <div className="mt-1 text-[11px] text-amber-200/80 opacity-0 transition-opacity group-hover:opacity-100">
              Voir tous mes succès →
            </div>
          </button>
        </div>

        {/* Next-milestone progress bar — caps at 100h (mostly unreachable
            for casual users, gives a long-term goal). Hidden once all
            three playtime milestones are unlocked. */}
        {nextMilestone && totalLaunches > 0 && (
          <div className="mb-6 rounded-xl border border-accent/20 bg-accent/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-accent">
                <Flame className="size-3.5" /> Prochain cap
              </span>
              <span className="font-mono text-fg-muted">
                {formatPlaytime(totalMs)} / {formatPlaytime(nextMilestone.thresholdMs)}
              </span>
            </div>
            <div className="mb-1 text-sm font-medium text-fg-primary">
              {nextMilestone.label}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-accent shadow-[0_0_12px_var(--color-accent-glow)] transition-all"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* First launch chip — shows up after the first session is
            recorded, gives a "you joined the crew on…" feel. */}
        {firstLaunchMs && (
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-fg-muted ring-1 ring-white/[0.06]">
            <Calendar className="size-3" />
            Première session le{" "}
            <span className="font-medium text-fg-primary">
              {new Date(firstLaunchMs).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        )}

        {topPlaytime.length === 0 ? (
          <div className="rounded-xl bg-white/[0.02] p-5 text-center text-sm text-fg-muted ring-1 ring-white/[0.04]">
            Aucun jeu lancé pour l'instant. Va dans la bibliothèque !
          </div>
        ) : (
          <div className="grid gap-2">
            {topPlaytime.map((entry) => {
              const module = moduleById.get(entry.moduleId);
              return (
                <button
                  key={entry.moduleId}
                  onClick={() => navigate({ name: "module", moduleId: entry.moduleId })}
                  className="no-drag flex items-center gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.04] hover:ring-accent/30"
                >
                  {module?.iconUrl ? (
                    <img src={module.iconUrl} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <div className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent">
                      <Gamepad2 className="size-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-fg-primary">{module?.name ?? entry.moduleId}</div>
                    <div className="text-xs text-fg-muted">{entry.totalLaunches} lancement{entry.totalLaunches > 1 ? "s" : ""}</div>
                  </div>
                  <div className="font-mono text-sm text-accent">{formatPlaytime(entry.totalMs)}</div>
                </button>
              );
            })}
            {sortedPlaytime.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllModules((v) => !v)}
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.02] px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.04] hover:text-fg-primary"
              >
                {showAllModules ? (
                  <>
                    <ChevronUp className="size-3.5" /> Réduire
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" /> Voir les {sortedPlaytime.length - 5} autres modules
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </motion.div>

      {discordId && (
        <ShareProfileModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          discordId={discordId}
          displayName={user.displayName ?? "Joueur"}
        />
      )}
    </div>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.04]">
      <div className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div>
        <div className="font-display text-2xl text-fg-primary">{value}</div>
        <div className="text-xs text-fg-muted">{label}</div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
      <div className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent">
        <Icon className="size-4" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <div className="text-xs text-fg-muted">{label}</div>
        <div className={mono ? "font-mono text-sm text-fg-primary" : "text-sm text-fg-primary"}>{value}</div>
      </div>
    </div>
  );
}
