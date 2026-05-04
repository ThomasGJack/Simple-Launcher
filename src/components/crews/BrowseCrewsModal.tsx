import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Globe, Loader2, Users, X } from "lucide-react";
import { joinPublicCrew, watchCrews, type Crew } from "@/firebase/crews";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Public-crew directory modal. Lists every crew with `isPublic=true`
 * (master crews are filtered out — they're auto-joined). Clicking a
 * card calls `joinPublicCrew` and the rules let the write through
 * because `isPublic=true` on the parent doc.
 */
export function BrowseCrewsModal({
  open,
  onClose,
  myCrewIds,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  myCrewIds: Set<string>;
  onJoined: (crewId: string) => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    return watchCrews((list) => {
      setCrews(list);
      setLoading(false);
    });
  }, [open]);

  const visible = crews.filter(
    (c) => c.isPublic && !c.isMaster && !myCrewIds.has(c.id),
  );

  const handleJoin = async (crew: Crew) => {
    if (!me) return;
    setJoining(crew.id);
    try {
      await joinPublicCrew(
        crew.id,
        me.uid,
        me.displayName ?? null,
        me.photoURL ?? null,
      );
      sounds.success();
      onJoined(crew.id);
      onClose();
    } catch (err) {
      console.warn("[crews] join failed:", err);
      sounds.error();
    } finally {
      setJoining(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-base/80 p-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="no-drag flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl glass-strong shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            <header className="flex items-center justify-between border-b border-white/[0.06] p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                  <Compass className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl text-fg-primary">Découvrir des crews</h2>
                  <p className="text-xs text-fg-muted">
                    Rejoins les crews publics ouverts à tous.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/[0.06]"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="grid h-48 place-items-center">
                  <Loader2 className="size-8 animate-spin text-fg-dim" />
                </div>
              ) : visible.length === 0 ? (
                <div className="grid h-48 place-items-center text-center text-sm text-fg-muted">
                  <div>
                    <Compass className="mx-auto mb-2 size-8 text-fg-dim" strokeWidth={1.5} />
                    <p>Pas de crew public à découvrir.</p>
                    <p className="mt-1 text-xs text-fg-dim">
                      Tu es déjà dans tous ceux disponibles, ou personne n'a encore créé un crew public.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visible.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleJoin(c)}
                      disabled={joining !== null}
                      className={cn(
                        "group relative flex flex-col gap-2 rounded-2xl bg-bg-base/40 p-4 text-left ring-1 ring-white/[0.06] transition hover:bg-white/[0.04] disabled:opacity-50",
                        joining === c.id && "ring-2",
                      )}
                      style={
                        joining === c.id
                          ? ({ ["--tw-ring-color" as string]: c.color } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl text-2xl ring-1"
                          style={{
                            background: c.iconUrl
                              ? "transparent"
                              : `color-mix(in srgb, ${c.color} 18%, transparent)`,
                            color: c.color,
                            ["--tw-ring-color" as string]: c.color,
                          } as React.CSSProperties}
                        >
                          {c.iconUrl ? (
                            <img
                              src={c.iconUrl}
                              alt=""
                              className="size-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            c.emblem
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate text-base font-semibold"
                            style={{ color: c.color }}
                          >
                            {c.name}
                          </div>
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300">
                            <Globe className="size-3" /> Public
                            <span className="ml-2 inline-flex items-center gap-1 text-fg-dim">
                              <Users className="size-3" />
                              {c.memberCount}
                            </span>
                          </div>
                        </div>
                      </div>
                      {c.description && (
                        <p className="line-clamp-2 text-xs text-fg-muted">
                          {c.description}
                        </p>
                      )}
                      <div className="mt-2 inline-flex items-center justify-center rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent ring-1 ring-accent/30 group-hover:bg-accent/15">
                        {joining === c.id ? "Rejoindre…" : "Rejoindre"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
