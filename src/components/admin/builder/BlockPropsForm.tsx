import type { AnyModuleBlock, ModuleBlockType } from "@/types/moduleBlocks";
import { Input, NumberInput } from "./fields/Input";
import { Textarea } from "./fields/Textarea";
import { ColorField, Select, Toggle } from "./fields/ColorField";
import { MediaPicker } from "./fields/MediaPicker";
import { IconPicker } from "./fields/IconPicker";
import { MarkdownField } from "./fields/MarkdownField";

type Props = {
  block: AnyModuleBlock;
  moduleId: string;
  onPropsChange: (patch: Record<string, unknown>) => void;
};

export function BlockPropsForm({ block, moduleId, onPropsChange }: Props) {
  switch (block.type) {
    case "hero-parallax":
      return <HeroParallaxInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "poster":
      return <PosterInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "gallery":
      return <GalleryInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "carousel":
      return <CarouselInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "video-embed":
      return <VideoEmbedInsp block={block} onPropsChange={onPropsChange} />;
    case "comparison":
      return <ComparisonInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "rich-text":
      return <RichTextInsp block={block} onPropsChange={onPropsChange} />;
    case "feature-cards":
      return <FeatureCardsInsp block={block} onPropsChange={onPropsChange} />;
    case "quote":
      return <QuoteInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "cta":
      return <CtaInsp block={block} moduleId={moduleId} onPropsChange={onPropsChange} />;
    case "divider":
      return <DividerInsp block={block} onPropsChange={onPropsChange} />;
    case "spacer":
      return <SpacerInsp block={block} onPropsChange={onPropsChange} />;
    case "stats":
      return <StatsInsp block={block} onPropsChange={onPropsChange} />;
    case "timeline":
      return <TimelineInsp block={block} onPropsChange={onPropsChange} />;
    case "changelog":
      return <ChangelogInsp block={block} onPropsChange={onPropsChange} />;
    case "screenshots-grid":
      return <ScreenshotsGridInsp block={block} onPropsChange={onPropsChange} />;
    case "mascot-spot":
      return <MascotSpotInsp block={block} onPropsChange={onPropsChange} />;
    case "particles-band":
      return <ParticlesBandInsp block={block} onPropsChange={onPropsChange} />;
    case "embed-html":
      return <EmbedHtmlInsp block={block} onPropsChange={onPropsChange} />;
    default:
      return null;
  }
}

type InspProps<T extends ModuleBlockType> = {
  block: Extract<AnyModuleBlock, { type: T }>;
  moduleId?: string;
  onPropsChange: (patch: Record<string, unknown>) => void;
};

function HeroParallaxInsp({ block, moduleId, onPropsChange }: InspProps<"hero-parallax">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Input label="Titre" value={p.title ?? ""} onChange={(v) => onPropsChange({ title: v })} />
      <Input label="Sous-titre" value={p.subtitle ?? ""} onChange={(v) => onPropsChange({ subtitle: v })} />
      <MediaPicker
        label="Image / vidéo de fond"
        value={p.bgUrl ?? p.videoUrl ?? ""}
        onChange={(url) => {
          const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
          onPropsChange(isVideo ? { videoUrl: url, bgUrl: undefined } : { bgUrl: url, videoUrl: undefined });
        }}
        moduleId={moduleId ?? "_"}
        blockId={block.id}
        slot="bg"
      />
      <MediaPicker
        label="Logo (optionnel)"
        value={p.logoUrl ?? ""}
        onChange={(url) => onPropsChange({ logoUrl: url })}
        moduleId={moduleId ?? "_"}
        blockId={block.id}
        slot="logo"
        accept="image/*"
        preview="image"
      />
      <Select
        label="Hauteur"
        value={p.height ?? "lg"}
        onChange={(v) => onPropsChange({ height: v })}
        options={[
          { value: "md", label: "Moyenne (420px)" },
          { value: "lg", label: "Grande (560px)" },
          { value: "xl", label: "Très grande (720px)" },
          { value: "screen", label: "Plein écran" },
        ]}
      />
      <Select
        label="Overlay"
        value={p.overlay ?? "gradient-bottom"}
        onChange={(v) => onPropsChange({ overlay: v })}
        options={[
          { value: "none", label: "Aucun" },
          { value: "dark", label: "Noir 40%" },
          { value: "gradient-bottom", label: "Dégradé bas" },
          { value: "gradient-radial", label: "Vignette radiale" },
          { value: "vignette", label: "Vignette inset" },
        ]}
      />
      <NumberInput
        label="Force du parallax (0–1)"
        value={p.parallaxStrength ?? 0.4}
        onChange={(v) => onPropsChange({ parallaxStrength: v })}
        min={0}
        max={1}
        step={0.1}
      />
    </div>
  );
}

function PosterInsp({ block, moduleId, onPropsChange }: InspProps<"poster">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <MediaPicker
        label="Image"
        value={p.imageUrl}
        onChange={(url) => onPropsChange({ imageUrl: url })}
        moduleId={moduleId ?? "_"}
        blockId={block.id}
        slot="image"
        accept="image/*"
        preview="image"
      />
      <Input label="Légende" value={p.caption ?? ""} onChange={(v) => onPropsChange({ caption: v })} />
      <Select
        label="Ratio"
        value={p.aspect ?? "16/9"}
        onChange={(v) => onPropsChange({ aspect: v })}
        options={[
          { value: "16/9", label: "16/9 — paysage" },
          { value: "21/9", label: "21/9 — ultra-wide" },
          { value: "4/5", label: "4/5 — portrait léger" },
          { value: "3/4", label: "3/4 — portrait" },
          { value: "1/1", label: "1/1 — carré" },
        ]}
      />
      <Select
        label="Cadre"
        value={p.frame ?? "neon-glow"}
        onChange={(v) => onPropsChange({ frame: v })}
        options={[
          { value: "none", label: "Aucun" },
          { value: "glass", label: "Glass" },
          { value: "neon-glow", label: "Halo néon" },
        ]}
      />
      <Toggle label="Animation Ken Burns" value={!!p.kenBurns} onChange={(v) => onPropsChange({ kenBurns: v })} />
    </div>
  );
}

function GalleryInsp({ block, moduleId, onPropsChange }: InspProps<"gallery">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <ImageListEditor
        label="Images"
        items={p.images}
        onChange={(images) => onPropsChange({ images })}
        moduleId={moduleId ?? "_"}
        blockId={block.id}
        slot="img"
      />
      <Select
        label="Layout"
        value={p.layout ?? "grid"}
        onChange={(v) => onPropsChange({ layout: v })}
        options={[
          { value: "grid", label: "Grille" },
          { value: "masonry", label: "Masonry" },
          { value: "carousel-3d", label: "Carousel 3D" },
        ]}
      />
      <Select
        label="Colonnes"
        value={String(p.columns ?? 3) as "2" | "3" | "4"}
        onChange={(v) => onPropsChange({ columns: Number(v) })}
        options={[
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ]}
      />
      <Toggle label="Lightbox au clic" value={p.lightbox !== false} onChange={(v) => onPropsChange({ lightbox: v })} />
    </div>
  );
}

function ImageListEditor({
  label,
  items,
  onChange,
  moduleId,
  blockId,
  slot,
}: {
  label: string;
  items: { url: string; caption?: string }[];
  onChange: (items: { url: string; caption?: string }[]) => void;
  moduleId: string;
  blockId: string;
  slot: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-fg-muted">{label}</div>
      {items.map((it, i) => (
        <div key={i} className="rounded-lg bg-bg-elevated p-2 ring-1 ring-white/[0.06]">
          <MediaPicker
            value={it.url}
            onChange={(url) => onChange(items.map((x, j) => (j === i ? { ...x, url } : x)))}
            moduleId={moduleId}
            blockId={blockId}
            slot={`${slot}-${i}`}
            accept="image/*"
            preview="image"
          />
          <Input
            placeholder="Légende (optionnelle)"
            value={it.caption ?? ""}
            onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, caption: v } : x)))}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="mt-2 text-xs text-danger hover:underline"
          >
            Supprimer
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { url: "" }])}
        className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-fg-muted hover:border-accent/40"
      >
        + Ajouter une image
      </button>
    </div>
  );
}

function CarouselInsp({ block, moduleId, onPropsChange }: InspProps<"carousel">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-fg-muted">Diapositives</div>
        {p.slides.map((slide, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-bg-elevated p-2 ring-1 ring-white/[0.06]">
            <MediaPicker
              value={slide.image ?? slide.video ?? ""}
              onChange={(url) => {
                const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
                const next = [...p.slides];
                next[i] = isVideo
                  ? { ...slide, video: url, image: undefined }
                  : { ...slide, image: url, video: undefined };
                onPropsChange({ slides: next });
              }}
              moduleId={moduleId ?? "_"}
              blockId={block.id}
              slot={`slide-${i}`}
            />
            <Input
              placeholder="Titre"
              value={slide.title ?? ""}
              onChange={(v) => {
                const next = [...p.slides];
                next[i] = { ...slide, title: v };
                onPropsChange({ slides: next });
              }}
            />
            <Input
              placeholder="Sous-titre"
              value={slide.subtitle ?? ""}
              onChange={(v) => {
                const next = [...p.slides];
                next[i] = { ...slide, subtitle: v };
                onPropsChange({ slides: next });
              }}
            />
            <button
              type="button"
              onClick={() => onPropsChange({ slides: p.slides.filter((_, j) => j !== i) })}
              className="text-xs text-danger hover:underline"
            >
              Supprimer
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onPropsChange({ slides: [...p.slides, {}] })}
          className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-fg-muted hover:border-accent/40"
        >
          + Ajouter une diapo
        </button>
      </div>
      <NumberInput
        label="Intervalle (ms)"
        value={p.interval ?? 5000}
        onChange={(v) => onPropsChange({ interval: v })}
        min={1500}
        step={500}
      />
      <Select
        label="Transition"
        value={p.transition ?? "ken-burns"}
        onChange={(v) => onPropsChange({ transition: v })}
        options={[
          { value: "ken-burns", label: "Ken Burns" },
          { value: "fade", label: "Fade" },
          { value: "slide", label: "Slide" },
        ]}
      />
      <Select
        label="Contrôles"
        value={p.controls ?? "both"}
        onChange={(v) => onPropsChange({ controls: v })}
        options={[
          { value: "none", label: "Aucun" },
          { value: "dots", label: "Points" },
          { value: "arrows", label: "Flèches" },
          { value: "both", label: "Les deux" },
        ]}
      />
      <Toggle label="Autoplay" value={p.autoplay !== false} onChange={(v) => onPropsChange({ autoplay: v })} />
    </div>
  );
}

function VideoEmbedInsp({ block, onPropsChange }: InspProps<"video-embed">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Select
        label="Provider"
        value={p.provider}
        onChange={(v) => onPropsChange({ provider: v })}
        options={[
          { value: "youtube", label: "YouTube" },
          { value: "vimeo", label: "Vimeo" },
          { value: "twitch", label: "Twitch (channel)" },
          { value: "mp4", label: "MP4 hébergé" },
        ]}
      />
      <Input
        label="URL ou ID"
        value={p.urlOrId}
        onChange={(v) => onPropsChange({ urlOrId: v })}
        placeholder="https://youtu.be/... ou ID"
      />
      <Select
        label="Ratio"
        value={p.aspect ?? "16/9"}
        onChange={(v) => onPropsChange({ aspect: v })}
        options={[
          { value: "16/9", label: "16/9" },
          { value: "21/9", label: "21/9" },
          { value: "4/3", label: "4/3" },
          { value: "9/16", label: "9/16 (vertical)" },
        ]}
      />
      <Toggle label="Autoplay" value={!!p.autoplay} onChange={(v) => onPropsChange({ autoplay: v })} />
      <Toggle label="Muet" value={p.mute !== false} onChange={(v) => onPropsChange({ mute: v })} />
      <Toggle label="Boucle" value={!!p.loop} onChange={(v) => onPropsChange({ loop: v })} />
    </div>
  );
}

function ComparisonInsp({ block, moduleId, onPropsChange }: InspProps<"comparison">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-fg-muted">Avant</div>
        <MediaPicker
          value={p.before.url}
          onChange={(url) => onPropsChange({ before: { ...p.before, url } })}
          moduleId={moduleId ?? "_"}
          blockId={block.id}
          slot="before"
          accept="image/*"
          preview="image"
        />
        <Input
          placeholder="Label avant"
          value={p.before.label ?? ""}
          onChange={(v) => onPropsChange({ before: { ...p.before, label: v } })}
        />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-fg-muted">Après</div>
        <MediaPicker
          value={p.after.url}
          onChange={(url) => onPropsChange({ after: { ...p.after, url } })}
          moduleId={moduleId ?? "_"}
          blockId={block.id}
          slot="after"
          accept="image/*"
          preview="image"
        />
        <Input
          placeholder="Label après"
          value={p.after.label ?? ""}
          onChange={(v) => onPropsChange({ after: { ...p.after, label: v } })}
        />
      </div>
      <Select
        label="Orientation"
        value={p.orientation ?? "horizontal"}
        onChange={(v) => onPropsChange({ orientation: v })}
        options={[
          { value: "horizontal", label: "Horizontale" },
          { value: "vertical", label: "Verticale" },
        ]}
      />
      <NumberInput
        label="Position initiale (%)"
        value={p.initialPosition ?? 50}
        onChange={(v) => onPropsChange({ initialPosition: v })}
        min={0}
        max={100}
      />
    </div>
  );
}

function RichTextInsp({ block, onPropsChange }: InspProps<"rich-text">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <MarkdownField label="Markdown" value={p.markdown} onChange={(v) => onPropsChange({ markdown: v })} />
      <Select
        label="Alignement"
        value={p.align ?? "left"}
        onChange={(v) => onPropsChange({ align: v })}
        options={[
          { value: "left", label: "Gauche" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Droite" },
        ]}
      />
      <Select
        label="Densité"
        value={p.prose ?? "default"}
        onChange={(v) => onPropsChange({ prose: v })}
        options={[
          { value: "compact", label: "Compact" },
          { value: "default", label: "Standard" },
          { value: "relaxed", label: "Aéré" },
        ]}
      />
      <Select
        label="Animation d'apparition"
        value={p.appearAnimation ?? "fade-up"}
        onChange={(v) => onPropsChange({ appearAnimation: v })}
        options={[
          { value: "none", label: "Aucune" },
          { value: "fade", label: "Fade" },
          { value: "fade-up", label: "Fade up" },
          { value: "typewriter", label: "Typewriter" },
        ]}
      />
    </div>
  );
}

function FeatureCardsInsp({ block, onPropsChange }: InspProps<"feature-cards">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-fg-muted">Cartes</div>
        {p.cards.map((card, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-bg-elevated p-2 ring-1 ring-white/[0.06]">
            <IconPicker
              value={card.icon}
              onChange={(name) => {
                const next = [...p.cards];
                next[i] = { ...card, icon: name };
                onPropsChange({ cards: next });
              }}
            />
            <Input
              placeholder="Titre"
              value={card.title}
              onChange={(v) => {
                const next = [...p.cards];
                next[i] = { ...card, title: v };
                onPropsChange({ cards: next });
              }}
            />
            <Textarea
              placeholder="Description"
              rows={2}
              value={card.description ?? ""}
              onChange={(v) => {
                const next = [...p.cards];
                next[i] = { ...card, description: v };
                onPropsChange({ cards: next });
              }}
            />
            <button
              type="button"
              onClick={() => onPropsChange({ cards: p.cards.filter((_, j) => j !== i) })}
              className="text-xs text-danger hover:underline"
            >
              Supprimer
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onPropsChange({ cards: [...p.cards, { title: "Feature", description: "Description" }] })
          }
          className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-fg-muted hover:border-accent/40"
        >
          + Ajouter une carte
        </button>
      </div>
      <Select
        label="Colonnes"
        value={String(p.columns ?? 3) as "2" | "3" | "4"}
        onChange={(v) => onPropsChange({ columns: Number(v) })}
        options={[
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ]}
      />
      <Select
        label="Style icônes"
        value={p.iconStyle ?? "neon"}
        onChange={(v) => onPropsChange({ iconStyle: v })}
        options={[
          { value: "outline", label: "Outline" },
          { value: "filled", label: "Rempli" },
          { value: "neon", label: "Néon" },
        ]}
      />
    </div>
  );
}

function QuoteInsp({ block, moduleId, onPropsChange }: InspProps<"quote">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Textarea label="Texte" value={p.text} onChange={(v) => onPropsChange({ text: v })} rows={3} />
      <Input label="Auteur" value={p.author ?? ""} onChange={(v) => onPropsChange({ author: v })} />
      <Input label="Rôle" value={p.role ?? ""} onChange={(v) => onPropsChange({ role: v })} />
      <MediaPicker
        label="Avatar"
        value={p.avatarUrl ?? ""}
        onChange={(url) => onPropsChange({ avatarUrl: url })}
        moduleId={moduleId ?? "_"}
        blockId={block.id}
        slot="avatar"
        accept="image/*"
        preview="image"
      />
      <Select
        label="Style"
        value={p.style ?? "glass"}
        onChange={(v) => onPropsChange({ style: v })}
        options={[
          { value: "glass", label: "Glass" },
          { value: "pull-quote", label: "Pull quote" },
          { value: "speech", label: "Bulle de dialogue" },
        ]}
      />
    </div>
  );
}

function CtaInsp({ block, moduleId, onPropsChange }: InspProps<"cta">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Input label="Titre" value={p.title} onChange={(v) => onPropsChange({ title: v })} />
      <Textarea label="Description" value={p.description ?? ""} onChange={(v) => onPropsChange({ description: v })} rows={2} />
      <Input label="Texte du bouton" value={p.buttonLabel} onChange={(v) => onPropsChange({ buttonLabel: v })} />
      <Select
        label="Action"
        value={p.buttonAction}
        onChange={(v) => onPropsChange({ buttonAction: v })}
        options={[
          { value: "launch", label: "Lancer le jeu" },
          { value: "url", label: "Ouvrir une URL" },
          { value: "scroll-top", label: "Scroller en haut" },
        ]}
      />
      {p.buttonAction === "url" && (
        <Input label="URL" value={p.buttonUrl ?? ""} onChange={(v) => onPropsChange({ buttonUrl: v })} type="url" />
      )}
      <MediaPicker
        label="Image de fond (optionnelle)"
        value={p.bgUrl ?? ""}
        onChange={(url) => onPropsChange({ bgUrl: url })}
        moduleId={moduleId ?? "_"}
        blockId={block.id}
        slot="cta-bg"
        accept="image/*"
        preview="image"
      />
    </div>
  );
}

function DividerInsp({ block, onPropsChange }: InspProps<"divider">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Select
        label="Style"
        value={p.style ?? "line"}
        onChange={(v) => onPropsChange({ style: v })}
        options={[
          { value: "line", label: "Ligne simple" },
          { value: "glow", label: "Glow néon" },
          { value: "gradient", label: "Dégradé" },
          { value: "particles-strip", label: "Bandeau particules" },
        ]}
      />
      <NumberInput
        label="Épaisseur"
        value={p.thickness ?? 1}
        onChange={(v) => onPropsChange({ thickness: v })}
        min={1}
        max={8}
      />
      <ColorField label="Couleur (optionnelle)" value={p.color ?? ""} onChange={(v) => onPropsChange({ color: v })} />
    </div>
  );
}

function SpacerInsp({ block, onPropsChange }: InspProps<"spacer">) {
  const p = block.props;
  return (
    <Select
      label="Taille"
      value={p.size ?? "md"}
      onChange={(v) => onPropsChange({ size: v })}
      options={[
        { value: "sm", label: "Petit (16px)" },
        { value: "md", label: "Moyen (32px)" },
        { value: "lg", label: "Grand (64px)" },
        { value: "xl", label: "Très grand (128px)" },
      ]}
    />
  );
}

function StatsInsp({ block, onPropsChange }: InspProps<"stats">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-fg-muted">Statistiques</div>
        {p.items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-bg-elevated p-2 ring-1 ring-white/[0.06]">
            <Input
              placeholder="Label (ex: Joueurs)"
              value={it.label}
              onChange={(v) => {
                const next = [...p.items];
                next[i] = { ...it, label: v };
                onPropsChange({ items: next });
              }}
            />
            <Input
              placeholder="Valeur (ex: 1k+)"
              value={it.value}
              onChange={(v) => {
                const next = [...p.items];
                next[i] = { ...it, value: v };
                onPropsChange({ items: next });
              }}
            />
            <button
              type="button"
              onClick={() => onPropsChange({ items: p.items.filter((_, j) => j !== i) })}
              className="text-xs text-danger hover:underline"
            >
              Supprimer
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onPropsChange({ items: [...p.items, { label: "Label", value: "0" }] })}
          className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-fg-muted hover:border-accent/40"
        >
          + Ajouter une stat
        </button>
      </div>
      <Select
        label="Style"
        value={p.style ?? "glass"}
        onChange={(v) => onPropsChange({ style: v })}
        options={[
          { value: "glass", label: "Glass" },
          { value: "neon", label: "Néon" },
          { value: "minimal", label: "Minimal" },
        ]}
      />
      <Select
        label="Colonnes"
        value={String(p.columns ?? 3) as "2" | "3" | "4"}
        onChange={(v) => onPropsChange({ columns: Number(v) })}
        options={[
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ]}
      />
      <Toggle
        label="Animer au scroll"
        value={p.animateOnView !== false}
        onChange={(v) => onPropsChange({ animateOnView: v })}
      />
    </div>
  );
}

function TimelineInsp({ block, onPropsChange }: InspProps<"timeline">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-fg-muted">Entrées</div>
        {p.entries.map((e, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-bg-elevated p-2 ring-1 ring-white/[0.06]">
            <Input placeholder="Date" value={e.date} onChange={(v) => onPropsChange({ entries: replaceAt(p.entries, i, { ...e, date: v }) })} />
            <Input placeholder="Titre" value={e.title} onChange={(v) => onPropsChange({ entries: replaceAt(p.entries, i, { ...e, title: v }) })} />
            <Textarea
              placeholder="Description"
              rows={2}
              value={e.description ?? ""}
              onChange={(v) => onPropsChange({ entries: replaceAt(p.entries, i, { ...e, description: v }) })}
            />
            <button
              type="button"
              onClick={() => onPropsChange({ entries: p.entries.filter((_, j) => j !== i) })}
              className="text-xs text-danger hover:underline"
            >
              Supprimer
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onPropsChange({ entries: [...p.entries, { date: "", title: "" }] })}
          className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-fg-muted hover:border-accent/40"
        >
          + Ajouter une entrée
        </button>
      </div>
      <Select
        label="Orientation"
        value={p.orientation ?? "vertical"}
        onChange={(v) => onPropsChange({ orientation: v })}
        options={[
          { value: "vertical", label: "Verticale" },
          { value: "alternating", label: "Alternée" },
        ]}
      />
    </div>
  );
}

function ChangelogInsp({ block, onPropsChange }: InspProps<"changelog">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Select
        label="Source"
        value={p.source ?? "manual"}
        onChange={(v) => onPropsChange({ source: v })}
        options={[
          { value: "manual", label: "Entrées manuelles" },
          { value: "auto-from-versions", label: "Auto depuis versions du module" },
        ]}
      />
      {p.source === "auto-from-versions" && (
        <NumberInput
          label="Limite"
          value={p.limit ?? 10}
          onChange={(v) => onPropsChange({ limit: v })}
          min={1}
          max={50}
        />
      )}
      {p.source !== "auto-from-versions" && (
        <div className="rounded-lg bg-bg-elevated p-3 text-xs text-fg-muted ring-1 ring-white/[0.06]">
          Édition manuelle des entrées non encore disponible — utilise « auto » avec les versions Firebase.
        </div>
      )}
    </div>
  );
}

function ScreenshotsGridInsp({ block, onPropsChange }: InspProps<"screenshots-grid">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Textarea
        label="URLs (une par ligne)"
        rows={6}
        value={p.images.join("\n")}
        onChange={(v) => onPropsChange({ images: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
      />
      <Select
        label="Colonnes"
        value={String(p.columns ?? 3) as "2" | "3" | "4"}
        onChange={(v) => onPropsChange({ columns: Number(v) })}
        options={[
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ]}
      />
    </div>
  );
}

function MascotSpotInsp({ block, onPropsChange }: InspProps<"mascot-spot">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Select
        label="Humeur"
        value={p.mood ?? "happy"}
        onChange={(v) => onPropsChange({ mood: v })}
        options={[
          { value: "idle", label: "Neutre" },
          { value: "happy", label: "Joyeuse" },
          { value: "gaming", label: "Gaming" },
          { value: "chat", label: "Bavarde" },
          { value: "sleeping", label: "Endormie" },
        ]}
      />
      <Select
        label="Position"
        value={p.position ?? "center"}
        onChange={(v) => onPropsChange({ position: v })}
        options={[
          { value: "left", label: "Gauche" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Droite" },
        ]}
      />
      <Input label="Caption" value={p.caption ?? ""} onChange={(v) => onPropsChange({ caption: v })} />
    </div>
  );
}

function ParticlesBandInsp({ block, onPropsChange }: InspProps<"particles-band">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <Select
        label="Preset"
        value={p.preset ?? "stars"}
        onChange={(v) => onPropsChange({ preset: v })}
        options={[
          { value: "stars", label: "Étoiles" },
          { value: "snow", label: "Neige" },
          { value: "fireflies", label: "Lucioles" },
          { value: "sparkles", label: "Étincelles" },
        ]}
      />
      <ColorField
        label="Couleur"
        value={p.color ?? "#00d4ff"}
        onChange={(v) => onPropsChange({ color: v })}
      />
      <NumberInput
        label="Densité"
        value={p.density ?? 80}
        onChange={(v) => onPropsChange({ density: v })}
        min={10}
        max={400}
      />
      <Select
        label="Hauteur"
        value={p.height ?? "md"}
        onChange={(v) => onPropsChange({ height: v })}
        options={[
          { value: "sm", label: "Petite" },
          { value: "md", label: "Moyenne" },
          { value: "lg", label: "Grande" },
        ]}
      />
    </div>
  );
}

function EmbedHtmlInsp({ block, onPropsChange }: InspProps<"embed-html">) {
  const p = block.props;
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
        ⚠ HTML brut sanitizé via DOMPurify. Les balises &lt;script&gt; et handlers on* sont automatiquement retirés.
      </div>
      <Textarea label="HTML" value={p.html} onChange={(v) => onPropsChange({ html: v })} rows={10} />
      <NumberInput
        label="Hauteur min (px)"
        value={p.height ?? 0}
        onChange={(v) => onPropsChange({ height: v || undefined })}
        min={0}
      />
    </div>
  );
}

function replaceAt<T>(arr: T[], i: number, value: T): T[] {
  const next = [...arr];
  next[i] = value;
  return next;
}
