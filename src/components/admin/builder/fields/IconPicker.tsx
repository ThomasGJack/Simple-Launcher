import { useMemo, useState } from "react";
import { DynamicIcon, iconNames } from "lucide-react/dynamic";

// Popular picks shown when the search field is empty. Names are the
// kebab-case identifiers consumed by `lucide-react/dynamic`.
const POPULAR: string[] = [
  "sparkles", "zap", "star", "heart", "trophy", "gamepad-2", "rocket", "shield",
  "sword", "crown", "flame", "bolt", "crosshair", "compass", "gem", "skull",
  "coffee", "music", "award", "target", "palette", "wand-2", "moon", "sun",
];

/**
 * Convert legacy PascalCase values stored in older block configs (e.g.
 * "Sparkles", "Gamepad2") to the kebab-case slug expected by
 * `DynamicIcon` ("sparkles", "gamepad-2"). Idempotent on already-kebab
 * inputs.
 */
function toKebab(name: string): string {
  if (/^[a-z0-9-]+$/.test(name)) return name;
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

type Props = {
  label?: string;
  value?: string;
  onChange: (name: string) => void;
};

/**
 * Visual icon picker. Uses `lucide-react/dynamic` so each rendered tile
 * lazy-loads its own ~1 KB icon chunk on demand instead of pulling the
 * full ~580 KB icon catalog into the admin bundle. The trade-off is a
 * brief async paint per tile, which is fine in this context (admin-only,
 * one-time selection).
 */
export function IconPicker({ label, value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return POPULAR;
    return iconNames
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 64);
  }, [search]);

  const selectedSlug = value ? toKebab(value) : null;

  return (
    <div className="space-y-2">
      {label && <div className="text-xs uppercase tracking-wider text-fg-muted">{label}</div>}
      <div className="flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-bg-elevated ring-1 ring-white/[0.06]">
          {selectedSlug ? (
            <DynamicIcon name={selectedSlug as never} className="size-5 text-accent" />
          ) : (
            <span className="text-xs text-fg-dim">∅</span>
          )}
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
          const active = name === selectedSlug;
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
              <DynamicIcon name={name as never} className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
