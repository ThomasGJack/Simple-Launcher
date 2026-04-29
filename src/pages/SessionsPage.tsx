import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  Plus,
  Clock,
  Trash2,
  Check,
  X,
  HelpCircle,
  Play,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { watchModules } from "@/firebase/modules";
import {
  createSession,
  deleteSession,
  setRsvp,
  watchRsvps,
  watchSessions,
  type GameSession,
  type RsvpStatus,
  type SessionRsvp,
} from "@/firebase/sessions";
import type { LauncherModule } from "@/types/module";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Coordinated game sessions page. Lists upcoming and past sessions, lets
 * any user create a new one. RSVPs propagate live via onSnapshot — a
 * friend changing their status updates the count on every other client
 * without refresh.
 */
export function SessionsPage() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [modules, setModules] = useState<LauncherModule[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => watchSessions(setSessions), []);
  useEffect(() => watchModules(setModules), []);

  const now = Date.now();
  const upcoming = sessions.filter((s) => s.scheduledAt > now - 30 * 60_000);
  const past = sessions.filter((s) => s.scheduledAt <= now - 30 * 60_000).slice(-10);

  return (
    <div className="relative h-full overflow-y-auto px-10 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-end justify-between"
      >
        <div>
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-accent">
            <CalendarDays className="size-3" /> Communauté
          </p>
          <h1 className="mt-2 font-display text-5xl">Sessions de jeu</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Coordonnez vos soirées gaming. Crée une session, tes potes RSVPent en un clic.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="no-drag inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] transition-shadow"
        >
          <Plus className="size-4" /> Nouvelle session
        </button>
      </motion.div>

      <AnimatePresence>
        {creating && (
          <SessionEditor
            modules={modules}
            hostUid={me?.uid ?? ""}
            hostName={me?.displayName ?? null}
            hostAvatar={me?.photoURL ?? null}
            onClose={() => setCreating(false)}
          />
        )}
      </AnimatePresence>

      {upcoming.length === 0 && past.length === 0 && !creating ? (
        <div className="mt-10 rounded-3xl glass p-12 text-center">
          <CalendarDays className="mx-auto mb-3 size-8 text-fg-dim" strokeWidth={1.5} />
          <p className="text-base font-medium text-fg-primary">Pas de session prévue</p>
          <p className="mt-1 text-sm text-fg-muted">
            Lance la première — tes amis recevront une notif et pourront répondre en un clic.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              {upcoming.map((s, i) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  delay={i * 0.05}
                  isHost={s.hostUid === me?.uid}
                  onLaunch={() => navigate({ name: "module", moduleId: s.moduleId })}
                />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <>
              <div className="mb-3 mt-8 text-xs uppercase tracking-[0.2em] text-fg-dim">
                Sessions passées
              </div>
              <div className="space-y-2 opacity-60">
                {past.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    isHost={s.hostUid === me?.uid}
                    compact
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({
  session,
  delay = 0,
  isHost,
  compact,
  onLaunch,
}: {
  session: GameSession;
  delay?: number;
  isHost: boolean;
  compact?: boolean;
  onLaunch?: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [rsvps, setRsvps] = useState<SessionRsvp[]>([]);
  useEffect(() => watchRsvps(session.id, setRsvps), [session.id]);

  const myRsvp = rsvps.find((r) => r.uid === me?.uid)?.status ?? null;
  const yes = rsvps.filter((r) => r.status === "yes");
  const maybe = rsvps.filter((r) => r.status === "maybe");
  const no = rsvps.filter((r) => r.status === "no");

  const startsIn = session.scheduledAt - Date.now();
  const isLive = Math.abs(startsIn) < 30 * 60_000;
  const isPast = startsIn < -30 * 60_000;

  const handleRsvp = async (status: RsvpStatus) => {
    if (!me) return;
    sounds.click();
    try {
      await setRsvp(session.id, me.uid, status, me.displayName ?? null, me.photoURL ?? null);
    } catch (err) {
      console.warn("[session] rsvp failed:", err);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer la session "${session.moduleName}" ?`)) return;
    await deleteSession(session.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "relative overflow-hidden rounded-3xl glass-strong ring-1 transition-shadow",
        isLive ? "ring-accent/50 shadow-[0_0_36px_var(--color-accent-soft)]" : "ring-white/[0.06]",
        compact && "rounded-2xl glass",
      )}
    >
      <div className={cn("flex items-center gap-4", compact ? "p-3" : "p-5")}>
        {session.moduleIcon ? (
          <img
            src={session.moduleIcon}
            alt=""
            className={cn(
              "shrink-0 rounded-2xl object-cover ring-1 ring-white/10",
              compact ? "size-10" : "size-16",
            )}
          />
        ) : (
          <div
            className={cn(
              "grid shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30",
              compact ? "size-10" : "size-16",
            )}
          >
            <CalendarDays className={compact ? "size-4" : "size-6"} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={cn("truncate font-semibold", compact ? "text-sm" : "text-lg")}>
              {session.moduleName}
            </h3>
            {isLive && !compact && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Maintenant
              </span>
            )}
          </div>
          <div className={cn("text-fg-muted", compact ? "text-xs" : "text-sm")}>
            <Clock className="mr-1 inline size-3" />
            {formatSessionDate(session.scheduledAt)}
            {session.hostName && <span className="ml-2 text-fg-dim">· hôte: {session.hostName}</span>}
          </div>
          {session.note && !compact && (
            <p className="mt-2 text-sm text-fg-muted">{session.note}</p>
          )}

          {!compact && (
            <div className="mt-4 flex items-center gap-2">
              <RsvpButton
                kind="yes"
                count={yes.length}
                active={myRsvp === "yes"}
                onClick={() => handleRsvp("yes")}
                disabled={isPast}
              />
              <RsvpButton
                kind="maybe"
                count={maybe.length}
                active={myRsvp === "maybe"}
                onClick={() => handleRsvp("maybe")}
                disabled={isPast}
              />
              <RsvpButton
                kind="no"
                count={no.length}
                active={myRsvp === "no"}
                onClick={() => handleRsvp("no")}
                disabled={isPast}
              />
              <div className="ml-2 flex -space-x-2">
                {yes.slice(0, 5).map((r) =>
                  r.userAvatar ? (
                    <img
                      key={r.uid}
                      src={r.userAvatar}
                      alt=""
                      title={r.userName ?? "Anonyme"}
                      className="size-7 rounded-full object-cover ring-2 ring-bg-base"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      key={r.uid}
                      title={r.userName ?? "Anonyme"}
                      className="grid size-7 place-items-center rounded-full bg-bg-elevated text-[10px] uppercase ring-2 ring-bg-base"
                    >
                      {(r.userName ?? "?").slice(0, 1)}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        {!compact && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {isLive && onLaunch && (
              <button
                type="button"
                onClick={onLaunch}
                className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]"
              >
                <Play className="size-4 fill-current" strokeWidth={0} /> Lancer
              </button>
            )}
            {isHost && !isPast && (
              <button
                type="button"
                onClick={handleDelete}
                className="no-drag grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-danger/15 hover:text-danger"
                title="Supprimer la session"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function RsvpButton({
  kind,
  count,
  active,
  onClick,
  disabled,
}: {
  kind: RsvpStatus;
  count: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const cfg = {
    yes: { label: "Là", icon: <Check className="size-3.5" />, color: "emerald" },
    maybe: { label: "Peut-être", icon: <HelpCircle className="size-3.5" />, color: "amber" },
    no: { label: "Pas dispo", icon: <X className="size-3.5" />, color: "danger" },
  }[kind];
  const tone =
    cfg.color === "emerald"
      ? "ring-emerald-400/40 bg-emerald-400/15 text-emerald-300"
      : cfg.color === "amber"
        ? "ring-amber-400/40 bg-amber-400/15 text-amber-300"
        : "ring-danger/40 bg-danger/15 text-danger";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "no-drag inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? tone
          : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-bg-base/60",
      )}
    >
      {cfg.icon}
      <span>{cfg.label}</span>
      {count > 0 && <span className="font-mono tabular-nums">{count}</span>}
    </button>
  );
}

function SessionEditor({
  modules,
  hostUid,
  hostName,
  hostAvatar,
  onClose,
}: {
  modules: LauncherModule[];
  hostUid: string;
  hostName: string | null;
  hostAvatar: string | null;
  onClose: () => void;
}) {
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "");
  const [when, setWhen] = useState(formatDateTimeLocal(new Date(Date.now() + 60 * 60_000)));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === moduleId) ?? null,
    [modules, moduleId],
  );

  const handleSave = async () => {
    if (!selectedModule) {
      setError("Choisis un jeu");
      return;
    }
    const ts = parseDateTimeLocal(when);
    if (!ts || ts < Date.now() - 5 * 60_000) {
      setError("La date doit être dans le futur");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSession(
        {
          moduleId: selectedModule.id,
          moduleName: selectedModule.name,
          moduleIcon: selectedModule.iconUrl ?? null,
          scheduledAt: ts,
          note: note.trim(),
        },
        hostUid,
        hostName,
        hostAvatar,
      );
      sounds.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-6 overflow-hidden rounded-3xl glass-strong p-6 ring-1 ring-accent/30"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-lg">
          <CalendarDays className="size-5 text-accent" />
          Nouvelle session
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted">Jeu</span>
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="w-full rounded-xl bg-bg-base/40 px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          >
            <option value="">— Choisir un jeu —</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted">Date & heure</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl bg-bg-base/40 px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          />
        </label>
      </div>

      <label className="mt-3 block space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-fg-muted">
          Note (optionnel)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Ex: on essaie le nouveau modpack !"
          className="w-full resize-y rounded-xl bg-bg-base/40 px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
        />
      </label>

      {error && (
        <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-white/[0.04] px-4 py-2 text-sm ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}
          Créer la session
        </button>
      </div>
    </motion.div>
  );
}

function formatDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeLocal(s: string): number | null {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return t;
}

function formatSessionDate(ts: number): string {
  const date = new Date(ts);
  const diff = ts - Date.now();
  const day = 24 * 60 * 60 * 1000;
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diff > -30 * 60_000 && diff < 30 * 60_000) return `Maintenant · ${time}`;
  if (diff > 0 && diff < day && date.getDate() === new Date().getDate())
    return `Aujourd'hui à ${time}`;
  if (diff > 0 && diff < 2 * day) return `Demain à ${time}`;
  if (diff > 0 && diff < 7 * day) {
    return date.toLocaleDateString("fr-FR", { weekday: "long" }) + " à " + time;
  }
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + " · " + time;
}
