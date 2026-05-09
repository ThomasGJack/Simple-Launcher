// Audio devices helpers — wrap navigator.mediaDevices pour le voice chat.
// Persiste les choix mic/output de l'user en localStorage pour qu'ils
// restent stables d'une session à l'autre.

export type AudioDevice = {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
};

const LS_MIC = "voice.mic.deviceId.v1";
const LS_OUTPUT = "voice.output.deviceId.v1";

/**
 * Liste les périphériques audio disponibles. Note : sur Tauri (Edge
 * WebView2), les labels sont vides tant qu'un getUserMedia() n'a pas
 * été accordé — c'est une protection privacy. Donc première fois,
 * on demande la permission mic d'abord, puis on enumerate.
 */
export async function listAudioDevices(): Promise<AudioDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || (d.kind === "audioinput" ? "Micro inconnu" : "Sortie inconnue"),
      kind: d.kind as "audioinput" | "audiooutput",
    }));
}

/**
 * Demande permission micro + retourne un MediaStream. Constraints
 * configurées pour voice chat : echo cancellation, noise suppression,
 * auto gain — tous activés. Le user peut overrider le mic via
 * `getMicDeviceId()` (s'il a piqué un device dans Settings).
 */
export async function getMicStream(): Promise<MediaStream> {
  const deviceId = getMicDeviceId();
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

/** Stop un stream proprement (release the mic). */
export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* silent */
    }
  }
}

// ─── Persistence des choix user ────────────────────────────────────────

export function getMicDeviceId(): string | null {
  try {
    return localStorage.getItem(LS_MIC);
  } catch {
    return null;
  }
}

export function setMicDeviceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LS_MIC, id);
    else localStorage.removeItem(LS_MIC);
  } catch {
    /* ignore */
  }
}

export function getOutputDeviceId(): string | null {
  try {
    return localStorage.getItem(LS_OUTPUT);
  } catch {
    return null;
  }
}

export function setOutputDeviceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LS_OUTPUT, id);
    else localStorage.removeItem(LS_OUTPUT);
  } catch {
    /* ignore */
  }
}

/**
 * Apply le device output choisi sur un <audio> element. Edge supporte
 * setSinkId() depuis 2022 — c'est la méthode standard pour choisir
 * une carte son/casque pour la lecture spécifiquement.
 */
export async function applyOutputDevice(audioEl: HTMLAudioElement): Promise<void> {
  const id = getOutputDeviceId();
  if (!id) return;
  if (typeof (audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId !== "function") {
    return;
  }
  try {
    await (audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(id);
  } catch (err) {
    console.warn("[audioDevices] setSinkId failed:", err);
  }
}

// ─── Voice Activity Detection (VAD) léger ───────────────────────────────

/**
 * Crée un AnalyserNode sur un MediaStream pour détecter quand le user
 * parle. Le callback est appelé avec un boolean speaking, throttled
 * à 100ms. Utilisé pour pulser le ring autour de l'avatar du peer.
 *
 * Returns un cleanup fn qui stop l'analyse + déconnecte.
 */
export function createVoiceActivityDetector(
  stream: MediaStream,
  callback: (speaking: boolean) => void,
  threshold = 0.04,
): () => void {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let raf = 0;
  let lastSpeaking = false;
  let lastEmit = 0;

  try {
    ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
  } catch (err) {
    console.warn("[VAD] init failed:", err);
    return () => {};
  }

  const data = new Uint8Array(analyser.frequencyBinCount);

  const tick = () => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(data);
    // Compute RMS volume (0..1)
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const speaking = rms > threshold;
    const now = performance.now();
    if (speaking !== lastSpeaking && now - lastEmit > 100) {
      lastSpeaking = speaking;
      lastEmit = now;
      callback(speaking);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    try {
      analyser?.disconnect();
      void ctx?.close();
    } catch {
      /* silent */
    }
  };
}
