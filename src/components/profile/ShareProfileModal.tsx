import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  QrCode,
  Share2,
  X,
} from "lucide-react";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { achievementFlags } from "@/lib/achievementFlags";

/**
 * Profile sharing modal — shows the public URL of the user's launcher
 * profile (`simplelaunche.web.app/u/{discordId}`) with a copy-to-
 * clipboard action and a generated QR code for sharing IRL.
 *
 * The QR code is rendered to a Data URL via the `qrcode` package, on a
 * ~280×280 canvas tinted to match the active accent color. Generation
 * is async but cheap (~10 ms), so we just gate the QR slot behind a
 * loading state.
 */
export function ShareProfileModal({
  open,
  onClose,
  discordId,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  discordId: string;
  displayName: string;
}) {
  const url = `https://simplelaunche.web.app/u/${discordId}`;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (!open) return;
    // Stamp the local achievement flag the very first time the modal is
    // opened. `markProfileShared` writes both the secret evangelist flag
    // and the visible qr-shared flag in one shot.
    achievementFlags.markProfileShared();
    achievementFlags.markQrShared();
    let cancelled = false;
    (async () => {
      setQrDataUrl(null);
      setQrError(null);
      try {
        // Lazy-loaded so the qrcode dep only ships in the chunk that
        // actually uses the modal. Cheap import (~30 KB gzipped).
        const QRCode = (await import("qrcode")).default;
        const dataUrl = await QRCode.toDataURL(url, {
          margin: 1,
          width: 280,
          // Use a high error-correction so the centred logo (if we ever
          // overlay one) doesn't break the scan.
          errorCorrectionLevel: "H",
          color: {
            // Foreground is the user's accent color (read from CSS var
            // at generate time). Falls back to cyan when unset. Computed
            // hex must be 6-char #RRGGBB — qrcode rejects shorthand.
            dark:
              getComputedStyle(document.documentElement)
                .getPropertyValue("--color-accent")
                .trim() || "#00d4ff",
            light: "#ffffff00",
          },
        });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
      } catch (err) {
        if (cancelled) return;
        setQrError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      sounds.success();
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      // Clipboard might be unavailable in some Tauri webview contexts —
      // fall back silently. The user still has the visible URL to
      // copy by hand.
    }
  };

  const handleOpen = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[92vw] max-w-md overflow-hidden rounded-3xl bg-bg-soft/95 ring-1 ring-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
              <div className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <Share2 className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Partager mon profil</div>
                <div className="text-xs text-fg-muted">
                  Lien public · {displayName}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* QR code */}
            <div className="flex justify-center px-6 pt-6">
              <div className="rounded-2xl bg-white p-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code pour ${url}`}
                    className="size-[260px]"
                  />
                ) : qrError ? (
                  <div className="grid size-[260px] place-items-center text-xs text-rose-500">
                    {qrError}
                  </div>
                ) : (
                  <div className="grid size-[260px] place-items-center text-fg-muted">
                    <QrCode className="size-12 animate-pulse" />
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 pt-3 text-center text-xs text-fg-dim">
              Scanne le QR depuis n'importe quel téléphone pour ouvrir le profil
            </div>

            {/* URL + actions */}
            <div className="space-y-2 p-6">
              <div className="flex items-center gap-2 rounded-xl bg-bg-base/60 px-3 py-2 ring-1 ring-white/[0.06]">
                <span className="truncate font-mono text-xs text-fg-primary">
                  {url}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    "ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition",
                    copyState === "copied"
                      ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
                      : "bg-bg-elevated text-fg-primary ring-white/[0.06] hover:bg-bg-base",
                  )}
                >
                  {copyState === "copied" ? (
                    <>
                      <Check className="size-3" /> Copié
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="size-3" /> Copier
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpen}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] transition-shadow"
              >
                <ExternalLink className="size-4" />
                Ouvrir dans le navigateur
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
