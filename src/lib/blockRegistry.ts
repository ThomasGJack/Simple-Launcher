import {
  AlignLeft,
  ArrowLeftRight,
  CircleDot,
  Clapperboard,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  type LucideIcon,
  Megaphone,
  Minus,
  Quote,
  Smile,
  Sparkles,
  Square,
  Star,
  TrendingUp,
  Video,
  Wand2,
  Workflow,
} from "lucide-react";

import {
  type AnyModuleBlock,
  type BlockKindMap,
  type ModuleBlockType,
  newBlockId,
} from "../types/moduleBlocks";

export type BlockCategory =
  | "hero-visual"
  | "text-structure"
  | "data"
  | "effects-advanced";

export type BlockRegistryEntry<T extends ModuleBlockType = ModuleBlockType> = {
  type: T;
  label: string;
  description: string;
  icon: LucideIcon;
  category: BlockCategory;
  defaults: () => BlockKindMap[T];
};

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string }[] = [
  { id: "hero-visual", label: "Hero & Visuel" },
  { id: "text-structure", label: "Texte & Structure" },
  { id: "data", label: "Données" },
  { id: "effects-advanced", label: "Effets & Avancé" },
];

export const BLOCK_REGISTRY: { [K in ModuleBlockType]: BlockRegistryEntry<K> } = {
  "hero-parallax": {
    type: "hero-parallax",
    label: "Hero parallax",
    description: "Hero plein écran avec image/vidéo et parallax au scroll",
    icon: Star,
    category: "hero-visual",
    defaults: () => ({
      title: "Titre du jeu",
      subtitle: "Une accroche courte",
      height: "lg",
      overlay: "gradient-bottom",
      parallaxStrength: 0.4,
    }),
  },
  "poster": {
    type: "poster",
    label: "Affiche / Poster",
    description: "Image grand format style affiche cinéma",
    icon: ImageIcon,
    category: "hero-visual",
    defaults: () => ({ imageUrl: "", aspect: "16/9", frame: "neon-glow" }),
  },
  "gallery": {
    type: "gallery",
    label: "Galerie",
    description: "Screenshots avec lightbox (grid/masonry/3D)",
    icon: Images,
    category: "hero-visual",
    defaults: () => ({ images: [], layout: "grid", columns: 3, lightbox: true }),
  },
  "carousel": {
    type: "carousel",
    label: "Carousel",
    description: "Diaporama animé (ken-burns, fade, slide)",
    icon: Clapperboard,
    category: "hero-visual",
    defaults: () => ({
      slides: [],
      interval: 5000,
      transition: "ken-burns",
      aspect: "16/9",
      autoplay: true,
      controls: "both",
    }),
  },
  "video-embed": {
    type: "video-embed",
    label: "Vidéo",
    description: "YouTube, Vimeo, Twitch ou MP4 hébergé",
    icon: Video,
    category: "hero-visual",
    defaults: () => ({
      provider: "youtube",
      urlOrId: "",
      aspect: "16/9",
      autoplay: false,
      mute: true,
      loop: false,
      controls: true,
    }),
  },
  "comparison": {
    type: "comparison",
    label: "Comparateur",
    description: "Slider avant/après pour deux images",
    icon: ArrowLeftRight,
    category: "hero-visual",
    defaults: () => ({
      before: { url: "" },
      after: { url: "" },
      orientation: "horizontal",
      initialPosition: 50,
    }),
  },
  "rich-text": {
    type: "rich-text",
    label: "Texte riche",
    description: "Markdown stylisé avec animations d'apparition",
    icon: AlignLeft,
    category: "text-structure",
    defaults: () => ({
      markdown: "## Un titre accrocheur\n\nUn paragraphe descriptif.",
      align: "left",
      prose: "default",
      appearAnimation: "fade-up",
    }),
  },
  "feature-cards": {
    type: "feature-cards",
    label: "Cards features",
    description: "Grille de cartes icône + titre + description",
    icon: LayoutGrid,
    category: "text-structure",
    defaults: () => ({
      cards: [
        { icon: "Sparkles", title: "Feature 1", description: "Description courte" },
        { icon: "Zap", title: "Feature 2", description: "Description courte" },
        { icon: "Star", title: "Feature 3", description: "Description courte" },
      ],
      columns: 3,
      iconStyle: "neon",
    }),
  },
  "quote": {
    type: "quote",
    label: "Citation",
    description: "Bloc témoignage / citation stylisée",
    icon: Quote,
    category: "text-structure",
    defaults: () => ({
      text: "Une citation marquante",
      author: "Auteur",
      style: "glass",
    }),
  },
  "cta": {
    type: "cta",
    label: "Call to action",
    description: "Bandeau bouton (lancer le jeu / lien / scroll)",
    icon: Megaphone,
    category: "text-structure",
    defaults: () => ({
      title: "Prêt à jouer ?",
      buttonLabel: "Lancer",
      buttonAction: "launch",
    }),
  },
  "divider": {
    type: "divider",
    label: "Séparateur",
    description: "Ligne, glow, gradient ou particles strip",
    icon: Minus,
    category: "text-structure",
    defaults: () => ({ style: "glow", thickness: 1 }),
  },
  "spacer": {
    type: "spacer",
    label: "Espace",
    description: "Espacement vertical pur",
    icon: Square,
    category: "text-structure",
    defaults: () => ({ size: "md" }),
  },
  "stats": {
    type: "stats",
    label: "Statistiques",
    description: "Chiffres animés au scroll (count-up)",
    icon: TrendingUp,
    category: "data",
    defaults: () => ({
      items: [
        { label: "Joueurs", value: "1k+" },
        { label: "Mods", value: "200" },
        { label: "Versions", value: "12" },
      ],
      columns: 3,
      style: "glass",
      animateOnView: true,
    }),
  },
  "timeline": {
    type: "timeline",
    label: "Timeline",
    description: "Frise chronologique verticale ou alternée",
    icon: Workflow,
    category: "data",
    defaults: () => ({ entries: [], orientation: "vertical" }),
  },
  "changelog": {
    type: "changelog",
    label: "Changelog",
    description: "Versions manuelles ou auto depuis Firestore",
    icon: CircleDot,
    category: "data",
    defaults: () => ({ source: "auto-from-versions", limit: 10 }),
  },
  "screenshots-grid": {
    type: "screenshots-grid",
    label: "Screenshots (legacy)",
    description: "Grille simple de screenshots — préférer Galerie",
    icon: Images,
    category: "data",
    defaults: () => ({ images: [], columns: 3 }),
  },
  "mascot-spot": {
    type: "mascot-spot",
    label: "Mascotte",
    description: "Mascotte animée du launcher avec humeur",
    icon: Smile,
    category: "effects-advanced",
    defaults: () => ({ mood: "happy", position: "center" }),
  },
  "particles-band": {
    type: "particles-band",
    label: "Bandeau particules",
    description: "Bandeau plein large rempli de particules animées",
    icon: Sparkles,
    category: "effects-advanced",
    defaults: () => ({ preset: "stars", density: 80, height: "md" }),
  },
  "embed-html": {
    type: "embed-html",
    label: "HTML libre",
    description: "HTML brut sanitizé (avancé)",
    icon: Wand2,
    category: "effects-advanced",
    defaults: () => ({ html: "<p>Mon HTML personnalisé.</p>" }),
  },
};

export const ALL_BLOCK_TYPES: ModuleBlockType[] = Object.keys(BLOCK_REGISTRY) as ModuleBlockType[];

export function blocksByCategory(category: BlockCategory): BlockRegistryEntry[] {
  return ALL_BLOCK_TYPES
    .filter((t) => BLOCK_REGISTRY[t].category === category)
    .map((t) => BLOCK_REGISTRY[t] as BlockRegistryEntry);
}

export function createBlock<T extends ModuleBlockType>(type: T): AnyModuleBlock {
  const entry = BLOCK_REGISTRY[type] as BlockRegistryEntry<T>;
  return {
    id: newBlockId(),
    type,
    props: entry.defaults(),
  } as AnyModuleBlock;
}

