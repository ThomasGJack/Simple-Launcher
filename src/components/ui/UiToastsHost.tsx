import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  dismissUiToast,
  subscribeUiToasts,
  type UiToast,
  type UiToastKind,
} from "@/lib/uiToasts";
import { cn } from "@/lib/cn";

/**
 * Renders the in-app toast stack at the bottom-right of the main
 * launcher window. Mounted once at the top of `<App>`. Toasts are
 * pushed via `pushUiToast()` from anywhere in the codebase ; the
 * host subscribes to the queue and animates entries in / out.
 */
export function UiToastsHost() {
  const [toasts, setToasts] = useState<UiToast[]>([]);

  useEffect(() => subscribeUiToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-[150] flex max-w-sm flex-col-reverse gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <UiToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const KIND_META: Record<
  UiToastKind,
  { icon: LucideIcon; ring: string; bg: string; text: string }
> = {
  info: {
    icon: Info,
    ring: "ring-accent/30",
    bg: "bg-accent/[0.08]",
    text: "text-accent",
  },
  success: {
    icon: CheckCircle2,
    ring: "ring-emerald-400/30",
    bg: "bg-emerald-400/[0.08]",
    text: "text-emerald-300",
  },
  warning: {
    icon: AlertTriangle,
    ring: "ring-amber-400/30",
    bg: "bg-amber-400/[0.08]",
    text: "text-amber-300",
  },
  error: {
    icon: AlertTriangle,
    ring: "ring-danger/40",
    bg: "bg-danger/[0.10]",
    text: "text-danger",
  },
};

function UiToastItem({ toast }: { toast: UiToast }) {
  const meta = KIND_META[toast.kind];
  const Icon = meta.icon;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn(
        "pointer-events-auto flex min-w-[280px] items-start gap-3 rounded-2xl border border-white/[0.06] bg-bg-soft/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl ring-1",
        meta.ring,
      )}
    >
      <div
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-xl ring-1",
          meta.bg,
          meta.text,
          meta.ring,
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg-primary">{toast.title}</div>
        {toast.description && (
          <div className="mt-0.5 line-clamp-3 text-[12px] text-fg-muted">
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              dismissUiToast(toast.id);
            }}
            className={cn(
              "mt-2 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors",
              meta.bg,
              meta.text,
              meta.ring,
              "hover:brightness-110",
            )}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => dismissUiToast(toast.id)}
        className="grid size-6 shrink-0 place-items-center rounded-md text-fg-dim transition-colors hover:bg-white/[0.06] hover:text-fg-primary"
        aria-label="Fermer"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}
