import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from "lucide-react";
import { useImageViewer } from "@/store/imageViewer";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Lightbox d'image plein écran — mounted une seule fois au top de l'app.
 * Quand `useImageViewer.url` est non-null, fade-in d'un overlay full-
 * screen avec l'image au centre. Le user peut :
 *   - Esc / click backdrop / X       → fermer
 *   - Click image                    → toggle 1× / 2× zoom (centered)
 *   - Boutons +/- / R                → zoom in / out / reset
 *   - Bouton Télécharger             → DL via Blob URL (in-app)
 *   - Bouton Ouvrir dans le browser  → fallback si l'user veut le voir
 *                                       dans un browser externe
 *
 * UX de "logiciel desktop" et pas "tab browser" : la modal a un design
 * cohérent avec le reste du launcher (rounded, glass, accent), pas une
 * URL bar ni des contrôles browser-like.
 */
export function ImageViewer() {
  const { url, caption, close } = useImageViewer();
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Reset zoom à chaque ouverture/fermeture
  useEffect(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [url]);

  // Esc pour fermer
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(z * 1.4, 5));
      } else if (e.key === "-") {
        setZoom((z) => Math.max(z / 1.4, 0.5));
      } else if (e.key === "0" || e.key.toLowerCase() === "r") {
        setZoom(1);
        setPanX(0);
        setPanY(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, close]);

  const handleDownload = async () => {
    if (!url) return;
    sounds.click();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      // Filename depuis l'URL ou fallback
      const fileName = guessFileName(url);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn("[image-viewer] download failed:", err);
      sounds.error();
    }
  };

  const handleOpenInBrowser = async () => {
    if (!url) return;
    sounds.click();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch (err) {
      console.warn("[image-viewer] open external failed:", err);
    }
  };

  const handleImageClick = () => {
    setZoom((z) => (z === 1 ? 2 : 1));
    setPanX(0);
    setPanY(0);
  };

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="no-drag fixed inset-0 z-[100] grid place-items-center bg-bg-base/90 backdrop-blur-md"
          onClick={close}
        >
          {/* Header — caption + close */}
          <header
            className="absolute left-0 right-0 top-0 flex items-center gap-3 bg-gradient-to-b from-bg-base/80 to-transparent px-6 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 flex-1">
              {caption && (
                <div className="truncate text-sm text-fg-primary">{caption}</div>
              )}
              <div className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                Aperçu image · {Math.round(zoom * 100)}%
              </div>
            </div>
            <button
              onClick={close}
              title="Fermer (Échap)"
              className="grid size-9 place-items-center rounded-lg bg-white/[0.06] text-fg-muted ring-1 ring-white/[0.08] transition hover:bg-white/[0.12] hover:text-fg-primary"
            >
              <X className="size-4" strokeWidth={2.4} />
            </button>
          </header>

          {/* Image au centre, zoomable + drag-pan quand zoomé */}
          <motion.img
            key={url}
            src={url}
            alt={caption ?? ""}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            referrerPolicy="no-referrer"
            drag={zoom > 1}
            dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
            dragElastic={0.1}
            onDrag={(_e, info) => {
              setPanX(info.offset.x);
              setPanY(info.offset.y);
            }}
            style={{
              transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
              cursor: zoom > 1 ? "grab" : "zoom-in",
              maxHeight: "82vh",
              maxWidth: "82vw",
            }}
            className="rounded-2xl object-contain shadow-[0_30px_80px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.06] transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              handleImageClick();
            }}
          />

          {/* Footer — controls */}
          <footer
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 bg-gradient-to-t from-bg-base/90 to-transparent px-6 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <ToolbarButton
              onClick={() => setZoom((z) => Math.max(z / 1.4, 0.5))}
              title="Dézoomer (-)"
              icon={ZoomOut}
            />
            <ToolbarButton
              onClick={() => {
                setZoom(1);
                setPanX(0);
                setPanY(0);
              }}
              title="Reset (R / 0)"
              icon={RotateCcw}
            />
            <ToolbarButton
              onClick={() => setZoom((z) => Math.min(z * 1.4, 5))}
              title="Zoomer (+)"
              icon={ZoomIn}
            />
            <div className="mx-2 h-6 w-px bg-white/[0.08]" />
            <ToolbarButton
              onClick={handleDownload}
              title="Télécharger l'image"
              icon={Download}
              label="Télécharger"
            />
            <ToolbarButton
              onClick={handleOpenInBrowser}
              title="Ouvrir dans le navigateur"
              icon={ExternalLink}
            />
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToolbarButton({
  onClick,
  title,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  title: string;
  icon: typeof X;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "no-drag inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-medium text-fg-muted ring-1 ring-white/[0.08] transition hover:bg-white/[0.12] hover:text-fg-primary",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {label && <span>{label}</span>}
    </button>
  );
}

function guessFileName(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const last = parts[parts.length - 1] || "image";
    // Strip query string, decode
    const cleaned = decodeURIComponent(last.split("?")[0]).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (cleaned.includes(".")) return cleaned;
    return `${cleaned}.png`;
  } catch {
    return "image.png";
  }
}
