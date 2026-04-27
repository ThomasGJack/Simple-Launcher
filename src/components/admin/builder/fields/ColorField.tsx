type Props = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
};

export function ColorField({ label, value, onChange }: Props) {
  return (
    <label className="block space-y-1">
      {label && <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>}
      <div className="flex items-center gap-2 rounded-lg bg-bg-elevated px-3 py-2 ring-1 ring-white/[0.06] focus-within:ring-accent/40">
        <input
          type="color"
          value={value || "#00d4ff"}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#00d4ff"
          className="flex-1 bg-transparent text-sm font-mono focus:outline-none"
        />
      </div>
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="block space-y-1">
      {label && <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg bg-bg-elevated px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-bg-elevated px-3 py-2 ring-1 ring-white/[0.06]">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer accent-[var(--color-accent)]"
      />
    </label>
  );
}
