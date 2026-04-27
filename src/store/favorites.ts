import { create } from "zustand";

type FavoritesState = {
  favorites: Set<string>;
  setFavorites: (ids: string[]) => void;
  isFavorite: (id: string) => boolean;
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: new Set<string>(),
  setFavorites: (ids) => set({ favorites: new Set(ids) }),
  isFavorite: (id) => get().favorites.has(id),
}));
