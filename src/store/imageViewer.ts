// Image viewer store — singleton lightbox global pour afficher une
// image en grand SANS sortir du launcher (qu'on confonde plus avec
// une page web). Utilisé partout où une image cliquable peut s'ouvrir
// pour la voir en taille réelle : messages crew, news, profils, etc.

import { create } from "zustand";

type ImageViewerState = {
  url: string | null;
  /** Caption optionnel — peut être le nom de l'expéditeur du message,
   *  le titre de la news, etc. Affiché en bas du viewer. */
  caption: string | null;
  open: (url: string, caption?: string | null) => void;
  close: () => void;
};

export const useImageViewer = create<ImageViewerState>((set) => ({
  url: null,
  caption: null,
  open: (url, caption = null) => set({ url, caption }),
  close: () => set({ url: null, caption: null }),
}));

/** Helper d'usage : invoque depuis n'importe quel onClick. */
export function openImage(url: string, caption?: string | null): void {
  useImageViewer.getState().open(url, caption ?? null);
}
