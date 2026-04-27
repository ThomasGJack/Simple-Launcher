import { useBuilderStore } from "./useBuilderState";
import { ColorField, Select } from "./fields/ColorField";
import { Input, NumberInput } from "./fields/Input";

export function PageThemeInspector() {
  const theme = useBuilderStore((s) => s.theme);
  const playButton = useBuilderStore((s) => s.playButton);
  const updatePageTheme = useBuilderStore((s) => s.updatePageTheme);
  const updatePlayButton = useBuilderStore((s) => s.updatePlayButton);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Thème global</h3>
        <div className="space-y-3">
          <ColorField
            label="Couleur primaire"
            value={theme?.primary ?? ""}
            onChange={(v) => updatePageTheme({ primary: v })}
          />
          <ColorField
            label="Couleur d'accent"
            value={theme?.accent ?? ""}
            onChange={(v) => updatePageTheme({ accent: v })}
          />
          <Input
            label="Police d'affichage (Google Fonts)"
            value={theme?.fontDisplay ?? ""}
            onChange={(v) => updatePageTheme({ fontDisplay: v })}
            placeholder="ex: Audiowide, Orbitron"
          />
          <Input
            label="URL CSS de la police (optionnel)"
            value={theme?.fontDisplayUrl ?? ""}
            onChange={(v) => updatePageTheme({ fontDisplayUrl: v })}
            placeholder="https://fonts.googleapis.com/css2?family=..."
            type="url"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Bouton Lancer</h3>
        <div className="space-y-3">
          <Input
            label="Libellé"
            value={playButton?.label ?? ""}
            onChange={(v) => updatePlayButton({ label: v })}
            placeholder="JOUER"
          />
          <Select
            label="Style"
            value={playButton?.style ?? "neon-pulse"}
            onChange={(v) => updatePlayButton({ style: v })}
            options={[
              { value: "neon-pulse", label: "Néon pulsant" },
              { value: "solid", label: "Solide" },
              { value: "outline", label: "Outline" },
              { value: "ghost", label: "Ghost" },
            ]}
          />
          <Select
            label="Position"
            value={playButton?.position ?? "bottom-right"}
            onChange={(v) => updatePlayButton({ position: v })}
            options={[
              { value: "bottom-right", label: "Bas droite" },
              { value: "bottom-center", label: "Bas centre" },
              { value: "center", label: "Centre" },
              { value: "top-right", label: "Haut droite" },
            ]}
          />
          <NumberInput
            label="Échelle (1 = normal)"
            value={playButton?.sizeScale ?? 1}
            onChange={(v) => updatePlayButton({ sizeScale: v })}
            min={0.7}
            max={1.6}
            step={0.05}
          />
        </div>
      </div>
    </div>
  );
}
