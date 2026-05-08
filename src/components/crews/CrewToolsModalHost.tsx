import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CrewToolsModal } from "./CrewToolsModal";

/**
 * Host monté une fois dans le tree (App.tsx) qui écoute l'event
 * global `crew-tools:open` et monte la `CrewToolsModal`. Permet
 * d'ouvrir la modal depuis n'importe où (CrewContextMenu,
 * CrewSettingsModal, sidebar, etc.) sans avoir à passer une callback.
 */
export function CrewToolsModalHost() {
  const [target, setTarget] = useState<{ crewId: string; crewName: string } | null>(
    null,
  );

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ crewId: string; crewName: string }>)
        .detail;
      if (detail?.crewId) setTarget(detail);
    };
    window.addEventListener("crew-tools:open", onOpen);
    return () => window.removeEventListener("crew-tools:open", onOpen);
  }, []);

  return (
    <AnimatePresence>
      {target && (
        <CrewToolsModal
          crewId={target.crewId}
          crewName={target.crewName}
          onClose={() => setTarget(null)}
        />
      )}
    </AnimatePresence>
  );
}
