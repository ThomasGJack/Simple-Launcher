import { useBuilderStore } from "./useBuilderState";
import { ColorField, Select } from "./fields/ColorField";
import { Input, NumberInput } from "./fields/Input";
import type { PageBackground, ParticlesConfig } from "@/types/module";

type BgType = "none" | "image" | "video";
type ParticlesPreset = NonNullable<ParticlesConfig["preset"]> | "none";

/**
 * Page-level inspector — shown when no block is selected. Drives the four
 * coordinated subsystems of a module's page customization:
 *   • Thème global (couleurs, polices)
 *   • Bouton Lancer (label / position / style / scale)
 *   • Particules en arrière-plan (preset, couleur, densité)
 *   • Background hero (image ou vidéo qui remplace la bannière)
 *
 * Single source of truth for everything visual on the module page.
 */
export function PageThemeInspector() {
  const theme = useBuilderStore((s) => s.theme);
  const playButton = useBuilderStore((s) => s.playButton);
  const background = useBuilderStore((s) => s.background);
  const updatePageTheme = useBuilderStore((s) => s.updatePageTheme);
  const updatePlayButton = useBuilderStore((s) => s.updatePlayButton);
  const updateBackground = useBuilderStore((s) => s.updateBackground);

  // Derive UI-only fields from the typed `PageBackground` union. The schema
  // stores particles inside the bg object, so we need to project them out for
  // the form and merge them back on every change.
  const bgType: BgType =
    background?.type === "image" || background?.type === "video"
      ? background.type
      : "none";
  const bgUrl =
    background && "url" in background ? background.url : "";
  const currentParticles: ParticlesConfig | undefined =
    background && "particles" in background ? background.particles : undefined;

  const setBgType = (next: BgType) => {
    if (next === "none") {
      updateBackground(undefined);
      return;
    }
    const url = bgUrl;
    const particles = currentParticles;
    updateBackground({
      type: next,
      url,
      ...(particles ? { particles } : {}),
    } as PageBackground);
  };

  const setBgUrl = (url: string) => {
    if (bgType === "none") return;
    updateBackground({
      type: bgType,
      url,
      ...(currentParticles ? { particles: currentParticles } : {}),
    } as PageBackground);
  };

  const updateParticles = (patch: Partial<ParticlesConfig> | null) => {
    if (bgType === "none") {
      // Particles aren't supported without a bg in the current schema.
      // Force the user to pick a bg first.
      return;
    }
    if (patch === null) {
      updateBackground({
        type: bgType,
        url: bgUrl,
      } as PageBackground);
      return;
    }
    const next: ParticlesConfig = {
      ...(currentParticles ?? {}),
      ...patch,
    };
    updateBackground({
      type: bgType,
      url: bgUrl,
      particles: next,
    } as PageBackground);
  };

  return (
    <div className="space-y-6">
      {/* ─── Thème global ─────────────────────────── */}
      <section>
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
            label="Police d'affichage"
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
      </section>

      {/* ─── Background hero ─────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Background hero</h3>
        <div className="space-y-3">
          <Select
            label="Type"
            value={bgType}
            onChange={(v) => setBgType(v)}
            options={[
              { value: "none", label: "Aucun (utilise la bannière)" },
              { value: "image", label: "Image" },
              { value: "video", label: "Vidéo (mp4 / webm)" },
            ]}
          />
          {bgType !== "none" && (
            <Input
              label={bgType === "video" ? "URL vidéo" : "URL image"}
              value={bgUrl}
              onChange={setBgUrl}
              placeholder="https://…"
              type="url"
            />
          )}
        </div>
      </section>

      {/* ─── Particules ──────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Particules</h3>
        {bgType === "none" ? (
          <p className="rounded-lg bg-bg-base/30 px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06]">
            Choisis d'abord une image ou une vidéo de background pour activer les particules par-dessus.
          </p>
        ) : (
          <div className="space-y-3">
            <Select
              label="Preset"
              value={(currentParticles?.preset ?? "none") as ParticlesPreset}
              onChange={(v: ParticlesPreset) => {
                if (v === "none") {
                  updateParticles(null);
                } else {
                  updateParticles({ preset: v });
                }
              }}
              options={[
                { value: "none", label: "Aucune" },
                { value: "stars", label: "Étoiles" },
                { value: "snow", label: "Neige" },
                { value: "fireflies", label: "Lucioles" },
                { value: "sparkles", label: "Étincelles" },
              ]}
            />
            {currentParticles?.preset && (
              <>
                <ColorField
                  label="Couleur"
                  value={currentParticles.color ?? "#00d4ff"}
                  onChange={(v) => updateParticles({ color: v })}
                />
                <NumberInput
                  label="Densité (20–200)"
                  value={currentParticles.density ?? 60}
                  onChange={(v) => updateParticles({ density: v })}
                  min={20}
                  max={200}
                />
              </>
            )}
          </div>
        )}
      </section>

      {/* ─── Bouton Lancer ──────────────────────── */}
      <section>
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
      </section>
    </div>
  );
}
