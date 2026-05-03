import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Monitor, Save, Smartphone, Tablet } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useUIStore } from "@/store/ui";
import { updateModulePage } from "@/firebase/modules";
import { useModules } from "@/store/firebaseStores";
import { migrateModulePage } from "@/lib/modulePageMigration";
import { isAdmin } from "@/lib/admin";
import { useAuthStore } from "@/store/auth";
import { BlockPalette } from "@/components/admin/builder/BlockPalette";
import { BlockCanvas } from "@/components/admin/builder/BlockCanvas";
import { BlockInspector } from "@/components/admin/builder/BlockInspector";
import { useBuilderStore } from "@/components/admin/builder/useBuilderState";
import type { ModuleBlockType } from "@/types/moduleBlocks";

export function AdminPageBuilder() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const modules = useModules();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const moduleId = route.name === "admin-builder" ? route.moduleId : null;
  const module = modules.find((m) => m.id === moduleId);

  const hydrate = useBuilderStore((s) => s.hydrate);
  const reset = useBuilderStore((s) => s.reset);
  const blocks = useBuilderStore((s) => s.blocks);
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const addBlock = useBuilderStore((s) => s.addBlock);
  const isDirty = useBuilderStore((s) => s.isDirty)();
  const toPage = useBuilderStore((s) => s.toPage);

  // Viewport preview width — lets the admin sanity-check responsive
  // behaviour without resizing the whole launcher window. Stored locally
  // (no Firestore round-trip).
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");

  useEffect(() => {
    if (!module) return;
    hydrate(migrateModulePage(module.page, module));
  }, [module, hydrate]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (!user || !isAdmin(user)) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        Accès admin requis.
      </div>
    );
  }

  if (!moduleId) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        Module manquant. <button onClick={() => navigate({ name: "admin" })} className="ml-2 underline">Retour</button>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { kind?: string; type?: string } | undefined;
    if (activeData?.kind === "new" && activeData.type) {
      const overData = over.data.current as { id?: string } | undefined;
      const targetIndex = overData?.id ? blocks.findIndex((b) => b.id === overData.id) : blocks.length;
      addBlock(activeData.type as ModuleBlockType, targetIndex >= 0 ? targetIndex : blocks.length);
      return;
    }
    if (active.id !== over.id) {
      const fromIndex = blocks.findIndex((b) => b.id === active.id);
      const toIndex = blocks.findIndex((b) => b.id === over.id);
      if (fromIndex !== -1 && toIndex !== -1) {
        const reordered = arrayMove(blocks, fromIndex, toIndex);
        moveBlock(fromIndex, blocks.indexOf(reordered[toIndex]));
      }
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateModulePage(moduleId, toPage());
      hydrate(toPage());
      setSavedAt(Date.now());
    } catch (e) {
      alert("Erreur de sauvegarde : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ── Keyboard shortcuts ──────────────────────────────────────
  //
  // Standard editor bindings: Ctrl+S → save, Ctrl+Z → undo,
  // Ctrl+Y or Ctrl+Shift+Z → redo, Escape → deselect, Delete /
  // Backspace on selected block → remove. We skip handlers when the
  // event target is an input / textarea / contenteditable so the user
  // can still type normally in the inspector forms.
  useEffect(() => {
    const isFromInput = (e: KeyboardEvent): boolean => {
      const target = e.target as HTMLElement | null;
      if (!target) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      // Save — works even from inputs (matches industry-standard expectation)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !saving) void handleSave();
        return;
      }
      if (isFromInput(e)) return;

      const store = useBuilderStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        store.redo();
      } else if (e.key === "Escape") {
        store.setSelected(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && store.selectedId) {
        e.preventDefault();
        if (confirm("Supprimer ce bloc ?")) store.removeBlock(store.selectedId);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saving]);

  const viewportWidth =
    viewport === "desktop" ? "100%" : viewport === "tablet" ? "768px" : "375px";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] bg-bg-soft/60 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (isDirty && !confirm("Modifications non sauvegardées. Quitter ?")) return;
              navigate({ name: "admin" });
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-bg-elevated px-3 py-1.5 text-xs hover:bg-bg-base"
          >
            <ArrowLeft className="size-3.5" /> Admin
          </button>
          <div>
            <div className="text-sm font-semibold">{module.name}</div>
            <div className="text-xs text-fg-dim">Builder de page — {module.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Viewport preview switcher — emulates desktop / tablet /
              mobile widths so the admin can validate responsive behaviour
              without resizing the launcher window. */}
          <div className="flex items-center rounded-md bg-bg-elevated p-0.5 ring-1 ring-white/[0.06]">
            {([
              { key: "desktop", icon: Monitor, label: "Desktop", width: "100%" },
              { key: "tablet", icon: Tablet, label: "Tablette · 768 px", width: "768 px" },
              { key: "mobile", icon: Smartphone, label: "Mobile · 375 px", width: "375 px" },
            ] as const).map((v) => {
              const Icon = v.icon;
              const active = viewport === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setViewport(v.key)}
                  title={v.label}
                  className={
                    "rounded px-2 py-1 transition " +
                    (active
                      ? "bg-accent/15 text-accent"
                      : "text-fg-muted hover:text-fg-primary")
                  }
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
          {savedAt && !isDirty && (
            <span className="text-xs text-fg-dim">Sauvegardé</span>
          )}
          <button
            type="button"
            onClick={() => reset()}
            disabled={!isDirty || saving}
            className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] disabled:opacity-40"
            title="Annuler les modifications non sauvegardées"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-bg-base disabled:opacity-40"
            title="Sauvegarder · Ctrl+S"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Enregistrer
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid h-full flex-1 grid-cols-[260px_1fr_360px] overflow-hidden">
          <BlockPalette />
          {/* Viewport-clamped canvas wrapper. Centered + ring-bounded
              when not in desktop mode so the admin sees exactly what a
              tablet/phone user would. */}
          <div
            className={
              "relative flex h-full overflow-hidden bg-bg-base " +
              (viewport === "desktop" ? "" : "items-stretch justify-center")
            }
          >
            <div
              style={{ width: viewportWidth, maxWidth: "100%" }}
              className={
                "h-full overflow-hidden " +
                (viewport === "desktop"
                  ? "w-full"
                  : "border-x border-white/[0.06] shadow-[0_0_60px_rgba(0,0,0,0.4)]")
              }
            >
              <BlockCanvas module={module} />
            </div>
          </div>
          <BlockInspector moduleId={moduleId} />
        </div>
      </DndContext>
    </div>
  );
}
