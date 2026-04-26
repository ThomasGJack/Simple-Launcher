import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import type { ParticlesConfig } from "@/types/module";

let engineInitPromise: Promise<void> | null = null;

function ensureEngine(): Promise<void> {
  if (!engineInitPromise) {
    engineInitPromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }
  return engineInitPromise;
}

const PRESETS: Record<NonNullable<ParticlesConfig["preset"]>, (color: string, density: number) => ISourceOptions> = {
  stars: (color, density) => ({
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      number: { value: density },
      color: { value: color },
      shape: { type: "circle" },
      opacity: { value: { min: 0.2, max: 0.9 }, animation: { enable: true, speed: 0.6, sync: false } },
      size: { value: { min: 0.5, max: 2 } },
      move: { enable: true, speed: 0.15, direction: "none", random: true, outModes: "out" },
    },
    detectRetina: true,
  }),
  snow: (color, density) => ({
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      number: { value: density },
      color: { value: color },
      shape: { type: "circle" },
      opacity: { value: { min: 0.4, max: 0.8 } },
      size: { value: { min: 1, max: 3 } },
      move: {
        enable: true,
        speed: 1.2,
        direction: "bottom",
        random: true,
        straight: false,
        outModes: "out",
      },
    },
    detectRetina: true,
  }),
  fireflies: (color, density) => ({
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      number: { value: density },
      color: { value: color },
      shape: { type: "circle" },
      opacity: {
        value: { min: 0.3, max: 1 },
        animation: { enable: true, speed: 1, sync: false },
      },
      size: { value: { min: 1, max: 2.5 } },
      move: {
        enable: true,
        speed: 0.6,
        direction: "none",
        random: true,
        outModes: "bounce",
      },
    },
    detectRetina: true,
  }),
  sparkles: (color, density) => ({
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    fpsLimit: 60,
    particles: {
      number: { value: density },
      color: { value: color },
      shape: { type: "star" },
      opacity: { value: { min: 0.4, max: 1 }, animation: { enable: true, speed: 2 } },
      size: { value: { min: 1, max: 3 } },
      move: { enable: true, speed: 0.4, direction: "top", random: true, outModes: "out" },
      rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 6 } },
    },
    detectRetina: true,
  }),
};

export function ModuleParticles({ config }: { config?: ParticlesConfig }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureEngine().then(() => setReady(true));
  }, []);

  if (!ready || !config?.preset) return null;

  const color = config.color ?? "#00d4ff";
  const density = config.density ?? 60;
  const preset = config.preset;
  const buildOptions = PRESETS[preset];
  if (!buildOptions) return null;

  return (
    <Particles
      id={`module-particles-${preset}`}
      options={buildOptions(color, density)}
      className="pointer-events-none absolute inset-0 z-10"
    />
  );
}
