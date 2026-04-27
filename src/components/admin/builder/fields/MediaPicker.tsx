import { useState } from "react";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { uploadModuleAsset } from "@/firebase/modules";

type Props = {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  moduleId: string;
  blockId: string;
  slot: string;
  accept?: string;
  preview?: "image" | "video" | "auto";
};

export function MediaPicker({
  label,
  value,
  onChange,
  moduleId,
  blockId,
  slot,
  accept = "image/*,video/*",
  preview = "auto",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadModuleAsset(moduleId, `block-${blockId}-${slot}`, file);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const previewType =
    preview === "auto"
      ? value && /\.(mp4|webm|mov)(\?|$)/i.test(value)
        ? "video"
        : "image"
      : preview;

  return (
    <div className="space-y-2">
      {label && <div className="text-xs uppercase tracking-wider text-fg-muted">{label}</div>}
      {value && (
        <div className="relative overflow-hidden rounded-lg ring-1 ring-white/[0.06]">
          {previewType === "video" ? (
            <video src={value} muted loop playsInline className="aspect-video w-full object-cover" />
          ) : (
            <img src={value} alt="" className="aspect-video w-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-bg-elevated px-3 py-3 text-sm text-fg-muted transition hover:border-accent/40 hover:text-fg-primary">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        <span>{busy ? "Upload…" : value ? "Remplacer" : "Importer un fichier"}</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ou colle une URL https://..."
        className="w-full rounded-lg bg-bg-elevated px-3 py-2 text-xs ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
      />
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
