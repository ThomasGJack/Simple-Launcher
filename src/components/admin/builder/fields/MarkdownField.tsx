import { useMemo, useState } from "react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

type Props = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
};

export function MarkdownField({ label, value, onChange }: Props) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const html = useMemo(() => sanitizeHtml(marked.parse(value ?? "", { async: false }) as string), [value]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        {label && <span className="text-xs uppercase tracking-wider text-fg-muted">{label}</span>}
        <div className="flex gap-1 rounded-md bg-bg-elevated p-0.5 ring-1 ring-white/[0.06]">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={"rounded px-2 py-0.5 text-xs " + (tab === "edit" ? "bg-accent/20 text-accent" : "text-fg-muted")}
          >
            Édition
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={"rounded px-2 py-0.5 text-xs " + (tab === "preview" ? "bg-accent/20 text-accent" : "text-fg-muted")}
          >
            Aperçu
          </button>
        </div>
      </div>
      {tab === "edit" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          className="w-full resize-y rounded-lg bg-bg-elevated px-3 py-2 font-mono text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/40"
        />
      ) : (
        <div
          className="prose prose-invert max-w-none rounded-lg bg-bg-elevated px-3 py-2 text-sm ring-1 ring-white/[0.06]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
