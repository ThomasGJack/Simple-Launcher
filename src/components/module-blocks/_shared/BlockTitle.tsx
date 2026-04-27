import { cn } from "@/lib/cn";

type Props = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  align?: "left" | "center" | "right";
  className?: string;
};

export function BlockTitle({ eyebrow, title, subtitle, align = "left", className }: Props) {
  if (!eyebrow && !title && !subtitle) return null;
  return (
    <div
      className={cn(
        "mb-6 space-y-2",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
    >
      {eyebrow && (
        <div
          className="text-xs uppercase tracking-[0.3em]"
          style={{ color: "var(--module-accent, var(--color-accent))" }}
        >
          {eyebrow}
        </div>
      )}
      {title && (
        <h2
          className="text-2xl font-bold sm:text-3xl"
          style={{ fontFamily: "var(--module-font-display, var(--font-display))" }}
        >
          {title}
        </h2>
      )}
      {subtitle && <p className="text-sm text-fg-muted sm:text-base">{subtitle}</p>}
    </div>
  );
}
