import { useDraggable } from "@dnd-kit/core";
import { BLOCK_CATEGORIES, BLOCK_REGISTRY, blocksByCategory, type BlockRegistryEntry } from "@/lib/blockRegistry";
import { useBuilderStore } from "./useBuilderState";
import { cn } from "@/lib/cn";

export function BlockPalette() {
  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-white/[0.06] bg-bg-soft/40 p-3">
      <h3 className="mb-3 text-xs uppercase tracking-[0.25em] text-fg-muted">Palette</h3>
      <div className="space-y-5">
        {BLOCK_CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-dim">{cat.label}</div>
            <div className="space-y-1.5">
              {blocksByCategory(cat.id).map((entry) => (
                <PaletteItem key={entry.type} entry={entry} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaletteItem({ entry }: { entry: BlockRegistryEntry }) {
  const Icon = entry.icon;
  const addBlock = useBuilderStore((s) => s.addBlock);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${entry.type}`,
    data: { kind: "new", type: entry.type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => addBlock(entry.type)}
      {...listeners}
      {...attributes}
      title={entry.description}
      className={cn(
        "group flex w-full cursor-grab items-center gap-2 rounded-lg bg-bg-elevated px-3 py-2 text-left text-sm ring-1 ring-white/[0.06] transition active:cursor-grabbing",
        "hover:bg-bg-base hover:ring-accent/30",
        isDragging && "opacity-40",
      )}
    >
      <Icon className="size-4 text-accent" />
      <span className="flex-1 truncate">{(BLOCK_REGISTRY[entry.type] as BlockRegistryEntry).label}</span>
    </button>
  );
}
