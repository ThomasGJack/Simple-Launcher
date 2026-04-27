import type { ParticlesConfig } from "@/types/module";
import { ModuleParticles } from "@/components/ui/Particles";

export type DraftModule = {
  type: "shortcut" | "hosted" | "minecraft";
  name: string;
  shortDescription?: string;
  iconUrl?: string;
  bannerUrl?: string;
  themePrimary?: string;
  themeAccent?: string;
  fontDisplay?: string;
  particles?: ParticlesConfig;
  buttonLabel?: string;
};

const TYPE_BADGE: Record<DraftModule["type"], { text: string; cls: string }> = {
  shortcut: { text: "Local", cls: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30" },
  hosted: { text: "Hébergé", cls: "bg-accent/15 text-accent ring-accent/30" },
  minecraft: { text: "Minecraft", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
};

export function ModulePreviewCard({ draft }: { draft: DraftModule }) {
  const themePrimary = draft.themePrimary;
  const fontDisplay = draft.fontDisplay;
  const badge = TYPE_BADGE[draft.type];
  const buttonLabel =
    draft.buttonLabel ?? (draft.type === "minecraft" ? "Voir" : draft.type === "hosted" ? "Installer" : "Jouer");

  return (
    <div
      className="relative aspect-[4/5] w-full max-w-[260px] overflow-hidden rounded-2xl glass"
      style={
        themePrimary
          ? ({
              boxShadow: `inset 0 0 30px ${themePrimary}33`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {draft.bannerUrl ? (
        <img src={draft.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: themePrimary
              ? `linear-gradient(135deg, ${themePrimary}40, transparent 60%, ${themePrimary}20)`
              : "linear-gradient(135deg, var(--color-accent-soft), transparent 60%, var(--color-accent-soft))",
          }}
        />
      )}

      {draft.particles && draft.particles.preset && draft.particles.preset !== ("none" as never) && (
        <ModuleParticles config={draft.particles} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex justify-start p-4">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1 backdrop-blur-md ${badge.cls}`}
        >
          {badge.text}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        {draft.iconUrl && (
          <img src={draft.iconUrl} alt="" className="mb-2 size-10 rounded-lg ring-1 ring-white/10" />
        )}
        <div
          className="text-base font-semibold text-fg-primary line-clamp-1"
          style={fontDisplay ? { fontFamily: fontDisplay } : undefined}
        >
          {draft.name || "Sans nom"}
        </div>
        {draft.shortDescription && (
          <p className="mt-0.5 text-xs text-fg-muted line-clamp-2">{draft.shortDescription}</p>
        )}
        <div className="mt-3">
          <button
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{
              background: themePrimary ?? "var(--color-accent)",
              color: "var(--color-bg-base)",
              boxShadow: `0 0 20px ${themePrimary ?? "var(--color-accent-soft)"}66`,
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04]" />
    </div>
  );
}
