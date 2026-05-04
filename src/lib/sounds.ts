// Generative UI sounds with WebAudio (no audio files to bundle).
//
// ─── Style : Soft Lofi ────────────────────────────────────────────────
// Tous les sons partagent la même identité sonore "Soft Lofi" :
//   - Sine waves pures (occasionnellement triangle pour le grain)
//   - Filtre passe-bas systématique (2.5–5 kHz) pour un timbre chaud
//     et anti-fatigue auditive
//   - Attaque douce (15–60 ms) — jamais de "claque"
//   - Release long pour laisser respirer chaque note
//   - Pas de reverb / effets — l'enveloppe lente fait tout le travail
//   - Progressions harmoniques douces (quintes, IV-V-I, intervalles
//     consonants)
// L'objectif : confort sur de longues sessions, le launcher reste calme
// même en cas de notif fréquente.

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
  /** Lowpass cutoff (Hz). Defaults to 3500 — the Soft Lofi sweet spot
   *  that keeps fundamentals + first harmonics but rolls off harshness
   *  above. Pass a higher value (4500–6000) for the "bright" accents
   *  on achievement sparkles, lower (2000–2500) for muffled clicks. */
  filterFreq?: number;
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

  // Soft Lofi : lowpass filter on every tone, default cutoff 3.5 kHz.
  filter.type = "lowpass";
  filter.frequency.value = tone.filterFreq ?? 3500;
  filter.Q.value = 0.5; // Q kept low so the filter is smooth, not resonant

  const peak = tone.volume ?? 0.16;
  // Soft Lofi default attack is 25 ms (vs 5 ms for the original style)
  // — gives every sound a soft "swell-in" rather than a click.
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

export const sounds = {
  // Quick warm hover — A5 with soft attack so multiple hover hits in
  // sequence blend rather than chatter.
  hover() {
    play({ freq: 440, duration: 0.09, type: "sine", volume: 0.05, attack: 0.02, release: 0.07, filterFreq: 3000 });
  },
  // Soft tap : a dropping fifth (F4 → C4) — the descent gives the
  // "press confirmed" feel without being percussive.
  click() {
    play({ freq: 350, freqEnd: 250, duration: 0.16, type: "sine", volume: 0.16, attack: 0.015, release: 0.14, filterFreq: 2800 });
  },
  // Launch : warm fifth swell rising over a third of a second — the
  // long ramp suggests a process kicking off rather than a snap.
  launch() {
    play({ freq: 220, freqEnd: 440, duration: 0.45, type: "sine", volume: 0.16, attack: 0.06, release: 0.4, filterFreq: 3500 });
    play({ freq: 330, freqEnd: 660, duration: 0.5, type: "triangle", volume: 0.1, attack: 0.07, release: 0.45, filterFreq: 3500 }, 0.04);
    play({ freq: 880, duration: 0.3, type: "sine", volume: 0.05, attack: 0.1, release: 0.28, filterFreq: 4000 }, 0.18);
  },
  // Success : pure fifth interval (G4 + D5), long release. Reads as
  // "yep, done, all good" without celebration overkill — keeps the
  // ceiling for the achievement chimes.
  success() {
    play({ freq: 392, duration: 0.4, type: "sine", volume: 0.16, attack: 0.04, release: 0.36, filterFreq: 3500 });
    play({ freq: 587, duration: 0.5, type: "sine", volume: 0.14, attack: 0.05, release: 0.45, filterFreq: 3500 }, 0.12);
  },
  // Error : descending minor third E4 → C4, kept warm — never harsh,
  // because the launcher errors aren't critical (failed launch, etc).
  error() {
    play({ freq: 330, freqEnd: 220, duration: 0.32, type: "sine", volume: 0.15, attack: 0.03, release: 0.28, filterFreq: 2200 });
    play({ freq: 247, duration: 0.36, type: "triangle", volume: 0.07, attack: 0.04, release: 0.32, filterFreq: 2000 }, 0.08);
  },
  // Generic notification : soft bell ping (E5 → A5), equal weight on
  // both notes. Used for system events that aren't message-specific.
  notification() {
    play({ freq: 659, duration: 0.16, type: "sine", volume: 0.13, attack: 0.025, release: 0.13, filterFreq: 4000 });
    play({ freq: 880, duration: 0.22, type: "sine", volume: 0.11, attack: 0.03, release: 0.18, filterFreq: 4000 }, 0.1);
  },
  // Incoming DM : warmer + lower than `notification`, so the user can
  // tell at a glance whether a notif is "system" or "someone wrote me".
  // E5 → G5, with a longer tail.
  messageReceived() {
    play({ freq: 587, duration: 0.18, type: "sine", volume: 0.12, attack: 0.025, release: 0.15, filterFreq: 3500 });
    play({ freq: 784, duration: 0.26, type: "sine", volume: 0.1, attack: 0.04, release: 0.22, filterFreq: 3500 }, 0.1);
  },
  // Launcher update arrived : 4-note ascending sequence ending on a
  // brighter shimmer (filter opens up). More attention-grabbing than
  // `notification` because it's tied to a centered modal.
  updateArrived() {
    play({ freq: 523, duration: 0.18, type: "sine", volume: 0.15, attack: 0.03, release: 0.16, filterFreq: 3500 });   // C5
    play({ freq: 659, duration: 0.18, type: "sine", volume: 0.15, attack: 0.03, release: 0.16, filterFreq: 3500 }, 0.1); // E5
    play({ freq: 784, duration: 0.18, type: "sine", volume: 0.15, attack: 0.03, release: 0.16, filterFreq: 3700 }, 0.2); // G5
    play({ freq: 1047, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 4500 }, 0.3); // C6
    // Faint octave overtone — adds the "shimmer" in a Soft Lofi way :
    // very low volume, but bright enough through the open filter.
    play({ freq: 2093, duration: 0.3, type: "sine", volume: 0.04, attack: 0.05, release: 0.28, filterFreq: 6000 }, 0.3);
  },
  // ─── Achievement unlock jingles, one per tier ──────────────────────
  // All four use the same Soft Lofi vocabulary (sine, lowpass) but
  // grow in length, layers, and filter brightness as the tier
  // increases. The hierarchy is preserved : bronze < silver < gold <
  // platinum, both in audible weight and in musical complexity.

  // Bronze : a single warm dyad (C5 + G5), short. Modest, like
  // a quiet "well done" pat.
  achievementBronze() {
    play({ freq: 523, duration: 0.3, type: "sine", volume: 0.16, attack: 0.03, release: 0.27, filterFreq: 3200 });
    play({ freq: 784, duration: 0.34, type: "sine", volume: 0.12, attack: 0.04, release: 0.3, filterFreq: 3200 }, 0.07);
  },
  // Silver : 3-note triad (D5, F#5, A5), slightly brighter filter.
  achievementSilver() {
    play({ freq: 587, duration: 0.32, type: "sine", volume: 0.16, attack: 0.03, release: 0.29, filterFreq: 3500 });
    play({ freq: 740, duration: 0.32, type: "sine", volume: 0.16, attack: 0.04, release: 0.28, filterFreq: 3500 }, 0.09);
    play({ freq: 880, duration: 0.42, type: "sine", volume: 0.18, attack: 0.05, release: 0.38, filterFreq: 3700 }, 0.18);
  },
  // Gold : 4-note major arpeggio (E5, G#5, B5, E6) + faint octave
  // shimmer that opens the filter wide. Reads as "well achieved !".
  achievementGold() {
    play({ freq: 659, duration: 0.34, type: "sine", volume: 0.18, attack: 0.04, release: 0.3, filterFreq: 3700 });
    play({ freq: 831, duration: 0.34, type: "sine", volume: 0.18, attack: 0.04, release: 0.3, filterFreq: 3700 }, 0.1);
    play({ freq: 988, duration: 0.34, type: "sine", volume: 0.18, attack: 0.04, release: 0.3, filterFreq: 4000 }, 0.2);
    play({ freq: 1319, duration: 0.5, type: "sine", volume: 0.18, attack: 0.05, release: 0.46, filterFreq: 5000 }, 0.3);
    // Octave shimmer — not a hard sparkle, just a gentle gleam.
    play({ freq: 2637, duration: 0.4, type: "sine", volume: 0.05, attack: 0.06, release: 0.38, filterFreq: 6000 }, 0.3);
  },
  // Platinum : full IV-V-I cadence in C major, with deep sub-bass
  // (C3) and a high octave gleam. The sub-bass is what makes it
  // "feel" big without breaking the calm timbre.
  achievementPlatinum() {
    // Sub-bass C3 holds under everything for warmth.
    play({ freq: 130, duration: 0.9, type: "sine", volume: 0.1, attack: 0.08, release: 0.85, filterFreq: 800 });
    // F major chord (IV) → G major chord (V) → C major (I), bell
    // tones triggered as a slow arpeggio.
    play({ freq: 349, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3700 });          // F4
    play({ freq: 440, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3700 }, 0.1);     // A4
    play({ freq: 523, duration: 0.4, type: "sine", volume: 0.18, attack: 0.05, release: 0.36, filterFreq: 3800 }, 0.2);      // C5
    // V chord
    play({ freq: 392, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3800 }, 0.32);    // G4
    play({ freq: 587, duration: 0.36, type: "sine", volume: 0.16, attack: 0.04, release: 0.32, filterFreq: 3800 }, 0.42);    // D5
    // I chord — landing
    play({ freq: 523, duration: 0.7, type: "sine", volume: 0.2, attack: 0.06, release: 0.66, filterFreq: 4500 }, 0.6);       // C5
    play({ freq: 659, duration: 0.7, type: "sine", volume: 0.18, attack: 0.06, release: 0.66, filterFreq: 4500 }, 0.6);      // E5
    play({ freq: 784, duration: 0.7, type: "sine", volume: 0.18, attack: 0.07, release: 0.66, filterFreq: 4500 }, 0.6);      // G5
    play({ freq: 1047, duration: 0.7, type: "sine", volume: 0.16, attack: 0.07, release: 0.66, filterFreq: 5500 }, 0.6);     // C6
    // Faint high gleam — adds the platinum "premium" sheen without
    // breaking the calm timbre.
    play({ freq: 2093, duration: 0.6, type: "sine", volume: 0.05, attack: 0.08, release: 0.55, filterFreq: 7000 }, 0.6);     // C7
    play({ freq: 3136, duration: 0.5, type: "sine", volume: 0.03, attack: 0.08, release: 0.45, filterFreq: 8000 }, 0.6);     // G7
  },
  // Milestone (75–90 % progress toast) : same vocabulary as success,
  // but shorter and a tiny step lower so it doesn't feel like a full
  // unlock. Acts as a gentle "you're getting there" pat.
  achievementMilestone() {
    play({ freq: 587, duration: 0.16, type: "sine", volume: 0.12, attack: 0.025, release: 0.13, filterFreq: 3500 });
    play({ freq: 740, duration: 0.22, type: "sine", volume: 0.1, attack: 0.03, release: 0.18, filterFreq: 3500 }, 0.08);
  },
};

// Auto-init enabled flag from storage on import
getSoundsEnabled();
