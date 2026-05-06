import { Minus, Square, X } from "lucide-react";

/**
 * Reproduction statique de la TitleBar du launcher (frameless Tauri
 * window). Utilisé dans la section LauncherMockup pour montrer à
 * quoi ressemble la fenêtre du launcher sans les imports Tauri.
 */
export function TitleBarMockup() {
  return (
    <div className="flex h-10 items-center justify-between gap-2 border-b border-white/[0.06] bg-bg-overlay px-3 backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs">
        <img src="/logo.png" alt="" className="size-5 rounded-md" />
        <span className="font-display text-[11px] tracking-[0.18em] text-fg-primary">
          SIMPLE LAUNCHER
        </span>
        <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold)] ring-1 ring-[color-mix(in_srgb,var(--color-gold)_28%,transparent)]">
          ★ Simple Games
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button className="grid size-7 place-items-center rounded text-fg-muted opacity-50 transition hover:bg-white/[0.06] hover:opacity-100">
          <Minus className="size-3.5" />
        </button>
        <button className="grid size-7 place-items-center rounded text-fg-muted opacity-50 transition hover:bg-white/[0.06] hover:opacity-100">
          <Square className="size-3" />
        </button>
        <button className="grid size-7 place-items-center rounded text-fg-muted opacity-50 transition hover:bg-danger/20 hover:text-danger hover:opacity-100">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
