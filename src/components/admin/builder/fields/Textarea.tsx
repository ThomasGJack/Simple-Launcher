type Props = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
};

export function Textarea({ label, value, onChange, rows = 4, placeholder }: Props) {
  return (
    <label className="block space-y-1">
      {label && <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg bg-bg-elevated px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
      />
    </label>
  );
}
