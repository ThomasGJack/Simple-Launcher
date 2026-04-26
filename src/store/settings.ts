import { create } from "zustand";
import { getSoundsEnabled, setSoundsEnabled } from "@/lib/sounds";

type SettingsState = {
  soundsEnabled: boolean;
  toggleSounds: () => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundsEnabled: getSoundsEnabled(),
  toggleSounds: () => {
    const next = !get().soundsEnabled;
    setSoundsEnabled(next);
    set({ soundsEnabled: next });
  },
}));
