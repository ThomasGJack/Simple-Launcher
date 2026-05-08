import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, X, Check, Loader2, Search } from "lucide-react";
import {
  detectSteam,
  listSteamGames,
  steamGameToShortcut,
  type SteamGame,
} from "@/lib/steamImport";
import { saveUserShortcut } from "@/firebase/shortcuts";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Modal d'import de la library Steam. Détecte Steam, affiche les
 * jeux installés avec checkbox par défaut tous cochés, bouton bulk
 * "Importer N jeux" pour persister en `/users/{uid}/shortcuts/`.
 */
export function SteamImportModal({ onClose }: { onClose: () => void }) {
  const me = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const install = await detectSteam();
        if (!install) {
          if (!cancelled)
            setError(
              "Steam pas trouvé sur les paths usuels (C:\\Program Files (x86)\\Steam, C:\\Program Files\\Steam).",
            );
          setLoading(false);
          return;
        }
        const list = await listSteamGames();
        if (cancelled) return;
        setGames(list);
        setSelected(new Set(list.map((g) => g.appId)));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = games.filter((g) =>
    search.trim()
      ? g.name.toLowerCase().includes(search.toLowerCase().trim())
      : true,
  );

  const toggleAll = (force?: boolean) => {
    const next = new Set<string>();
    if (force ?? selected.size !== filtered.length) {
      filtered.forEach((g) => next.add(g.appId));
    }
    setSelected(next);
  };

  const toggleOne = (appId: string) => {
    const next = new Set(selected);
    if (next.has(appId)) next.delete(appId);
    else next.add(appId);
    setSelected(next);
  };

  const handleImport = async () => {
    if (!me || selected.size === 0 || importing) return;
    setImporting(true);
    setError(null);
    let count = 0;
    try {
      for (const game of games) {
        if (!selected.has(game.appId)) continue;
        const shortcut = steamGameToShortcut(game);
        await saveUserShortcut(me.uid, shortcut);
        count += 1;
      }
      setDone(count);
      sounds.success();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setImporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/75 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-bg-soft ring-1 ring-white/[0.08]"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30">
              <Gamepad2 className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg text-fg-primary">
                Importer ta library Steam
              </h2>
              <p className="text-xs text-fg-muted">
                Crée un raccourci pour chaque jeu sélectionné. Lance via Steam directement.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden p-5">
          {loading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="size-6 animate-spin text-fg-muted" />
            </div>
          ) : error ? (
            <div className="rounded-xl bg-danger/10 p-4 text-sm text-danger ring-1 ring-danger/30">
              {error}
            </div>
          ) : games.length === 0 ? (
            <div className="grid place-items-center py-16 text-sm text-fg-muted">
              Aucun jeu Steam détecté. Vérifie que Steam est installé et que
              tu as au moins 1 jeu dans ta library.
            </div>
          ) : done !== null ? (
            <div className="grid place-items-center gap-3 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-success/15 text-success ring-1 ring-success/30">
                <Check className="size-6" strokeWidth={2.5} />
              </div>
              <div className="text-base text-fg-primary">
                <strong>{done}</strong> jeu{done > 1 ? "x" : ""} importé{done > 1 ? "s" : ""} !
              </div>
              <p className="max-w-sm text-xs text-fg-muted">
                Tu les retrouves dans la bibliothèque sous l'onglet "Local".
              </p>
              <button
                onClick={onClose}
                className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-base"
              >
                Fermer
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-dim" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer…"
                    className="w-full rounded-lg bg-bg-base/60 pl-9 pr-3 py-1.5 text-sm text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
                  />
                </div>
                <button
                  onClick={() => toggleAll()}
                  className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
                >
                  {selected.size === filtered.length ? "Tout décocher" : "Tout cocher"}
                </button>
              </div>

              <div className="info-scroll mb-4 flex-1 overflow-y-auto">
                <AnimatePresence>
                  {filtered.map((g) => {
                    const isSelected = selected.has(g.appId);
                    return (
                      <motion.button
                        key={g.appId}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => toggleOne(g.appId)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition",
                          isSelected
                            ? "bg-accent/10 ring-1 ring-accent/30"
                            : "hover:bg-white/[0.03]",
                        )}
                      >
                        <div
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded ring-1 transition",
                            isSelected
                              ? "bg-accent text-bg-base ring-accent"
                              : "ring-white/[0.15]",
                          )}
                        >
                          {isSelected && <Check className="size-3" strokeWidth={3} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-fg-primary">
                            {g.name}
                          </div>
                          <div className="text-[10px] text-fg-dim">
                            App ID {g.appId}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <div className="text-xs text-fg-muted">
                  {selected.size} / {games.length} sélectionné{selected.size > 1 ? "s" : ""}
                </div>
                <button
                  onClick={handleImport}
                  disabled={selected.size === 0 || importing}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-base shadow-[0_0_16px_var(--color-accent-soft)] disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Importer {selected.size} jeu{selected.size > 1 ? "x" : ""}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
