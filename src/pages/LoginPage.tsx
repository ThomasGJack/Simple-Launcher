import { motion } from "framer-motion";
import { useState } from "react";
import { AlertTriangle, CloudOff, Library } from "lucide-react";
import { loginWithDiscord } from "@/firebase/auth";
import { useUIStore } from "@/store/ui";
import { useOnline } from "@/lib/online";
import {
  cachedUserAsFirebaseUser,
  loadCachedUser,
} from "@/lib/offlineCache";
import { useAuthStore } from "@/store/auth";

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

export function LoginPage() {
  const navigate = useUIStore((s) => s.navigate);
  const setOfflineUser = useAuthStore((s) => s.setOfflineUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const cachedUser = loadCachedUser();

  const handleDiscordLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithDiscord();
      navigate({ name: "home" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[discord login]", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineEnter = () => {
    if (!cachedUser) return;
    setOfflineUser(cachedUserAsFirebaseUser(cachedUser));
    navigate({ name: "home" });
  };

  return (
    <div className="relative grid h-full place-items-center p-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl glass-strong p-10"
      >
        <div className="mb-8 text-center">
          <motion.img
            src="/logo.png"
            alt="Simple Launcher"
            className="mx-auto mb-5 size-24 rounded-2xl shadow-[0_0_48px_rgba(0,212,255,0.35)]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          />
          <h1 className="font-display text-3xl tracking-wide text-fg-primary">Connexion</h1>
          <p className="mt-2 text-sm text-fg-muted">Authentification via Discord uniquement.</p>
        </div>

        <motion.button
          whileHover={{ scale: loading || !online ? 1 : 1.02 }}
          whileTap={{ scale: loading || !online ? 1 : 0.98 }}
          onClick={handleDiscordLogin}
          disabled={loading || !online}
          className="no-drag flex w-full items-center justify-center gap-3 rounded-2xl bg-[#5865F2] px-6 py-4 font-medium text-white shadow-[0_0_24px_rgba(88,101,242,0.4)] transition-shadow hover:shadow-[0_0_36px_rgba(88,101,242,0.6)] disabled:opacity-60"
        >
          <DiscordIcon className="size-5" />
          <span>
            {loading
              ? "En attente de Discord…"
              : !online
                ? "Pas de connexion internet"
                : "Se connecter avec Discord"}
          </span>
        </motion.button>

        {/* Offline rescue: if the user has logged in before (we have a
            cached identity in localStorage) and we're currently offline,
            offer a one-tap path back into the app in read-only mode so
            they can still launch already-installed games. The button is
            hidden when online — Discord login is then the natural flow. */}
        {!online && cachedUser && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleOfflineEnter}
            className="no-drag mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.04] px-6 py-3 text-sm text-fg-primary ring-1 ring-white/[0.08] hover:bg-white/[0.08]"
          >
            <Library className="size-4" />
            <span>Continuer hors ligne ({cachedUser.displayName ?? "compte local"})</span>
          </motion.button>
        )}

        {!online && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex items-start gap-3 rounded-xl bg-amber-500/10 p-4 text-sm ring-1 ring-amber-500/30"
          >
            <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-300" strokeWidth={2.5} />
            <p className="text-fg-primary">
              Aucune connexion détectée. La connexion Discord nécessite internet ;
              {cachedUser
                ? " sinon clique sur 'Continuer hors ligne' pour accéder aux jeux déjà installés."
                : " réessaie quand le réseau sera de retour."}
            </p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-start gap-3 rounded-xl bg-danger/10 p-4 text-sm ring-1 ring-danger/30"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={2.5} />
            <p className="text-fg-primary">{error}</p>
          </motion.div>
        )}

        <p className="mt-6 text-center text-xs text-fg-dim">
          En te connectant, tu acceptes que ton pseudo et ton avatar Discord soient utilisés.
        </p>
      </motion.div>
    </div>
  );
}
