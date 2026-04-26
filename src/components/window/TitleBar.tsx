import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";

export function TitleBar() {
  const { windowMaximized, setWindowMaximized } = useUIStore();

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setWindowMaximized);
    win.onResized(async () => {
      setWindowMaximized(await win.isMaximized());
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, [setWindowMaximized]);

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleToggleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  return (
    <div
      data-tauri-drag-region
      className="drag relative flex h-9 shrink-0 items-center justify-between bg-bg-base/80 px-3 backdrop-blur-md border-b border-white/[0.04] z-50"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 text-xs text-fg-muted font-medium tracking-wide">
        <div className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent-glow)]" />
        <span data-tauri-drag-region>Simple Launcher</span>
      </div>

      <div className="no-drag flex items-center">
        <WindowButton onClick={handleMinimize} aria-label="Minimiser">
          <Minus className="size-3.5" strokeWidth={2.5} />
        </WindowButton>
        <WindowButton onClick={handleToggleMaximize} aria-label={windowMaximized ? "Restaurer" : "Agrandir"}>
          {windowMaximized ? (
            <Copy className="size-3 -scale-x-100" strokeWidth={2.5} />
          ) : (
            <Square className="size-3" strokeWidth={2.5} />
          )}
        </WindowButton>
        <WindowButton onClick={handleClose} variant="danger" aria-label="Fermer">
          <X className="size-4" strokeWidth={2.5} />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  onClick,
  variant = "default",
  children,
  ...props
}: {
  onClick: () => void;
  variant?: "default" | "danger";
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-9 w-12 items-center justify-center text-fg-muted transition-colors duration-150",
        variant === "default" && "hover:bg-white/[0.06] hover:text-fg-primary",
        variant === "danger" && "hover:bg-danger hover:text-white",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
