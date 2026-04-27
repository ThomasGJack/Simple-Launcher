import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import type { LauncherModule } from "@/types/module";
import type { AnyModuleBlock } from "@/types/moduleBlocks";
import { BlockRenderer } from "@/components/module-blocks/BlockRenderer";
import { useBuilderStore } from "./useBuilderState";
import { cn } from "@/lib/cn";

type Props = {
  module: LauncherModule;
};

export function BlockCanvas({ module }: Props) {
  const blocks = useBuilderStore((s) => s.blocks);
  const theme = useBuilderStore((s) => s.theme);
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop" });

  const themeStyle: React.CSSProperties & Record<string, string> = {};
  if (theme?.primary) themeStyle["--module-primary"] = theme.primary;
  if (theme?.accent) themeStyle["--module-accent"] = theme.accent;
  if (theme?.fontDisplay) themeStyle["--module-font-display"] = theme.fontDisplay;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-base">
      <div className="border-b border-white/[0.06] bg-bg-soft/60 px-4 py-2">
        <CanvasToolbar />
      </div>
      <div className="flex-1 overflow-y-auto" style={themeStyle}>
        <div
          ref={setNodeRef}
          className={cn(
            "mx-auto min-h-full max-w-5xl py-6 transition",
            isOver && "ring-2 ring-accent/40",
          )}
        >
          {blocks.length === 0 ? (
            <EmptyCanvas />
          ) : (
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {blocks.map((block) => (
                  <SortableBlockItem key={block.id} block={block} module={module} />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="mx-4 rounded-3xl border border-dashed border-white/15 p-12 text-center">
      <div className="text-base text-fg-muted">Glisse un bloc depuis la palette à gauche pour commencer.</div>
      <div className="mt-2 text-sm text-fg-dim">Tu peux aussi cliquer sur un bloc pour l'ajouter à la fin.</div>
    </div>
  );
}

function SortableBlockItem({ block, module }: { block: AnyModuleBlock; module: LauncherModule }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { kind: "block", id: block.id },
  });
  const selectedId = useBuilderStore((s) => s.selectedId);
  const setSelected = useBuilderStore((s) => s.setSelected);
  const removeBlock = useBuilderStore((s) => s.removeBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const toggleHidden = useBuilderStore((s) => s.toggleHidden);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const selected = selectedId === block.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => setSelected(block.id)}
      className={cn(
        "group relative cursor-pointer rounded-2xl ring-1 transition",
        selected ? "ring-accent" : "ring-transparent hover:ring-white/15",
        isDragging && "opacity-60",
        block.hidden && "opacity-50",
      )}
    >
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab rounded-md bg-bg-base/80 p-1.5 backdrop-blur ring-1 ring-white/10 hover:bg-bg-base"
          title="Déplacer"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleHidden(block.id);
          }}
          className="rounded-md bg-bg-base/80 p-1.5 backdrop-blur ring-1 ring-white/10 hover:bg-bg-base"
          title={block.hidden ? "Afficher" : "Masquer"}
        >
          {block.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            duplicateBlock(block.id);
          }}
          className="rounded-md bg-bg-base/80 p-1.5 backdrop-blur ring-1 ring-white/10 hover:bg-bg-base"
          title="Dupliquer"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Supprimer ce bloc ?")) removeBlock(block.id);
          }}
          className="rounded-md bg-danger/20 p-1.5 backdrop-blur ring-1 ring-danger/40 hover:bg-danger/30"
          title="Supprimer"
        >
          <Trash2 className="size-3.5 text-danger" />
        </button>
      </div>
      <div className="pointer-events-none">
        <BlockRenderer blocks={[block]} module={module} />
      </div>
    </div>
  );
}

function CanvasToolbar() {
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const history = useBuilderStore((s) => s.history);
  const future = useBuilderStore((s) => s.future);
  const blocks = useBuilderStore((s) => s.blocks);
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="text-fg-muted">{blocks.length} bloc{blocks.length > 1 ? "s" : ""}</div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
          className="rounded-md bg-bg-elevated px-3 py-1 ring-1 ring-white/[0.06] disabled:opacity-40"
        >
          ↶ Annuler
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={future.length === 0}
          className="rounded-md bg-bg-elevated px-3 py-1 ring-1 ring-white/[0.06] disabled:opacity-40"
        >
          ↷ Refaire
        </button>
      </div>
    </div>
  );
}
