// Soundpack système — extraction du WebAudio générateur en packs
// interchangeables. Le module `sounds.ts` reste un dispatcher avec la
// même API publique (251 callsites inchangés), il délègue juste au
// pack actif.
//
// 3 packs au launch :
//   - softlofi : le pack original (sine waves + lowpass, calme)
//   - arcade   : 8-bit style (square waves, attaques rapides, plus
//                pétillant)
//   - minimal  : un seul click générique pour toutes les actions
//                (idéal pour qui trouve les sons trop présents)

export type SoundpackId = "softlofi" | "arcade" | "minimal";

/**
 * Interface qu'un pack doit implémenter. Toutes les méthodes sont
 * appelées depuis le dispatcher `sounds.ts`. Les noms doivent matcher
 * l'API publique exposée historiquement.
 */
export type SoundpackImpl = {
  hover(): void;
  click(): void;
  launch(): void;
  success(): void;
  error(): void;
  notification(): void;
  messageReceived(): void;
  updateArrived(): void;
  achievementBronze(): void;
  achievementSilver(): void;
  achievementGold(): void;
  achievementPlatinum(): void;
  achievementMilestone(): void;
};

// ─── Helpers WebAudio partagés ────────────────────────────────────────

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

type Tone = {
  freq: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  freqEnd?: number;
  filterFreq?: number;
  filterQ?: number;
};

/** Génère un tone unique avec enveloppe ADSR + filtre passe-bas. Usage
 *  partagé par les 3 soundpacks. Le caller passe `enabled` pour le
 *  gate global mute (sounds.ts garde la state). */
export function playTone(tone: Tone, delay: number, enabled: boolean): void {
  if (!enabled) return;
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const start = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const filter = c.createBiquadFilter();

  osc.type = tone.type ?? "sine";
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(0.01, tone.freqEnd),
      start + tone.duration,
    );
  }

  filter.type = "lowpass";
  filter.frequency.value = tone.filterFreq ?? 3500;
  filter.Q.value = tone.filterQ ?? 0.5;

  const peak = tone.volume ?? 0.16;
  const attack = tone.attack ?? 0.025;
  const release = tone.release ?? Math.max(0.1, tone.duration - attack);

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  osc.start(start);
  osc.stop(start + tone.duration + 0.05);
}

// ─── Pack 1 : Soft Lofi (le pack original) ───────────────────────────
//
// Identité : sine waves + lowpass 3.5 kHz, attaques douces, release
// long. Calme, anti-fatigue auditive sur de longues sessions.

function buildSoftLofi(getEnabled: () => boolean): SoundpackImpl {
  const p = (tone: Tone, delay = 0) => playTone(tone, delay, getEnabled());
  return {
    hover() {
      p({ freq: 440, duration: 0.09, type: "sine", volume: 0.05, attack: 0.02, release: 0.07, filterFreq: 3000 });
    },
    click() {
      p({ freq: 350, freqEnd: 250, duration: 0.16, type: "sine", volume: 0.16, attack: 0.015, release: 0.14, filterFreq: 2800 });
    },
    launch() {
      p({ freq: 220, freqEnd: 440, duration: 0.45, type: "sine", volume: 0.16, attack: 0.06, release: 0.4, filterFreq: 3500 });
      p({ freq: 330, freqEnd: 660, duration: 0.5, type: "triangle", volume: 0.1, attack: 0.07, release: 0.45, filterFreq: 3500 }, 0.04);
      p({ freq: 880, duration: 0.3, type: "sine", volume: 0.05, attack: 0.1, release: 0.28, filterFreq: 4000 }, 0.18);
    },
    success() {
      p({ freq: 392, duration: 0.4, type: "sine", volume: 0.16, attack: 0.04, release: 0.36, filterFreq: 3500 });
      p({ freq: 587, duration: 0.5, type: "sine", volume: 0.14, attack: 0.05, release: 0.45, filterFreq: 3500 }, 0.12);
    },
    error() {
      p({ freq: 330, freqEnd: 220, duration: 0.32, type: "sine", volume: 0.15, attack: 0.03, release: 0.28, filterFreq: 2200 });
      p({ freq: 247, duration: 0.36, type: "triangle", volume: 0.07, attack: 0.04, release: 0.32, filterFreq: 2000 }, 0.08);
    },
    notification() {
      p({ freq: 659, duration: 0.16, type: "sine", volume: 0.13, attack: 0.025, release: 0.13, filterFreq: 4000 });
      p({ freq: 880, duration: 0.22, type: "sine", volume: 0.11, attack: 0.03, release: 0.18, filterFreq: 4000 }, 0.1);
    },
    messageReceived() {
      p({ freq: 587, duration: 0.18, type: "sine", volume: 0.12, attack: 0.025, release: 0.15, filterFreq: 3500 });
      p({ freq: 784, duration: 0.26, type: "sine", volume: 0.1, attack: 0.04, release: 0.22, filterFreq: 3500 }, 0.1);
    },
    updateArrived() {
      p({ freq: 523, duration: 0.18, type: "sine", volume: 0.15, attack: 0.03, release: 0.16, filterFreq: 3500 });
      p({ freq: 659, duration: 0.18, type: "sine", volume: 0.15, attack: 0.03, release: 0.16, filterFreq: 3500 }, 0.1);
      p({ freq: 784, duration: 0.18, type: "sine", volume: 0.15, attack: 0.03, release: 0.16, filterFreq: 3700 }, 0.2);
      p({ freq: 1047, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 4500 }, 0.3);
      p({ freq: 2093, duration: 0.3, type: "sine", volume: 0.04, attack: 0.05, release: 0.28, filterFreq: 6000 }, 0.3);
    },
    achievementBronze() {
      p({ freq: 523, duration: 0.3, type: "sine", volume: 0.16, attack: 0.03, release: 0.27, filterFreq: 3200 });
      p({ freq: 784, duration: 0.34, type: "sine", volume: 0.12, attack: 0.04, release: 0.3, filterFreq: 3200 }, 0.07);
    },
    achievementSilver() {
      p({ freq: 587, duration: 0.32, type: "sine", volume: 0.16, attack: 0.03, release: 0.29, filterFreq: 3500 });
      p({ freq: 740, duration: 0.32, type: "sine", volume: 0.16, attack: 0.04, release: 0.28, filterFreq: 3500 }, 0.09);
      p({ freq: 880, duration: 0.42, type: "sine", volume: 0.18, attack: 0.05, release: 0.38, filterFreq: 3700 }, 0.18);
    },
    achievementGold() {
      p({ freq: 659, duration: 0.34, type: "sine", volume: 0.18, attack: 0.04, release: 0.3, filterFreq: 3700 });
      p({ freq: 831, duration: 0.34, type: "sine", volume: 0.18, attack: 0.04, release: 0.3, filterFreq: 3700 }, 0.1);
      p({ freq: 988, duration: 0.34, type: "sine", volume: 0.18, attack: 0.04, release: 0.3, filterFreq: 4000 }, 0.2);
      p({ freq: 1319, duration: 0.5, type: "sine", volume: 0.18, attack: 0.05, release: 0.46, filterFreq: 5000 }, 0.3);
      p({ freq: 2637, duration: 0.4, type: "sine", volume: 0.05, attack: 0.06, release: 0.38, filterFreq: 6000 }, 0.3);
    },
    achievementPlatinum() {
      p({ freq: 130, duration: 0.9, type: "sine", volume: 0.1, attack: 0.08, release: 0.85, filterFreq: 800 });
      p({ freq: 349, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3700 });
      p({ freq: 440, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3700 }, 0.1);
      p({ freq: 523, duration: 0.4, type: "sine", volume: 0.18, attack: 0.05, release: 0.36, filterFreq: 3800 }, 0.2);
      p({ freq: 392, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3800 }, 0.32);
      p({ freq: 587, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3800 }, 0.42);
      p({ freq: 523, duration: 0.7, type: "sine", volume: 0.2, attack: 0.06, release: 0.66, filterFreq: 4500 }, 0.6);
      p({ freq: 659, duration: 0.7, type: "sine", volume: 0.18, attack: 0.06, release: 0.66, filterFreq: 4500 }, 0.6);
      p({ freq: 784, duration: 0.7, type: "sine", volume: 0.18, attack: 0.07, release: 0.66, filterFreq: 4500 }, 0.6);
      p({ freq: 1047, duration: 0.7, type: "sine", volume: 0.16, attack: 0.07, release: 0.66, filterFreq: 5500 }, 0.6);
      p({ freq: 2093, duration: 0.6, type: "sine", volume: 0.05, attack: 0.08, release: 0.55, filterFreq: 7000 }, 0.6);
      p({ freq: 3136, duration: 0.5, type: "sine", volume: 0.03, attack: 0.08, release: 0.45, filterFreq: 8000 }, 0.6);
    },
    achievementMilestone() {
      p({ freq: 587, duration: 0.16, type: "sine", volume: 0.12, attack: 0.025, release: 0.13, filterFreq: 3500 });
      p({ freq: 740, duration: 0.22, type: "sine", volume: 0.1, attack: 0.03, release: 0.18, filterFreq: 3500 }, 0.08);
    },
  };
}

// ─── Pack 2 : Arcade (8-bit retro) ───────────────────────────────────
//
// Identité : square waves brutes, attaques rapides, durées courtes.
// Filtre passe-bas plus permissif (5-7 kHz) pour laisser passer les
// harmoniques aiguës. Volume slightly lower car les square wavetones
// sont harmoniquement plus riches.

function buildArcade(getEnabled: () => boolean): SoundpackImpl {
  const p = (tone: Tone, delay = 0) => playTone(tone, delay, getEnabled());
  return {
    hover() {
      p({ freq: 660, duration: 0.04, type: "square", volume: 0.04, attack: 0.005, release: 0.035, filterFreq: 5000 });
    },
    click() {
      p({ freq: 440, freqEnd: 880, duration: 0.06, type: "square", volume: 0.1, attack: 0.005, release: 0.055, filterFreq: 6000 });
    },
    launch() {
      p({ freq: 220, freqEnd: 880, duration: 0.18, type: "square", volume: 0.1, attack: 0.01, release: 0.16, filterFreq: 6000 });
      p({ freq: 440, freqEnd: 1320, duration: 0.18, type: "square", volume: 0.08, attack: 0.01, release: 0.16, filterFreq: 6000 }, 0.04);
    },
    success() {
      p({ freq: 523, duration: 0.08, type: "square", volume: 0.1, attack: 0.005, release: 0.075, filterFreq: 5500 });
      p({ freq: 659, duration: 0.08, type: "square", volume: 0.1, attack: 0.005, release: 0.075, filterFreq: 5500 }, 0.06);
      p({ freq: 784, duration: 0.12, type: "square", volume: 0.1, attack: 0.005, release: 0.115, filterFreq: 6000 }, 0.12);
    },
    error() {
      p({ freq: 220, freqEnd: 110, duration: 0.18, type: "square", volume: 0.1, attack: 0.005, release: 0.17, filterFreq: 4000 });
    },
    notification() {
      p({ freq: 880, duration: 0.06, type: "square", volume: 0.08, attack: 0.005, release: 0.055, filterFreq: 6000 });
      p({ freq: 1175, duration: 0.08, type: "square", volume: 0.08, attack: 0.005, release: 0.075, filterFreq: 6500 }, 0.04);
    },
    messageReceived() {
      p({ freq: 587, duration: 0.07, type: "square", volume: 0.08, attack: 0.005, release: 0.065, filterFreq: 5500 });
      p({ freq: 784, duration: 0.1, type: "square", volume: 0.08, attack: 0.005, release: 0.095, filterFreq: 5500 }, 0.05);
    },
    updateArrived() {
      // Power-up arpeggio C-E-G-C
      p({ freq: 523, duration: 0.07, type: "square", volume: 0.1, attack: 0.005, release: 0.065, filterFreq: 5500 });
      p({ freq: 659, duration: 0.07, type: "square", volume: 0.1, attack: 0.005, release: 0.065, filterFreq: 5500 }, 0.05);
      p({ freq: 784, duration: 0.07, type: "square", volume: 0.1, attack: 0.005, release: 0.065, filterFreq: 5500 }, 0.1);
      p({ freq: 1047, duration: 0.14, type: "square", volume: 0.12, attack: 0.005, release: 0.13, filterFreq: 6500 }, 0.15);
    },
    achievementBronze() {
      p({ freq: 523, duration: 0.1, type: "square", volume: 0.1, attack: 0.005, release: 0.095, filterFreq: 5500 });
      p({ freq: 784, duration: 0.14, type: "square", volume: 0.1, attack: 0.005, release: 0.13, filterFreq: 5500 }, 0.06);
    },
    achievementSilver() {
      p({ freq: 587, duration: 0.08, type: "square", volume: 0.1, attack: 0.005, release: 0.075, filterFreq: 5500 });
      p({ freq: 740, duration: 0.08, type: "square", volume: 0.1, attack: 0.005, release: 0.075, filterFreq: 5500 }, 0.06);
      p({ freq: 880, duration: 0.12, type: "square", volume: 0.12, attack: 0.005, release: 0.115, filterFreq: 6000 }, 0.12);
    },
    achievementGold() {
      p({ freq: 659, duration: 0.08, type: "square", volume: 0.12, attack: 0.005, release: 0.075, filterFreq: 5500 });
      p({ freq: 831, duration: 0.08, type: "square", volume: 0.12, attack: 0.005, release: 0.075, filterFreq: 5500 }, 0.06);
      p({ freq: 988, duration: 0.08, type: "square", volume: 0.12, attack: 0.005, release: 0.075, filterFreq: 5500 }, 0.12);
      p({ freq: 1319, duration: 0.18, type: "square", volume: 0.14, attack: 0.005, release: 0.17, filterFreq: 6500 }, 0.18);
    },
    achievementPlatinum() {
      // Arpège ascendant lent + descente rapide
      p({ freq: 261, duration: 0.1, type: "square", volume: 0.1, attack: 0.005, release: 0.095, filterFreq: 4500 });
      p({ freq: 329, duration: 0.1, type: "square", volume: 0.1, attack: 0.005, release: 0.095, filterFreq: 5000 }, 0.08);
      p({ freq: 392, duration: 0.1, type: "square", volume: 0.1, attack: 0.005, release: 0.095, filterFreq: 5500 }, 0.16);
      p({ freq: 523, duration: 0.1, type: "square", volume: 0.12, attack: 0.005, release: 0.095, filterFreq: 6000 }, 0.24);
      p({ freq: 784, duration: 0.1, type: "square", volume: 0.12, attack: 0.005, release: 0.095, filterFreq: 6500 }, 0.32);
      p({ freq: 1047, duration: 0.2, type: "square", volume: 0.14, attack: 0.005, release: 0.19, filterFreq: 7000 }, 0.4);
    },
    achievementMilestone() {
      p({ freq: 659, duration: 0.06, type: "square", volume: 0.08, attack: 0.005, release: 0.055, filterFreq: 5500 });
      p({ freq: 880, duration: 0.08, type: "square", volume: 0.08, attack: 0.005, release: 0.075, filterFreq: 6000 }, 0.05);
    },
  };
}

// ─── Pack 3 : Minimal (un seul tone par-tout) ────────────────────────
//
// Identité : un click générique pour tout ce qui ne doit pas faire
// trop de bruit, et un succès/erreur très discret. Les achievements
// utilisent un ping court neutre. Pas adapté pour un crew bruyant
// mais idéal pour qui trouve le launcher trop sonore.

function buildMinimal(getEnabled: () => boolean): SoundpackImpl {
  const p = (tone: Tone, delay = 0) => playTone(tone, delay, getEnabled());
  const tap = () =>
    p({ freq: 700, duration: 0.05, type: "sine", volume: 0.06, attack: 0.005, release: 0.045, filterFreq: 4000 });
  const ping = () =>
    p({ freq: 880, duration: 0.12, type: "sine", volume: 0.08, attack: 0.01, release: 0.11, filterFreq: 4500 });
  return {
    hover() {
      // No-op — minimal pack ne joue rien sur hover
    },
    click() {
      tap();
    },
    launch() {
      ping();
    },
    success() {
      ping();
    },
    error() {
      p({ freq: 200, duration: 0.12, type: "sine", volume: 0.08, attack: 0.01, release: 0.11, filterFreq: 2000 });
    },
    notification() {
      ping();
    },
    messageReceived() {
      ping();
    },
    updateArrived() {
      ping();
    },
    achievementBronze() {
      ping();
    },
    achievementSilver() {
      ping();
    },
    achievementGold() {
      ping();
    },
    achievementPlatinum() {
      ping();
    },
    achievementMilestone() {
      tap();
    },
  };
}

// ─── Registry des packs ──────────────────────────────────────────────

export type SoundpackMeta = {
  id: SoundpackId;
  label: string;
  description: string;
  build: (getEnabled: () => boolean) => SoundpackImpl;
};

export const SOUNDPACKS: SoundpackMeta[] = [
  {
    id: "softlofi",
    label: "Soft Lofi",
    description: "Sine waves chaudes, calme. Le pack par défaut.",
    build: buildSoftLofi,
  },
  {
    id: "arcade",
    label: "Arcade",
    description: "Square waves 8-bit, pétillant, retro.",
    build: buildArcade,
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Un seul ping discret pour tout. Idéal pour les sessions calmes.",
    build: buildMinimal,
  },
];

const LS_KEY = "soundpack.id.v1";

export function loadSoundpackId(): SoundpackId {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === "softlofi" || raw === "arcade" || raw === "minimal") {
      return raw;
    }
    return "softlofi";
  } catch {
    return "softlofi";
  }
}

export function saveSoundpackId(id: SoundpackId): void {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    /* ignore */
  }
}
