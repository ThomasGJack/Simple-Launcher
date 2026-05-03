import { create } from "zustand";
import { getSoundsEnabled, setSoundsEnabled } from "@/lib/sounds";

/**
 * Per-machine UI settings persisted in localStorage. Pure-frontend, no
 * Firestore round-trip — different machines of the same user get their
 * own preferences (a tower might want full animations, an old laptop
 * might want them off, etc.).
 */
type SettingsState = {
  soundsEnabled: boolean;
  toggleSounds: () => void;

  // ─── Apparence ─────────────────────────────────────────────────────
  /** Hex color (with leading `#`) for `--color-accent`. `null` = default
   *  cyan defined in index.css. */
  accentColor: string | null;
  setAccentColor: (hex: string | null) => void;

  /** When false, the app applies `data-reduced-motion="true"` on
   *  `<html>` which most components honor by skipping or shortening
   *  Framer Motion + GSAP transitions. Useful for low-end laptops or
   *  users sensitive to animation. */
  animationsEnabled: boolean;
  toggleAnimations: () => void;

  /** Reset every Apparence preference to defaults. */
  resetApparence: () => void;
};

const LS_ACCENT = "settings.accentColor";
const LS_ANIM = "settings.animationsEnabled";

function readAccent(): string | null {
  try {
    const raw = localStorage.getItem(LS_ACCENT);
    if (!raw) return null;
    // Validate it's a hex color so a corrupted localStorage doesn't
    // inject arbitrary CSS into the var.
    return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeAccent(hex: string | null): void {
  try {
    if (hex === null) localStorage.removeItem(LS_ACCENT);
    else localStorage.setItem(LS_ACCENT, hex);
  } catch {
    /* localStorage might be disabled — fail silently */
  }
}

function readAnimations(): boolean {
  try {
    const raw = localStorage.getItem(LS_ANIM);
    if (raw === "false") return false;
    return true; // default ON
  } catch {
    return true;
  }
}

function writeAnimations(on: boolean): void {
  try {
    localStorage.setItem(LS_ANIM, on ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundsEnabled: getSoundsEnabled(),
  toggleSounds: () => {
    const next = !get().soundsEnabled;
    setSoundsEnabled(next);
    set({ soundsEnabled: next });
  },

  accentColor: readAccent(),
  setAccentColor: (hex) => {
    writeAccent(hex);
    set({ accentColor: hex });
  },

  animationsEnabled: readAnimations(),
  toggleAnimations: () => {
    const next = !get().animationsEnabled;
    writeAnimations(next);
    set({ animationsEnabled: next });
  },

  resetApparence: () => {
    writeAccent(null);
    writeAnimations(true);
    set({ accentColor: null, animationsEnabled: true });
  },
}));
