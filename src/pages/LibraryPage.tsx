import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library as LibraryIcon, Loader2, Plus, X } from "lucide-react";
import { ModuleCard } from "@/components/library/ModuleCard";
import { ShortcutForm } from "@/components/library/ShortcutForm";
import { CustomMinecraftForm } from "@/components/library/CustomMinecraftForm";
import { AddGameTypePicker } from "@/components/library/AddGameTypePicker";
import { SteamImportModal } from "@/components/library/SteamImportModal";
import { SteamGameDetailModal } from "@/components/library/SteamGameDetailModal";
import { useModules, useModulesPrimed } from "@/store/firebaseStores";
import { watchUserShortcuts, type ShortcutModule } from "@/firebase/shortcuts";
import { watchUserCustomMinecraft } from "@/firebase/customMinecraft";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { filterVisibleModules } from "@/lib/moduleVisibility";
import { getSteamGameInfo, extractSteamAppId } from "@/lib/steamGameInfo";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { launchModule } from "@/lib/modules";
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
  const [steamDetailAppId, setSteamDetailAppId] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    | { kind: "shortcut"; shortcut: ShortcutModule }
    | { kind: "custom-mc"; instance: CustomMinecraftModule }
    | null
  >(null);

  // Cache des genres Steam par moduleId — alimenté en background quand
  // l'user passe sur la page. Permet le filtre par genre sans bloquer
  // le rendu initial. Map de moduleId → set de genre IDs.
  const [steamGenres, setSteamGenres] = useState<
    Map<string, { ids: Set<string>; descriptions: string[] }>
  >(new Map());

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
  const all: LauncherModule[] = useMemo(
    () => [...(customMc ?? []), ...(shortcuts ?? []), ...hosted],
    [customMc, shortcuts, hosted],
  );

  // Pour chaque shortcut Steam de la library, fetch les genres en
  // background (avec cache Firestore 24h, donc instant pour les jeux
  // déjà cachés par d'autres users). Active le filtre par genre.
  //
  // Important : on prune aussi les entrées des shortcuts qui ont été
  // supprimés (sinon les chips de genre restent même après suppression).
  useEffect(() => {
    const steamShortcuts = (shortcuts ?? []).filter((s) =>
      extractSteamAppId(s.executablePath ?? ""),
    );
    const currentIds = new Set(steamShortcuts.map((s) => s.id));

    // Prune les entrées orphelines (shortcuts supprimés) — toujours
    // exécuté avant le fetch pour refléter immédiatement la suppression
    // dans le UI.
    setSteamGenres((prev) => {
      let changed = false;
      const next = new Map<
        string,
        { ids: Set<string>; descriptions: string[] }
      >();
      for (const [moduleId, value] of prev) {
        if (currentIds.has(moduleId)) {
          next.set(moduleId, value);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (steamShortcuts.length === 0) return;

    let cancelled = false;
    (async () => {
      // Limit concurrent fetches à 4 pour pas spammer l'API Steam
      // si l'user a 50+ jeux.
      const BATCH = 4;
      for (let i = 0; i < steamShortcuts.length; i += BATCH) {
        if (cancelled) return;
        const batch = steamShortcuts.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (s) => {
            const appId = extractSteamAppId(s.executablePath ?? "");
            if (!appId) return null;
            const info = await getSteamGameInfo(appId).catch(() => null);
            if (!info) return null;
            return {
              moduleId: s.id,
              ids: new Set(info.genres.map((g) => g.id)),
              descriptions: info.genres.map((g) => g.description),
            };
          }),
        );
        if (cancelled) return;
        setSteamGenres((prev) => {
          const next = new Map(prev);
          for (const r of results) {
            if (r) next.set(r.moduleId, { ids: r.ids, descriptions: r.descriptions });
          }
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shortcuts]);

  // Liste des genres disponibles pour les chips de filtre — agrégée
  // depuis le cache.
  const availableGenres = useMemo(() => {
    const counts = new Map<string, { id: string; count: number }>();
    for (const { ids, descriptions } of steamGenres.values()) {
      const idArr = Array.from(ids);
      idArr.forEach((id, i) => {
        const desc = descriptions[i] ?? id;
        const existing = counts.get(desc);
        if (existing) existing.count++;
        else counts.set(desc, { id, count: 1 });
      });
    }
    return Array.from(counts.entries())
      .map(([desc, v]) => ({ description: desc, count: v.count, id: v.id }))
      .sort((a, b) => b.count - a.count);
  }, [steamGenres]);

  // Reset le filtre actif si le genre n'existe plus parmi les chips
  // disponibles (jeu supprimé qui était le seul de ce genre, p.ex.).
  // Évite de garder un filtre qui retourne 0 jeu en permanence.
  useEffect(() => {
    if (genreFilter && !availableGenres.some((g) => g.description === genreFilter)) {
      setGenreFilter(null);
    }
  }, [genreFilter, availableGenres]);

  // Filtre la liste si un genre est actif.
  const filtered = useMemo(() => {
    if (!genreFilter) return all;
    return all.filter((m) => {
      // Hosted modules + Minecraft + custom MC : pas filtrés (toujours
      // visibles, le filtre est pour la library Steam).
      if (m.type !== "shortcut") return true;
      const entry = steamGenres.get(m.id);
      if (!entry) return false; // pas encore fetched ou pas Steam
      // Match sur la description (ID Steam variable selon localisation)
      return Array.from(entry.descriptions).some(
        (d) => d === genreFilter,
      );
    });
  }, [all, genreFilter, steamGenres]);

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

        {/* Genre filter chips — affichés seulement quand on a des
            shortcuts Steam dont les genres sont déjà chargés (cache
            Firestore ou fetched). */}
        {availableGenres.length > 0 && !loading && (
          <div className="mb-6 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Filtrer par genre :
            </span>
            <button
              onClick={() => {
                sounds.click();
                setGenreFilter(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] ring-1 transition",
                genreFilter === null
                  ? "bg-accent text-bg-base ring-accent shadow-[0_0_12px_var(--color-accent-soft)]"
                  : "bg-white/[0.04] text-fg-muted ring-white/[0.06] hover:bg-white/[0.08]",
              )}
            >
              Tous
            </button>
            {availableGenres.map((g) => (
              <button
                key={g.description}
                onClick={() => {
                  sounds.click();
                  setGenreFilter(g.description === genreFilter ? null : g.description);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ring-1 transition",
                  genreFilter === g.description
                    ? "bg-accent text-bg-base ring-accent shadow-[0_0_12px_var(--color-accent-soft)]"
                    : "bg-white/[0.04] text-fg-muted ring-white/[0.06] hover:bg-white/[0.08]",
                )}
              >
                {g.description}
                <span className="text-[9px] opacity-70">{g.count}</span>
              </button>
            ))}
            {genreFilter && (
              <button
                onClick={() => setGenreFilter(null)}
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] text-danger ring-1 ring-danger/30 hover:bg-danger/20"
              >
                <X className="size-2.5" /> Reset
              </button>
            )}
          </div>
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
        ) : filtered.length === 0 ? (
          <div className="grid h-64 place-items-center text-fg-muted">
            <div className="text-center">
              <p>Aucun jeu dans la catégorie « {genreFilter} ».</p>
              <button
                onClick={() => setGenreFilter(null)}
                className="mt-3 text-xs text-accent underline underline-offset-2"
              >
                Voir tous les jeux
              </button>
            </div>
          </div>
        ) : (
          <div
            className="grid grid-cols-3 gap-5 xl:grid-cols-4"
            data-tour-target="library-grid"
          >
            {filtered.map((m, i) => (
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
                onSteamDetail={(appId) => setSteamDetailAppId(appId)}
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

      {/* Steam game detail modal — ouverte au clic d'un shortcut Steam */}
      <AnimatePresence>
        {steamDetailAppId && (
          <SteamGameDetailModal
            appId={steamDetailAppId}
            onClose={() => setSteamDetailAppId(null)}
            onLaunch={() => {
              const shortcut = (shortcuts ?? []).find((s) => {
                const sid = extractSteamAppId(s.executablePath ?? "");
                return sid === steamDetailAppId;
              });
              if (shortcut) {
                launchModule(shortcut).catch((err) =>
                  console.warn("[library] steam launch failed:", err),
                );
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
