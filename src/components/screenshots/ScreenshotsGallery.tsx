import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Trash2,
  Download,
  Edit2,
  Check,
  X,
  Filter,
} from "lucide-react";
import {
  watchScreenshots,
  deleteScreenshot,
  updateScreenshotCaption,
  type Screenshot,
} from "@/firebase/screenshots";
import { openImage } from "@/store/imageViewer";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Gallery des captures d'écran d'un user. Utilisée sur la profile
 * page propre (le user voit sa gallery + peut éditer caption /
 * supprimer) et sur la profile publique d'un autre user (read-only).
 *
 * Features :
 *  - Grid responsive (3-5 colonnes selon largeur)
 *  - Click sur miniature → lightbox plein écran via useImageViewer
 *  - Filtre par module (chips agrégés à partir des screenshots)
 *  - Edit caption inline (own gallery only)
 *  - Delete + Download per-screenshot (own gallery only)
 *  - Affichage moduleName + date relative en overlay sur la miniature
 */
export function ScreenshotsGallery({
  uid,
  isOwner,
}: {
  uid: string;
  isOwner: boolean;
}) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filterModule, setFilterModule] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; caption: string } | null>(
    null,
  );

  useEffect(() => {
    return watchScreenshots(uid, (s) => {
      setScreenshots(s);
      setLoaded(true);
    });
  }, [uid]);

  // Liste des modules présents dans la gallery — pour les chips de filtre.
  const moduleOptions = useMemo(() => {
    const counts = new Map<string, { count: number; name: string }>();
    for (const s of screenshots) {
      if (!s.moduleId) continue;
      const existing = counts.get(s.moduleId);
      if (existing) existing.count++;
      else counts.set(s.moduleId, { count: 1, name: s.moduleName ?? s.moduleId });
    }
    return Array.from(counts.entries()).map(([id, v]) => ({
      id,
      name: v.name,
      count: v.count,
    }));
  }, [screenshots]);

  const visible = useMemo(() => {
    if (!filterModule) return screenshots;
    return screenshots.filter((s) => s.moduleId === filterModule);
  }, [screenshots, filterModule]);

  const handleDelete = async (s: Screenshot) => {
    if (!confirm("Supprimer cette capture ?")) return;
    sounds.click();
    try {
      await deleteScreenshot(uid, s);
      sounds.success();
    } catch (err) {
      console.warn("[gallery] delete failed:", err);
      sounds.error();
    }
  };

  const handleSaveCaption = async () => {
    if (!editing) return;
    sounds.click();
    try {
      await updateScreenshotCaption(uid, editing.id, editing.caption);
      setEditing(null);
    } catch (err) {
      console.warn("[gallery] caption save failed:", err);
    }
  };

  const handleDownload = (s: Screenshot) => {
    sounds.click();
    const a = document.createElement("a");
    a.href = s.imageUrl;
    a.download = `simplelauncher-${s.id}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!loaded) {
    return (
      <div className="grid h-32 place-items-center text-fg-dim">
        <Camera className="size-6 animate-pulse" />
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-base/30 p-8 text-center ring-1 ring-white/[0.04]">
        <Camera className="mx-auto mb-2 size-8 text-fg-dim" />
        <p className="text-sm text-fg-muted">
          {isOwner
            ? "Aucune capture pour l'instant. Appuie sur F2 dans le launcher pour en faire une !"
            : "Cet user n'a pas de capture publique."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips par module (si y'a au moins 2 modules différents) */}
      {moduleOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="size-3 text-fg-dim" />
          <button
            onClick={() => setFilterModule(null)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] ring-1 transition",
              filterModule === null
                ? "bg-accent text-bg-base ring-accent shadow-[0_0_10px_var(--color-accent-soft)]"
                : "bg-white/[0.04] text-fg-muted ring-white/[0.06] hover:bg-white/[0.08]",
            )}
          >
            Tout ({screenshots.length})
          </button>
          {moduleOptions.map((m) => (
            <button
              key={m.id}
              onClick={() =>
                setFilterModule(m.id === filterModule ? null : m.id)
              }
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] ring-1 transition",
                filterModule === m.id
                  ? "bg-accent text-bg-base ring-accent shadow-[0_0_10px_var(--color-accent-soft)]"
                  : "bg-white/[0.04] text-fg-muted ring-white/[0.06] hover:bg-white/[0.08]",
              )}
            >
              {m.name} ({m.count})
            </button>
          ))}
        </div>
      )}

      {/* Grid de miniatures */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <AnimatePresence>
          {visible.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="group relative aspect-video overflow-hidden rounded-xl bg-bg-base/40 ring-1 ring-white/[0.06] hover:ring-accent/40 transition-shadow hover:shadow-[0_0_18px_var(--color-accent-soft)]"
            >
              {/* Click image → lightbox */}
              <button
                type="button"
                onClick={() =>
                  openImage(s.imageUrl, s.caption ?? s.moduleName ?? null)
                }
                className="absolute inset-0 size-full"
                title="Voir en grand"
              >
                <img
                  src={s.imageUrl}
                  alt=""
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              </button>

              {/* Overlay infos en bas — caption / module / date */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg-base/95 via-bg-base/40 to-transparent p-2.5">
                {editing?.id === s.id ? (
                  <div className="pointer-events-auto flex items-center gap-1.5">
                    <input
                      value={editing.caption}
                      onChange={(e) =>
                        setEditing({ id: s.id, caption: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveCaption();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      autoFocus
                      maxLength={200}
                      placeholder="Caption…"
                      className="w-full rounded-md bg-bg-base/80 px-2 py-1 text-xs text-fg-primary outline-none ring-1 ring-accent/40"
                    />
                    <button
                      onClick={handleSaveCaption}
                      className="grid size-6 place-items-center rounded-md bg-accent text-bg-base"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="grid size-6 place-items-center rounded-md bg-white/[0.04] text-fg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    {s.caption && (
                      <div className="truncate text-xs text-fg-primary">
                        {s.caption}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
                      {s.moduleName && (
                        <>
                          <span className="truncate">{s.moduleName}</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="shrink-0">
                        {formatRelativeTime(s.createdAt)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons — visible only on hover, owner only */}
              {isOwner && editing?.id !== s.id && (
                <div className="pointer-events-auto absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({ id: s.id, caption: s.caption ?? "" });
                    }}
                    className="grid size-6 place-items-center rounded-md bg-bg-base/70 text-fg-muted ring-1 ring-white/[0.08] backdrop-blur hover:bg-bg-base/90 hover:text-fg-primary"
                    title="Éditer la caption"
                  >
                    <Edit2 className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(s);
                    }}
                    className="grid size-6 place-items-center rounded-md bg-bg-base/70 text-fg-muted ring-1 ring-white/[0.08] backdrop-blur hover:bg-bg-base/90 hover:text-fg-primary"
                    title="Télécharger"
                  >
                    <Download className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s);
                    }}
                    className="grid size-6 place-items-center rounded-md bg-bg-base/70 text-fg-muted ring-1 ring-white/[0.08] backdrop-blur hover:bg-danger/30 hover:text-danger"
                    title="Supprimer"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function formatRelativeTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 86_400_000 * 7)
    return `il y a ${Math.floor(diff / 86_400_000)} j`;
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
