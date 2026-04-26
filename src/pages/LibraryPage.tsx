import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Library as LibraryIcon, Loader2 } from "lucide-react";
import { ModuleCard } from "@/components/library/ModuleCard";
import { watchModules } from "@/firebase/modules";
import type { LauncherModule } from "@/types/module";

export function LibraryPage() {
  const [modules, setModules] = useState<LauncherModule[] | null>(null);

  useEffect(() => {
    return watchModules(setModules);
  }, []);

  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Bibliothèque</p>
        <h1 className="mt-2 font-display text-5xl text-fg-primary">Tes jeux</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {modules === null
            ? "Chargement…"
            : modules.length === 0
              ? "Aucun jeu pour l'instant. Va dans la page admin pour en ajouter."
              : `${modules.length} jeu${modules.length > 1 ? "x" : ""} disponible${modules.length > 1 ? "s" : ""}.`}
        </p>
      </motion.div>

      {modules === null ? (
        <div className="grid h-64 place-items-center text-fg-dim">
          <Loader2 className="size-8 animate-spin" strokeWidth={1.5} />
        </div>
      ) : modules.length === 0 ? (
        <div className="grid h-64 place-items-center">
          <div className="rounded-2xl glass p-10 text-center text-fg-muted">
            <LibraryIcon className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
            <p>Bibliothèque vide.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
          {modules.map((m, i) => (
            <ModuleCard key={m.id} module={m} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
