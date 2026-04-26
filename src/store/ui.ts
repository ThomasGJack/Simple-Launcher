import { create } from "zustand";

export type Route =
  | { name: "home" }
  | { name: "library" }
  | { name: "module"; moduleId: string }
  | { name: "settings" }
  | { name: "profile" }
  | { name: "admin" }
  | { name: "community" }
  | { name: "login" };

type UIState = {
  route: Route;
  navigate: (route: Route) => void;
  windowMaximized: boolean;
  setWindowMaximized: (maximized: boolean) => void;
};

export const useUIStore = create<UIState>((set) => ({
  route: { name: "home" },
  navigate: (route) => set({ route }),
  windowMaximized: false,
  setWindowMaximized: (windowMaximized) => set({ windowMaximized }),
}));
