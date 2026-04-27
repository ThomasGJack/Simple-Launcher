import { useRef, useState } from "react";
import type { ComparisonProps } from "@/types/moduleBlocks";

export function BlockComparison(props: ComparisonProps) {
  const [pos, setPos] = useState(props.initialPosition ?? 50);
  const ref = useRef<HTMLDivElement>(null);
  const orientation = props.orientation ?? "horizontal";

  const onPointerMove = (e: React.PointerEvent) => {
    if (!ref.current || e.buttons !== 1) return;
    const rect = ref.current.getBoundingClientRect();
    if (orientation === "horizontal") {
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      setPos(Math.max(0, Math.min(100, x)));
    } else {
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPos(Math.max(0, Math.min(100, y)));
    }
  };

  if (!props.before.url || !props.after.url) {
    return (
      <div className="aspect-video rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-fg-muted">
        Définis les deux images (avant / après) dans l'inspecteur.
      </div>
    );
  }

  const clip =
    orientation === "horizontal"
      ? `polygon(0 0, ${pos}% 0, ${pos}% 100%, 0 100%)`
      : `polygon(0 0, 100% 0, 100% ${pos}%, 0 ${pos}%)`;

  return (
    <div
      ref={ref}
      className="relative aspect-video w-full select-none overflow-hidden rounded-2xl ring-1 ring-white/[0.06]"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
    >
      <img src={props.after.url} alt={props.after.label ?? ""} className="absolute inset-0 size-full object-cover" />
      <img
        src={props.before.url}
        alt={props.before.label ?? ""}
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: clip }}
      />
      <div
        className="pointer-events-none absolute"
        style={
          orientation === "horizontal"
            ? { top: 0, bottom: 0, left: `${pos}%`, width: 2, background: "var(--module-primary, var(--color-accent))" }
            : { left: 0, right: 0, top: `${pos}%`, height: 2, background: "var(--module-primary, var(--color-accent))" }
        }
      />
      <div
        className="absolute size-10 rounded-full ring-2"
        style={{
          left: orientation === "horizontal" ? `${pos}%` : "50%",
          top: orientation === "horizontal" ? "50%" : `${pos}%`,
          transform: "translate(-50%, -50%)",
          background: "var(--module-primary, var(--color-accent))",
          boxShadow: "0 0 0 4px rgba(255,255,255,0.15), 0 6px 24px rgba(0,0,0,0.4)",
        }}
      />
      {(props.before.label || props.after.label) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 text-xs">
          {props.before.label && (
            <span className="rounded-full glass px-3 py-1">{props.before.label}</span>
          )}
          {props.after.label && (
            <span className="ml-auto rounded-full glass px-3 py-1">{props.after.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
