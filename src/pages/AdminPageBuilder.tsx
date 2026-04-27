import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
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
import { watchModules, updateModulePage } from "@/firebase/modules";
import { migrateModulePage } from "@/lib/modulePageMigration";
import { isAdmin } from "@/lib/admin";
import { useAuthStore } from "@/store/auth";
import type { LauncherModule } from "@/types/module";
import { BlockPalette } from "@/components/admin/builder/BlockPalette";
import { BlockCanvas } from "@/components/admin/builder/BlockCanvas";
import { BlockInspector } from "@/components/admin/builder/BlockInspector";
import { useBuilderStore } from "@/components/admin/builder/useBuilderState";
import type { ModuleBlockType } from "@/types/moduleBlocks";

export function AdminPageBuilder() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const [modules, setModules] = useState<LauncherModule[]>([]);
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

  useEffect(() => watchModules(setModules), []);

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
          {savedAt && !isDirty && (
            <span className="text-xs text-fg-dim">Sauvegardé</span>
          )}
          <button
            type="button"
            onClick={() => reset()}
            disabled={!isDirty || saving}
            className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-bg-base disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Enregistrer
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid h-full flex-1 grid-cols-[260px_1fr_360px] overflow-hidden">
          <BlockPalette />
          <BlockCanvas module={module} />
          <BlockInspector moduleId={moduleId} />
        </div>
      </DndContext>
    </div>
  );
}
