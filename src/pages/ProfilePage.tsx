import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, Calendar, Mail, Hash, Gamepad2, Clock, Rocket } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { signOut } from "@/firebase/auth";
import { formatPlaytime, watchPlaytime, type PlaytimeEntry } from "@/firebase/playtime";
import { watchModules } from "@/firebase/modules";
import type { LauncherModule } from "@/types/module";

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [playtime, setPlaytime] = useState<PlaytimeEntry[]>([]);
  const [modules, setModules] = useState<LauncherModule[]>([]);

  useEffect(() => {
    if (!user) return;
    return watchPlaytime(user.uid, setPlaytime);
  }, [user]);

  useEffect(() => {
    return watchModules(setModules);
  }, []);

  if (!user) return null;

  const discordId = user.uid.startsWith("discord_") ? user.uid.replace("discord_", "") : null;
  const created = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;

  const totalMs = playtime.reduce((sum, p) => sum + p.totalMs, 0);
  const totalLaunches = playtime.reduce((sum, p) => sum + p.totalLaunches, 0);
  const moduleById = new Map(modules.map((m) => [m.id, m] as const));
  const topPlaytime = [...playtime].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5);

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
          <Clock className="size-3" /> Statistiques de jeu
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <StatBox icon={Clock} label="Temps total" value={formatPlaytime(totalMs)} />
          <StatBox icon={Rocket} label="Lancements" value={String(totalLaunches)} />
        </div>

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
          </div>
        )}
      </motion.div>
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
