// Generative UI sounds with WebAudio (no audio files to bundle).
// Each sound is a short envelope-shaped synth built on the fly.

let ctx: AudioContext | null = null;
let enabled = true;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
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

type Tone = {
  freq: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  freqEnd?: number;
};

function play(tone: Tone, delay = 0) {
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
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, tone.freqEnd), start + tone.duration);
  }

  filter.type = "lowpass";
  filter.frequency.value = 8000;
  filter.Q.value = 0.7;

  const peak = tone.volume ?? 0.18;
  const attack = tone.attack ?? 0.005;
  const release = tone.release ?? Math.max(0.04, tone.duration - attack);

  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  osc.start(start);
  osc.stop(start + tone.duration + 0.02);
}

export const sounds = {
  hover() {
    play({ freq: 880, freqEnd: 660, duration: 0.06, type: "sine", volume: 0.05 });
  },
  click() {
    play({ freq: 600, freqEnd: 240, duration: 0.1, type: "triangle", volume: 0.2 });
    play({ freq: 1800, freqEnd: 900, duration: 0.05, type: "sine", volume: 0.06 }, 0.005);
  },
  launch() {
    play({ freq: 220, freqEnd: 880, duration: 0.35, type: "sawtooth", volume: 0.18, release: 0.3 });
    play({ freq: 440, freqEnd: 1760, duration: 0.45, type: "sine", volume: 0.12, release: 0.4 }, 0.04);
  },
  success() {
    play({ freq: 660, duration: 0.12, type: "sine", volume: 0.16 });
    play({ freq: 880, duration: 0.18, type: "sine", volume: 0.16 }, 0.08);
  },
  error() {
    play({ freq: 220, freqEnd: 110, duration: 0.18, type: "square", volume: 0.16 });
  },
  notification() {
    play({ freq: 1320, duration: 0.08, type: "sine", volume: 0.14 });
    play({ freq: 1760, duration: 0.12, type: "sine", volume: 0.12 }, 0.06);
  },
  // Soft two-tone chime for a new private message arrival — distinct from
  // the "update arrived" arpeggio (which is louder + ascending). Goes E5 →
  // G5 with a tiny attack, low volume so it's not intrusive when chatting.
  messageReceived() {
    play({ freq: 660, duration: 0.07, type: "sine", volume: 0.1 });
    play({ freq: 880, duration: 0.1, type: "sine", volume: 0.09 }, 0.05);
  },
  // Cheerful 4-tone arpeggio used when a launcher update is detected in
  // real-time while the app is open (vs. on startup which uses `notification`).
  // More attention-grabbing than `notification` to match the centered modal.
  updateArrived() {
    play({ freq: 880, duration: 0.09, type: "sine", volume: 0.16 }); // A5
    play({ freq: 1108, duration: 0.09, type: "sine", volume: 0.16 }, 0.07); // C#6
    play({ freq: 1318, duration: 0.09, type: "sine", volume: 0.16 }, 0.14); // E6
    play({ freq: 1760, duration: 0.18, type: "sine", volume: 0.18, release: 0.2 }, 0.21); // A6
    // Faint shimmer overtone for sparkle
    play({ freq: 2637, duration: 0.12, type: "sine", volume: 0.06, release: 0.1 }, 0.21);
  },
  // ─── Achievement unlock jingles, one per tier ──────────────────────
  // Bronze : two-tone clink, like a coin landing. Modest and short.
  achievementBronze() {
    play({ freq: 523, duration: 0.08, type: "triangle", volume: 0.16 }); // C5
    play({ freq: 659, duration: 0.12, type: "triangle", volume: 0.14 }, 0.07); // E5
  },
  // Silver : 3-note rising arpeggio, slightly brighter timbre.
  achievementSilver() {
    play({ freq: 587, duration: 0.08, type: "sine", volume: 0.18 }); // D5
    play({ freq: 740, duration: 0.08, type: "sine", volume: 0.18 }, 0.08); // F#5
    play({ freq: 880, duration: 0.18, type: "sine", volume: 0.18, release: 0.2 }, 0.16); // A5
  },
  // Gold : ascending major triad with a sparkle overtone.
  achievementGold() {
    play({ freq: 659, duration: 0.09, type: "sine", volume: 0.2 }); // E5
    play({ freq: 831, duration: 0.09, type: "sine", volume: 0.2 }, 0.08); // G#5
    play({ freq: 988, duration: 0.09, type: "sine", volume: 0.2 }, 0.16); // B5
    play({ freq: 1319, duration: 0.22, type: "sine", volume: 0.18, release: 0.24 }, 0.24); // E6
    play({ freq: 2637, duration: 0.16, type: "sine", volume: 0.06, release: 0.14 }, 0.24); // shimmer
  },
  // Platinum : full ascending pentatonic with deep sub-bass and a
  // shimmering high overtone — feels like a "you did it!" finale.
  achievementPlatinum() {
    play({ freq: 130, duration: 0.45, type: "triangle", volume: 0.12, release: 0.42 }); // C3 sub
    play({ freq: 523, duration: 0.1, type: "sine", volume: 0.2 }); // C5
    play({ freq: 659, duration: 0.1, type: "sine", volume: 0.2 }, 0.09); // E5
    play({ freq: 784, duration: 0.1, type: "sine", volume: 0.2 }, 0.18); // G5
    play({ freq: 1047, duration: 0.1, type: "sine", volume: 0.2 }, 0.27); // C6
    play({ freq: 1319, duration: 0.32, type: "sine", volume: 0.22, release: 0.36 }, 0.36); // E6
    play({ freq: 2093, duration: 0.18, type: "sine", volume: 0.08, release: 0.18 }, 0.36); // C7 shimmer
    play({ freq: 3136, duration: 0.16, type: "sine", volume: 0.05, release: 0.16 }, 0.36); // G7 shimmer
  },
  // Quieter chime used for the 75 % / 90 % "almost there" milestone
  // toast — same shape as `success` but with a faint ascending tail to
  // suggest progress rather than completion.
  achievementMilestone() {
    play({ freq: 740, duration: 0.07, type: "sine", volume: 0.12 });
    play({ freq: 988, duration: 0.1, type: "sine", volume: 0.1 }, 0.06);
  },
};

// Auto-init enabled flag from storage on import
getSoundsEnabled();
