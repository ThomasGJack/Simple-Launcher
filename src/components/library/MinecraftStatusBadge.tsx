import { useMinecraftStatus } from "@/lib/minecraftStatus";
import { cn } from "@/lib/cn";

export function MinecraftStatusBadge({ address, compact = false }: { address: string; compact?: boolean }) {
  const status = useMinecraftStatus(address);
  if (!status) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.08] backdrop-blur-md",
      )}>
        <span className="size-1.5 rounded-full bg-fg-dim" />
        {compact ? "…" : "Vérification…"}
      </span>
    );
  }
  if (!status.online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-danger ring-1 ring-danger/30 backdrop-blur-md">
        <span className="size-1.5 rounded-full bg-danger" />
        {compact ? "Off" : "Hors ligne"}
      </span>
    );
  }
  const players = status.players;
  const label = players ? `${players.online}/${players.max}` : "En ligne";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-success ring-1 ring-success/30 backdrop-blur-md">
      <span className="size-1.5 rounded-full bg-success shadow-[0_0_8px_var(--color-success,#4ade80)]" />
      {label}
    </span>
  );
}
