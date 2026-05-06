import { create } from "zustand";

export type Route =
  | { name: "home" }
  | { name: "library" }
  | { name: "module"; moduleId: string }
  | { name: "settings" }
  | { name: "profile" }
  | { name: "achievements" }
  | { name: "admin" }
  | { name: "admin-builder"; moduleId: string }
  | { name: "community" }
  | { name: "vip" }
  | { name: "crews"; crewId?: string; channelId?: string }
  | { name: "crew-config"; crewId: string; tab?: "general" | "channels" | "roles" | "invite" | "danger" }
  | { name: "messages"; conversationId?: string }
  | { name: "user-profile"; uid: string }
  | { name: "notifications" }
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
