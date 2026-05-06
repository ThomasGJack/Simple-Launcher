import { motion } from "framer-motion";
import { ANCHORS } from "../lib/anchors";
import { MOCK_MODULES } from "../data/mockModules";
import { ModuleCardDemo } from "../components/ModuleCardDemo";

/**
 * Section 04 — Démo Library. Grid de 6 ModuleCardDemo. Une carte
 * boucle son état (not-installed → downloading → installed) en
 * permanence pour montrer ce qui se passe quand on installe un
 * module.
 */
export function LibraryDemo() {
  return (
    <section id={ANCHORS.library} className="section">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Bibliothèque
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,4.5vw,48px)] leading-tight text-fg-primary">
            Une app pour{" "}
            <span className="text-glow-accent text-accent">tous tes jeux</span>.
          </h2>
          <p className="mt-5 text-lg text-fg-muted">
            Modpacks Minecraft (Vanilla, Fabric, Forge, NeoForge), apps custom,
            raccourcis Steam ou exécutables locaux. Chaque module a sa page,
            son thème, ses paramètres.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {MOCK_MODULES.map((mod, i) => (
            <ModuleCardDemo key={mod.id} module={mod} index={i} />
          ))}
        </motion.div>

        <div className="mt-10 text-center text-xs text-fg-dim">
          <span>↑ Une carte boucle son cycle d'install pour la démo.</span>
        </div>
      </div>
    </section>
  );
}
