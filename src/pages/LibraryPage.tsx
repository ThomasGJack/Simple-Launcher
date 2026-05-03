import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Library as LibraryIcon, Loader2, Plus } from "lucide-react";
import { ModuleCard } from "@/components/library/ModuleCard";
import { ShortcutForm } from "@/components/library/ShortcutForm";
import { useModules, useModulesPrimed } from "@/store/firebaseStores";
import { watchUserShortcuts, type ShortcutModule } from "@/firebase/shortcuts";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import type { LauncherModule } from "@/types/module";

export function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const allModules = useModules();
  const modulesPrimed = useModulesPrimed();
  const [shortcuts, setShortcuts] = useState<ShortcutModule[] | null>(null);
  const [editing, setEditing] = useState<{ kind: "new" } | { kind: "edit"; shortcut: ShortcutModule } | null>(null);

  // Filter out legacy shortcuts that may still live under `/modules` —
  // those now belong under `/users/{uid}/shortcuts`. Memoised to avoid
  // re-filtering on unrelated re-renders.
  const hosted = useMemo(
    () => allModules.filter((m) => m.type !== "shortcut"),
    [allModules],
  );

  useEffect(() => {
    if (!user) {
      setShortcuts([]);
      return;
    }
    return watchUserShortcuts(user.uid, setShortcuts);
  }, [user]);

  const loading = !modulesPrimed || shortcuts === null;
  const all: LauncherModule[] = [
    ...(shortcuts ?? []),
    ...hosted,
  ];

  const ownedShortcutIds = new Set((shortcuts ?? []).map((s) => s.id));

  return (
    <>
      <div className="relative h-full overflow-y-auto p-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex items-end justify-between gap-4"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-accent">Bibliothèque</p>
            <h1 className="mt-2 font-display text-5xl text-fg-primary">Tes jeux</h1>
            <p className="mt-2 text-sm text-fg-muted">
              {loading
                ? "Chargement…"
                : all.length === 0
                  ? "Aucun jeu pour l'instant. Ajoute ton premier raccourci à droite."
                  : `${all.length} jeu${all.length > 1 ? "x" : ""} disponible${all.length > 1 ? "s" : ""}.`}
            </p>
          </div>
          <button
            onClick={() => {
              sounds.click();
              setEditing({ kind: "new" });
            }}
            onMouseEnter={() => sounds.hover()}
            className="no-drag inline-flex shrink-0 items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_36px_var(--color-accent-glow)]"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Ajouter un jeu
          </button>
        </motion.div>

        {loading ? (
          <div className="grid h-64 place-items-center text-fg-dim">
            <Loader2 className="size-8 animate-spin" strokeWidth={1.5} />
          </div>
        ) : all.length === 0 ? (
          <div className="grid h-64 place-items-center">
            <button
              onClick={() => setEditing({ kind: "new" })}
              className="no-drag rounded-2xl glass p-10 text-center text-fg-muted transition-colors hover:bg-white/[0.06]"
            >
              <LibraryIcon className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
              <p>Bibliothèque vide.</p>
              <p className="mt-1 text-xs text-accent">Clique pour ajouter ton premier raccourci.</p>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
            {all.map((m, i) => (
              <ModuleCard
                key={m.id}
                module={m}
                index={i}
                onEdit={ownedShortcutIds.has(m.id) && m.type === "shortcut" ? () => setEditing({ kind: "edit", shortcut: m }) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ShortcutForm
          initial={editing.kind === "edit" ? editing.shortcut : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
