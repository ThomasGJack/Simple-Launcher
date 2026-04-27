import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebase } from "@/firebase/config";
import type { ChangelogEntry, ChangelogProps } from "@/types/moduleBlocks";

type Props = ChangelogProps & { moduleId?: string };

export function BlockChangelog(props: Props) {
  const [autoEntries, setAutoEntries] = useState<ChangelogEntry[]>([]);
  const useAuto = props.source === "auto-from-versions";

  useEffect(() => {
    if (!useAuto || !props.moduleId) return;
    const fb = getFirebase();
    if (!fb) return;
    const q = query(
      collection(fb.db, "modules", props.moduleId, "versions"),
      orderBy("releasedAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setAutoEntries(
        snap.docs.slice(0, props.limit ?? 20).map((d) => {
          const data = d.data();
          return {
            version: d.id,
            date: data.releasedAt?.toDate?.()?.toLocaleDateString("fr-FR") ?? "",
            notes: data.notes ?? [],
          };
        }),
      );
    });
  }, [useAuto, props.moduleId, props.limit]);

  const entries = useAuto ? autoEntries : (props.entries ?? []);
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-fg-muted">
        Aucune entrée de changelog.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.version} className="rounded-xl glass p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span
              className="text-lg font-semibold"
              style={{
                color: "var(--module-primary, var(--color-accent))",
                fontFamily: "var(--module-font-display, var(--font-display))",
              }}
            >
              v{entry.version}
            </span>
            <span className="text-xs text-fg-dim">{entry.date}</span>
          </div>
          {entry.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
              {entry.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
