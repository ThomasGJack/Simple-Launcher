import { useState } from "react";
import { Settings, Palette } from "lucide-react";
import { useBuilderStore } from "./useBuilderState";
import { BlockPropsForm } from "./BlockPropsForm";
import { BLOCK_REGISTRY } from "@/lib/blockRegistry";
import { PageThemeInspector } from "./PageThemeInspector";
import { BlockThemeForm } from "./BlockThemeForm";
import { cn } from "@/lib/cn";

export function BlockInspector({ moduleId }: { moduleId: string }) {
  const blocks = useBuilderStore((s) => s.blocks);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const updateBlockProps = useBuilderStore((s) => s.updateBlockProps);
  const [tab, setTab] = useState<"props" | "theme">("props");

  const block = blocks.find((b) => b.id === selectedId);

  if (!block) {
    return (
      <div className="flex h-full flex-col overflow-y-auto border-l border-white/[0.06] bg-bg-soft/40 p-4">
        <PageThemeInspector />
      </div>
    );
  }

  const entry = BLOCK_REGISTRY[block.type];
  const Icon = entry.icon;

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-white/[0.06] bg-bg-soft/40">
      <div className="flex items-center gap-2 border-b border-white/[0.06] p-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Icon className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{entry.label}</div>
          <div className="text-xs text-fg-dim">{entry.description}</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-white/[0.06] p-2">
        <TabBtn active={tab === "props"} onClick={() => setTab("props")} icon={<Settings className="size-3.5" />}>
          Propriétés
        </TabBtn>
        <TabBtn active={tab === "theme"} onClick={() => setTab("theme")} icon={<Palette className="size-3.5" />}>
          Thème
        </TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "props" ? (
          <BlockPropsForm
            block={block}
            moduleId={moduleId}
            onPropsChange={(patch) => updateBlockProps(block.id, patch)}
          />
        ) : (
          <BlockThemeForm blockId={block.id} />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs",
        active ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-white/5",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
