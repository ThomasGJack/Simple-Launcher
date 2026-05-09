import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Layers, Pin } from "lucide-react";
import { showPip, hidePip, togglePip } from "@/lib/pip";
import { invoke } from "@tauri-apps/api/core";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Settings card pour la fenêtre Picture-in-Picture.
 * Mini-fenêtre flottante always-on-top qui affiche un feed condensé
 * (amis online + notifs récentes) par-dessus un jeu en borderless.
 *
 * Le user peut la toggle ici, ou bind un raccourci custom dans
 * Settings → Raccourcis (action `pip.toggle`).
 */
export function PipPanel() {
  const [visible, setVisible] = useState(false);

  // Poll l'état initial une fois — Tauri ne broadcast pas les
  // events de visibilité de fenêtre, donc on regarde via API window.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke<boolean>("plugin:window|is_visible", {
          label: "pip",
        }).catch(() => false);
        if (!cancelled) setVisible(res === true);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    sounds.click();
    try {
      await togglePip();
      setVisible((v) => !v);
    } catch (err) {
      console.warn("[pip] toggle failed:", err);
    }
  };

  const handleShow = async () => {
    sounds.click();
    try {
      await showPip();
      setVisible(true);
    } catch (err) {
      console.warn("[pip] show failed:", err);
    }
  };

  const handleHide = async () => {
    sounds.click();
    try {
      await hidePip();
      setVisible(false);
    } catch (err) {
      console.warn("[pip] hide failed:", err);
    }
  };

  return (
    <motion.div whileHover={{ x: 4 }} className="no-drag rounded-2xl glass p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300 ring-1 ring-violet-400/20">
          <Layers className="size-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-fg-primary">
              Picture-in-Picture
            </div>
            <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet-300 ring-1 ring-violet-400/30">
              Beta
            </span>
          </div>
          <div className="text-sm text-fg-muted">
            Mini-fenêtre flottante always-on-top avec tes amis en ligne et
            les dernières notifs. Idéale par-dessus un jeu en borderless.
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "no-drag inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            visible
              ? "bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/30 hover:bg-violet-400/25"
              : "bg-accent/15 text-accent ring-1 ring-accent/30 hover:bg-accent/25",
          )}
        >
          <Pin className="size-3.5" strokeWidth={2.4} />
          {visible ? "Cacher" : "Afficher"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-bg-base/30 p-3 ring-1 ring-white/[0.04]">
        <button
          type="button"
          onClick={handleShow}
          className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-fg-primary"
        >
          Afficher (test)
        </button>
        <button
          type="button"
          onClick={handleHide}
          className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-fg-primary"
        >
          Cacher
        </button>
      </div>

      <p className="mt-3 text-[11px] text-fg-dim">
        💡 Pour la binder à un raccourci clavier global, va dans{" "}
        <strong className="text-fg-muted">Paramètres → Raccourcis</strong> et
        configure l'action « Picture-in-Picture ». Drag le header de la PiP
        pour la repositionner.
      </p>
    </motion.div>
  );
}
