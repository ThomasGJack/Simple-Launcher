import type { DividerProps } from "@/types/moduleBlocks";
import { ModuleParticles } from "@/components/ui/Particles";

export function BlockDivider(props: DividerProps) {
  const style = props.style ?? "line";
  const thickness = props.thickness ?? 1;
  const color = props.color ?? "var(--module-primary, var(--color-accent))";

  if (style === "particles-strip") {
    return (
      <div className="relative h-16 w-full overflow-hidden">
        <ModuleParticles config={{ preset: "stars", color, density: 60 }} />
      </div>
    );
  }
  if (style === "glow") {
    return (
      <div className="flex justify-center">
        <div
          className="h-px w-full max-w-md"
          style={{
            height: thickness,
            background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
            boxShadow: `0 0 18px ${color}`,
          }}
        />
      </div>
    );
  }
  if (style === "gradient") {
    return (
      <div
        style={{
          height: thickness,
          background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
        }}
      />
    );
  }
  return <div className="border-t" style={{ borderColor: color, borderTopWidth: thickness }} />;
}
