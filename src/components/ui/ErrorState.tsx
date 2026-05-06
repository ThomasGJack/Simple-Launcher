import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";

/**
 * Generic error state with a retry button. Used for failed Firestore
 * loads, broken network requests, missing permissions, etc. The
 * caller passes a `retry` callback that gets invoked on click ; we
 * show a spinner while the retry is in flight to prevent rapid-fire
 * clicks.
 *
 * Two visual flavours :
 *   - `error` (default) : red triangle icon, "Échec du chargement"
 *   - `offline` : wifi-off icon, "Pas de connexion" — for cases
 *     where we know specifically that the network is down
 */
export function ErrorState({
  variant = "error",
  title,
  description,
  retry,
  retryLabel = "Réessayer",
}: {
  variant?: "error" | "offline";
  title?: string;
  description?: string;
  retry?: () => Promise<unknown> | void;
  retryLabel?: string;
}) {
  const [retrying, setRetrying] = useState(false);

  const Icon = variant === "offline" ? WifiOff : AlertTriangle;
  const defaultTitle =
    variant === "offline" ? "Pas de connexion" : "Échec du chargement";
  const defaultDesc =
    variant === "offline"
      ? "Vérifie ton wifi / ethernet, puis réessaie."
      : "Une erreur est survenue. Réessaie dans un instant ; si le problème persiste, redémarre le launcher.";

  const handleRetry = async () => {
    if (!retry || retrying) return;
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid place-items-center rounded-3xl glass p-8 text-center"
    >
      <div
        className="grid size-16 place-items-center rounded-full ring-1"
        style={{
          background: "color-mix(in srgb, var(--color-danger, #ff4d6d) 15%, transparent)",
          color: "var(--color-danger, #ff4d6d)",
          ["--tw-ring-color" as string]:
            "color-mix(in srgb, var(--color-danger, #ff4d6d) 30%, transparent)",
        } as React.CSSProperties}
      >
        <Icon className="size-7" strokeWidth={1.6} />
      </div>
      <h3 className="mt-4 font-display text-xl text-fg-primary">
        {title ?? defaultTitle}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-fg-muted">
        {description ?? defaultDesc}
      </p>
      {retry && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${retrying ? "animate-spin" : ""}`}
          />
          {retrying ? "Chargement…" : retryLabel}
        </button>
      )}
    </motion.div>
  );
}
