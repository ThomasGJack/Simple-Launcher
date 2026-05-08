import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Library as LibraryIcon, Loader2, Plus } from "lucide-react";
import { ModuleCard } from "@/components/library/ModuleCard";
import { ShortcutForm } from "@/components/library/ShortcutForm";
import { CustomMinecraftForm } from "@/components/library/CustomMinecraftForm";
import { AddGameTypePicker } from "@/components/library/AddGameTypePicker";
import { SteamImportModal } from "@/components/library/SteamImportModal";
import { useModules, useModulesPrimed } from "@/store/firebaseStores";
import { watchUserShortcuts, type ShortcutModule } from "@/firebase/shortcuts";
import { watchUserCustomMinecraft } from "@/firebase/customMinecraft";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { filterVisibleModules } from "@/lib/moduleVisibility";
import { sounds } from "@/lib/sounds";
import type { CustomMinecraftModule, LauncherModule } from "@/types/module";
import { useScrollMemory } from "@/hooks/useScrollMemory";

export function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const rawModules = useModules();
  const enableBeta = useSettingsStore((s) => s.enableBetaChannel);
  // Filtre les modules canal "beta" selon admin status + toggle user.
  // Les modules stable sont toujours visibles. cf. moduleVisibility.ts.
  const allModules = useMemo(
    () =>
      filterVisibleModules(rawModules, {
        uid: user?.uid ?? null,
        betaEnabled: enableBeta,
      }),
    [rawModules, user?.uid, enableBeta],
  );
  const modulesPrimed = useModulesPrimed();
  const [shortcuts, setShortcuts] = useState<ShortcutModule[] | null>(null);
  const [customMc, setCustomMc] = useState<CustomMinecraftModule[] | null>(null);
  const [picker, setPicker] = useState<"closed" | "type" | "shortcut" | "custom-mc">(
    "closed",
  );
  const [steamModalOpen, setSteamModalOpen] = useState(false);
  const [editing, setEditing] = useState<
    | { kind: "shortcut"; shortcut: ShortcutModule }
    | { kind: "custom-mc"; instance: CustomMinecraftModule }
    | null
  >(null);

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
      setCustomMc([]);
      return;
    }
    const unsubShortcuts = watchUserShortcuts(user.uid, setShortcuts);
    const unsubCustomMc = watchUserCustomMinecraft(user.uid, setCustomMc);
    return () => {
      unsubShortcuts();
      unsubCustomMc();
    };
  }, [user]);

  const loading = !modulesPrimed || shortcuts === null || customMc === null;
  const all: LauncherModule[] = [
    ...(customMc ?? []),
    ...(shortcuts ?? []),
    ...hosted,
  ];

  // Sets keyed by id so the card edit button only shows up on the
  // user's own creations (not on hosted admin-published modules).
  const ownedShortcutIds = useMemo(
    () => new Set((shortcuts ?? []).map((s) => s.id)),
    [shortcuts],
  );
  const ownedCustomMcIds = useMemo(
    () => new Set((customMc ?? []).map((c) => c.id)),
    [customMc],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef, "library");

  return (
    <>
      <div ref={scrollRef} className="scroll-y-only relative h-full p-12">
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                sounds.click();
                setSteamModalOpen(true);
              }}
              className="no-drag inline-flex items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm font-medium text-fg-primary ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
              title="Importer toute ta bibliothèque Steam en raccourcis"
            >
              <span className="text-base">🎮</span>
              Importer Steam
            </button>
            <button
              onClick={() => {
                sounds.click();
                setPicker("type");
              }}
              onMouseEnter={() => sounds.hover()}
              className="no-drag inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] transition-shadow hover:shadow-[0_0_36px_var(--color-accent-glow)]"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Ajouter un jeu
            </button>
          </div>
        </motion.div>

        {steamModalOpen && (
          <SteamImportModal onClose={() => setSteamModalOpen(false)} />
        )}

        {loading ? (
          <div className="grid h-64 place-items-center text-fg-dim">
            <Loader2 className="size-8 animate-spin" strokeWidth={1.5} />
          </div>
        ) : all.length === 0 ? (
          <div className="grid h-64 place-items-center">
            <button
              onClick={() => setPicker("type")}
              className="no-drag rounded-2xl glass p-10 text-center text-fg-muted transition-colors hover:bg-white/[0.06]"
            >
              <LibraryIcon className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
              <p>Bibliothèque vide.</p>
              <p className="mt-1 text-xs text-accent">Clique pour ajouter ton premier jeu.</p>
            </button>
          </div>
        ) : (
          <div
            className="grid grid-cols-3 gap-5 xl:grid-cols-4"
            data-tour-target="library-grid"
          >
            {all.map((m, i) => (
              <ModuleCard
                key={m.id}
                module={m}
                index={i}
                onEdit={
                  ownedShortcutIds.has(m.id) && m.type === "shortcut"
                    ? () => setEditing({ kind: "shortcut", shortcut: m })
                    : ownedCustomMcIds.has(m.id) && m.type === "custom-minecraft"
                      ? () => setEditing({ kind: "custom-mc", instance: m })
                      : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Step 1: type picker */}
      <AddGameTypePicker
        open={picker === "type"}
        onClose={() => setPicker("closed")}
        onPickShortcut={() => setPicker("shortcut")}
        onPickCustomMinecraft={() => setPicker("custom-mc")}
      />

      {/* Step 2a: shortcut form (creation) */}
      {picker === "shortcut" && (
        <ShortcutForm onClose={() => setPicker("closed")} />
      )}

      {/* Step 2b: custom MC form (creation) */}
      {picker === "custom-mc" && (
        <CustomMinecraftForm onClose={() => setPicker("closed")} />
      )}

      {/* Edit modes — opened from a card's Edit button */}
      {editing?.kind === "shortcut" && (
        <ShortcutForm
          initial={editing.shortcut}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "custom-mc" && (
        <CustomMinecraftForm
          initial={editing.instance}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
