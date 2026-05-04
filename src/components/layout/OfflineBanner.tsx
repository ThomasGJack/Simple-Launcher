import { motion, AnimatePresence } from "framer-motion";
import { CloudOff, Lock } from "lucide-react";
import { useOnline } from "@/lib/online";
import { useAuthStore } from "@/store/auth";

/**
 * Sticky top banner shown whenever the launcher is in a degraded
 * connectivity state, i.e.:
 *  - The reachability probe in `lib/online.ts` reports `online: false`
 *    (no internet at all), or
 *  - We're rendering with a cached user from localStorage instead of a
 *    real Firebase auth (`mode === "offline"`), which can happen even
 *    if the network is technically reachable but Firebase Auth itself
 *    failed to hydrate within the boot timeout.
 *
 * The banner is non-dismissible — it disappears automatically the
 * moment we go back online + the auth listener fires with a real user.
 * That keeps the messaging honest and avoids the user wondering why
 * features are silently broken.
 */
export function OfflineBanner() {
  const online = useOnline();
  const mode = useAuthStore((s) => s.mode);
  const visible = !online || mode === "offline";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-400/30 backdrop-blur"
          role="status"
          aria-live="polite"
        >
          {mode === "offline" ? (
            <Lock className="size-3.5" />
          ) : (
            <CloudOff className="size-3.5" />
          )}
          <span>
            {mode === "offline"
              ? "Mode hors ligne — bibliothèque locale uniquement"
              : "Pas de connexion internet — fonctionnalités limitées"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
