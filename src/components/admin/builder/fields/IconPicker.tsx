import { useMemo, useState } from "react";
import * as Icons from "lucide-react";

const POPULAR = [
  "Sparkles", "Zap", "Star", "Heart", "Trophy", "Gamepad2", "Rocket", "Shield",
  "Sword", "Crown", "Flame", "Bolt", "Crosshair", "Compass", "Gem", "Skull",
  "Coffee", "Music", "Award", "Target", "Palette", "Wand2", "Moon", "Sun",
];

type Props = {
  label?: string;
  value?: string;
  onChange: (name: string) => void;
};

export function IconPicker({ label, value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return POPULAR;
    return Object.keys(Icons)
      .filter((n) => n.toLowerCase().includes(q) && /^[A-Z]/.test(n))
      .slice(0, 64);
  }, [search]);

  const Selected =
    value && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[value];

  return (
    <div className="space-y-2">
      {label && <div className="text-xs uppercase tracking-wider text-fg-muted">{label}</div>}
      <div className="flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-bg-elevated ring-1 ring-white/[0.06]">
          {Selected ? <Selected className="size-5 text-accent" /> : <span className="text-xs text-fg-dim">∅</span>}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher une icône..."
          className="flex-1 rounded-lg bg-bg-elevated px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
        />
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto rounded-lg bg-bg-base/40 p-2 ring-1 ring-white/[0.06]">
        {filtered.map((name) => {
          const Comp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
          if (typeof Comp !== "function") return null;
          const active = name === value;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              title={name}
              className={
                "flex size-8 items-center justify-center rounded-md transition " +
                (active ? "bg-accent/20 text-accent ring-1 ring-accent/40" : "hover:bg-white/5 text-fg-muted")
              }
            >
              <Comp className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
