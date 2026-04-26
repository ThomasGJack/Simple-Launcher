import { motion } from "framer-motion";
import { Plus, Gamepad2 } from "lucide-react";

export function LibraryPage() {
  return (
    <div className="relative h-full overflow-y-auto p-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent">Bibliothèque</p>
          <h1 className="mt-2 font-display text-5xl text-fg-primary">Tes jeux</h1>
        </div>
        <button className="no-drag inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:bg-white/[0.08]">
          <Plus className="size-4" />
          Ajouter un jeu
        </button>
      </motion.div>

      <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <PlaceholderCard key={i} index={i} />
        ))}
      </div>
    </div>
  );
}

function PlaceholderCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 + 0.1 }}
      whileHover={{ y: -6 }}
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl glass"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-fuchsia-500/20" />
      <div className="absolute inset-0 grid place-items-center text-fg-dim">
        <Gamepad2 className="size-10" strokeWidth={1.5} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg-base/95 to-transparent p-4">
        <div className="text-xs uppercase tracking-wider text-fg-dim">Module</div>
        <div className="mt-0.5 font-medium text-fg-primary">Emplacement #{index + 1}</div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04] group-hover:ring-accent/30 group-hover:shadow-[inset_0_0_30px_var(--color-accent-soft)] transition-all duration-300" />
    </motion.div>
  );
}
