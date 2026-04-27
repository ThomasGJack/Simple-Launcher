import { cn } from "@/lib/cn";

type Props = {
  label?: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "url";
  placeholder?: string;
  className?: string;
};

export function Input({ label, value, onChange, type = "text", placeholder, className }: Props) {
  return (
    <label className={cn("block space-y-1", className)}>
      {label && <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>}
      <input
        type={type}
        value={value as string | number}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-bg-elevated px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
      />
    </label>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block space-y-1">
      {label && <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg bg-bg-elevated px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
      />
    </label>
  );
}
