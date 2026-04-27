import { create } from "zustand";
import type {
  AnyModuleBlock,
  ExtendedPageTheme,
  ModuleBlockType,
  PlayButtonConfig,
} from "@/types/moduleBlocks";
import type { ModulePageV2, PageBackground } from "@/types/module";
import { createBlock } from "@/lib/blockRegistry";

const HISTORY_LIMIT = 50;

type Snapshot = {
  blocks: AnyModuleBlock[];
  theme?: ExtendedPageTheme;
  playButton?: PlayButtonConfig;
  background?: PageBackground;
};

type BuilderState = Snapshot & {
  selectedId: string | null;
  initial: Snapshot;
  history: Snapshot[];
  future: Snapshot[];

  setSelected: (id: string | null) => void;
  hydrate: (page: ModulePageV2) => void;
  addBlock: (type: ModuleBlockType, atIndex?: number) => string;
  removeBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (fromIndex: number, toIndex: number) => void;
  updateBlockProps: (id: string, patch: Record<string, unknown>) => void;
  updateBlockTheme: (id: string, patch: Record<string, unknown>) => void;
  toggleHidden: (id: string) => void;
  updatePageTheme: (patch: Partial<ExtendedPageTheme>) => void;
  updatePlayButton: (patch: Partial<PlayButtonConfig>) => void;
  updateBackground: (bg: PageBackground | undefined) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  isDirty: () => boolean;
  toPage: () => ModulePageV2;
};

function snapshotOf(s: Snapshot): Snapshot {
  return {
    blocks: s.blocks.map(
      (b) =>
        ({
          ...b,
          props: structuredClone(b.props),
          theme: b.theme ? { ...b.theme } : undefined,
        }) as AnyModuleBlock,
    ),
    theme: s.theme ? { ...s.theme } : undefined,
    playButton: s.playButton ? { ...s.playButton } : undefined,
    background: s.background ? structuredClone(s.background) : undefined,
  };
}

function pushHistory(state: BuilderState): Pick<BuilderState, "history" | "future"> {
  const snap = snapshotOf(state);
  const next = [...state.history, snap].slice(-HISTORY_LIMIT);
  return { history: next, future: [] };
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  blocks: [],
  selectedId: null,
  initial: { blocks: [] },
  history: [],
  future: [],

  setSelected: (id) => set({ selectedId: id }),

  hydrate: (page) => {
    const snap: Snapshot = {
      blocks: page.blocks ?? [],
      theme: page.theme,
      playButton: page.playButton,
      background: page.background,
    };
    set({
      ...snap,
      initial: snapshotOf(snap),
      history: [],
      future: [],
      selectedId: null,
    });
  },

  addBlock: (type, atIndex) => {
    const block = createBlock(type);
    const blocks = [...get().blocks];
    const idx = atIndex === undefined ? blocks.length : Math.max(0, Math.min(blocks.length, atIndex));
    blocks.splice(idx, 0, block);
    set((s) => ({ ...pushHistory(s), blocks, selectedId: block.id }));
    return block.id;
  },

  removeBlock: (id) =>
    set((s) => ({
      ...pushHistory(s),
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  duplicateBlock: (id) => {
    const blocks = [...get().blocks];
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const original = blocks[idx];
    const copy: AnyModuleBlock = {
      ...original,
      id: createBlock(original.type).id,
      props: structuredClone(original.props),
      theme: original.theme ? { ...original.theme } : undefined,
    } as AnyModuleBlock;
    blocks.splice(idx + 1, 0, copy);
    set((s) => ({ ...pushHistory(s), blocks, selectedId: copy.id }));
  },

  moveBlock: (fromIndex, toIndex) => {
    const blocks = [...get().blocks];
    if (fromIndex < 0 || fromIndex >= blocks.length) return;
    const [item] = blocks.splice(fromIndex, 1);
    const target = Math.max(0, Math.min(blocks.length, toIndex));
    blocks.splice(target, 0, item);
    set((s) => ({ ...pushHistory(s), blocks }));
  },

  updateBlockProps: (id, patch) =>
    set((s) => ({
      ...pushHistory(s),
      blocks: s.blocks.map((b) =>
        b.id === id ? ({ ...b, props: { ...(b.props as object), ...patch } } as AnyModuleBlock) : b,
      ),
    })),

  updateBlockTheme: (id, patch) =>
    set((s) => ({
      ...pushHistory(s),
      blocks: s.blocks.map((b) =>
        b.id === id ? ({ ...b, theme: { ...(b.theme ?? {}), ...patch } } as AnyModuleBlock) : b,
      ),
    })),

  toggleHidden: (id) =>
    set((s) => ({
      ...pushHistory(s),
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, hidden: !b.hidden } : b)),
    })),

  updatePageTheme: (patch) =>
    set((s) => ({ ...pushHistory(s), theme: { ...(s.theme ?? {}), ...patch } })),

  updatePlayButton: (patch) =>
    set((s) => ({ ...pushHistory(s), playButton: { ...(s.playButton ?? {}), ...patch } })),

  updateBackground: (bg) => set((s) => ({ ...pushHistory(s), background: bg })),

  undo: () => {
    const { history, future, blocks, theme, playButton, background } = get();
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const current: Snapshot = { blocks, theme, playButton, background };
    set({
      history: history.slice(0, -1),
      future: [current, ...future].slice(0, HISTORY_LIMIT),
      ...previous,
    });
  },

  redo: () => {
    const { history, future, blocks, theme, playButton, background } = get();
    if (future.length === 0) return;
    const [next, ...rest] = future;
    const current: Snapshot = { blocks, theme, playButton, background };
    set({
      history: [...history, current].slice(-HISTORY_LIMIT),
      future: rest,
      ...next,
    });
  },

  reset: () => {
    const { initial } = get();
    set({
      ...snapshotOf(initial),
      history: [],
      future: [],
      selectedId: null,
    });
  },

  isDirty: () => {
    const { blocks, theme, playButton, background, initial } = get();
    return JSON.stringify({ blocks, theme, playButton, background }) !== JSON.stringify(initial);
  },

  toPage: () => {
    const { blocks, theme, playButton, background } = get();
    return { version: 2, blocks, theme, playButton, background };
  },
}));
