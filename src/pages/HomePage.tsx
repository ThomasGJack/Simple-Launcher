import { motion } from "framer-motion";
import { Sparkles, Newspaper, Zap } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { PlayButton } from "@/components/ui/PlayButton";

export function HomePage() {
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="relative h-full overflow-y-auto">
      <section className="relative flex min-h-full flex-col justify-between p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-accent">
            <Sparkles className="size-3" />
            <span>Bienvenue {user?.displayName ?? "à toi"}</span>
          </div>

          <h1 className="font-display text-7xl leading-[0.95] text-fg-primary text-glow-accent">
            SIMPLE
            <br />
            LAUNCHER
          </h1>
          <p className="mt-6 max-w-xl text-lg text-fg-muted">
            Tous tes jeux et serveurs réunis dans une seule interface. Lance, mets à jour, partage avec tes amis.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <PlayButton
              label={user ? "EXPLORER" : "COMMENCER"}
              onClick={() => navigate({ name: user ? "library" : "login" })}
            />
            <button
              onClick={() => navigate({ name: "library" })}
              className="no-drag rounded-2xl glass px-6 py-5 text-sm font-medium uppercase tracking-[0.18em] text-fg-primary transition-colors hover:bg-white/[0.08]"
            >
              Bibliothèque
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="mt-16 grid grid-cols-3 gap-4"
        >
          <FeatureCard
            icon={Newspaper}
            title="Actus & MAJ"
            description="Suivi des dernières mises à jour de tous tes jeux."
          />
          <FeatureCard
            icon={Zap}
            title="Lancement instant"
            description="Un clic et c'est parti — exécutables locaux ou téléchargements cloud."
          />
          <FeatureCard
            icon={Sparkles}
            title="Pages custom"
            description="Chaque jeu a sa propre page stylée avec son thème et ses animations."
          />
        </motion.div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="group relative overflow-hidden rounded-2xl glass p-6"
    >
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 transition-shadow group-hover:shadow-[0_0_24px_var(--color-accent-soft)]">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <h3 className="font-medium text-fg-primary">{title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
    </motion.div>
  );
}
