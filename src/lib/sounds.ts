// Dispatcher des sons d'interface — garde la même API publique
// (sounds.click(), sounds.hover(), …) qu'avant, mais délègue
// l'implémentation au soundpack actif (cf. `soundpacks.ts`).
//
// Compat : 251+ callsites dans le codebase utilisent `sounds.X()` —
// rien ne change pour eux. Le dispatcher choisit le pack à l'init et
// peut être switché à chaud via `setSoundpack(id)` (utilisé par le
// panel Settings).

import {
  loadSoundpackId,
  saveSoundpackId,
  SOUNDPACKS,
  type SoundpackId,
  type SoundpackImpl,
} from "./soundpacks";

let enabled = true;
let activeId: SoundpackId = "softlofi";
let activePack: SoundpackImpl | null = null;

const getEnabled = () => enabled;

function ensurePack(): SoundpackImpl {
  if (!activePack) {
    activeId = loadSoundpackId();
    const meta = SOUNDPACKS.find((p) => p.id === activeId) ?? SOUNDPACKS[0];
    activePack = meta.build(getEnabled);
  }
  return activePack;
}

export function setSoundsEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem("ui-sounds-enabled", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getSoundsEnabled(): boolean {
  try {
    const saved = localStorage.getItem("ui-sounds-enabled");
    if (saved !== null) {
      enabled = saved === "1";
    }
  } catch {
    /* ignore */
  }
  return enabled;
}

/** Switch dynamique du pack actif. Utilisé par le panel Settings. */
export function setSoundpack(id: SoundpackId): void {
  activeId = id;
  saveSoundpackId(id);
  const meta = SOUNDPACKS.find((p) => p.id === id) ?? SOUNDPACKS[0];
  activePack = meta.build(getEnabled);
}

export function getActiveSoundpackId(): SoundpackId {
  // Lazy init si jamais on demande l'id avant le premier play
  if (!activePack) ensurePack();
  return activeId;
}

// ─── API publique — proxy vers le pack actif ──────────────────────────

export const sounds = {
  hover() {
    ensurePack().hover();
  },
  click() {
    ensurePack().click();
  },
  launch() {
    ensurePack().launch();
  },
  success() {
    ensurePack().success();
  },
  error() {
    ensurePack().error();
  },
  notification() {
    ensurePack().notification();
  },
  messageReceived() {
    ensurePack().messageReceived();
  },
  updateArrived() {
    ensurePack().updateArrived();
  },
  achievementBronze() {
    ensurePack().achievementBronze();
  },
  achievementSilver() {
    ensurePack().achievementSilver();
  },
  achievementGold() {
    ensurePack().achievementGold();
  },
  achievementPlatinum() {
    ensurePack().achievementPlatinum();
  },
  achievementMilestone() {
    ensurePack().achievementMilestone();
  },
};

// Auto-init enabled flag from storage on import
getSoundsEnabled();
