import { useBuilderStore } from "./useBuilderState";
import { ColorField, Select } from "./fields/ColorField";

export function BlockThemeForm({ blockId }: { blockId: string }) {
  const block = useBuilderStore((s) => s.blocks.find((b) => b.id === blockId));
  const updateBlockTheme = useBuilderStore((s) => s.updateBlockTheme);
  if (!block) return null;
  const t = block.theme ?? {};
  return (
    <div className="space-y-3">
      <ColorField
        label="Primary (override)"
        value={t.primary ?? ""}
        onChange={(v) => updateBlockTheme(blockId, { primary: v })}
      />
      <ColorField
        label="Accent (override)"
        value={t.accent ?? ""}
        onChange={(v) => updateBlockTheme(blockId, { accent: v })}
      />
      <Select
        label="Fond"
        value={t.bg ?? "transparent"}
        onChange={(v) => updateBlockTheme(blockId, { bg: v })}
        options={[
          { value: "transparent", label: "Transparent" },
          { value: "glass", label: "Glass" },
          { value: "glass-strong", label: "Glass+" },
          { value: "solid", label: "Couleur unie" },
        ]}
      />
      {t.bg === "solid" && (
        <ColorField
          label="Couleur de fond"
          value={t.bgColor ?? ""}
          onChange={(v) => updateBlockTheme(blockId, { bgColor: v })}
        />
      )}
      <Select
        label="Padding vertical"
        value={t.paddingY ?? "md"}
        onChange={(v) => updateBlockTheme(blockId, { paddingY: v })}
        options={[
          { value: "none", label: "Aucun" },
          { value: "sm", label: "Petit" },
          { value: "md", label: "Moyen" },
          { value: "lg", label: "Grand" },
          { value: "xl", label: "Très grand" },
        ]}
      />
      <Select
        label="Largeur max"
        value={t.maxWidth ?? "default"}
        onChange={(v) => updateBlockTheme(blockId, { maxWidth: v })}
        options={[
          { value: "narrow", label: "Étroite" },
          { value: "default", label: "Standard" },
          { value: "wide", label: "Large" },
          { value: "full", label: "Pleine largeur" },
        ]}
      />
      <Select
        label="Alignement"
        value={t.align ?? "left"}
        onChange={(v) => updateBlockTheme(blockId, { align: v })}
        options={[
          { value: "left", label: "Gauche" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Droite" },
        ]}
      />
    </div>
  );
}
