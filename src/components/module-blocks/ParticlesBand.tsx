import { ModuleParticles } from "@/components/ui/Particles";
import type { ParticlesBandProps } from "@/types/moduleBlocks";

const HEIGHT: Record<NonNullable<ParticlesBandProps["height"]>, string> = {
  sm: "h-24",
  md: "h-40",
  lg: "h-64",
};

export function BlockParticlesBand(props: ParticlesBandProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl ${HEIGHT[props.height ?? "md"]}`}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--module-primary, var(--color-accent)) 25%, transparent), color-mix(in srgb, var(--module-accent, #c084fc) 25%, transparent))",
        }}
      />
      <ModuleParticles
        config={{
          preset: props.preset ?? "stars",
          color: props.color ?? "var(--module-primary, var(--color-accent))",
          density: props.density ?? 80,
        }}
      />
    </div>
  );
}
