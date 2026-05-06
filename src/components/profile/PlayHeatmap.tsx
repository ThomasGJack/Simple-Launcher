import { useEffect, useState } from "react";
import { watchHeatmap, type Heatmap } from "@/firebase/playHeatmap";
import { PlayHeatmapView } from "./PlayHeatmapView";

/**
 * Live wrapper — subscribes to the user's heatmap doc in Firestore
 * and forwards the result to PlayHeatmapView. Same external API as
 * before the split-refactor (signature unchanged) so existing
 * callers (Profile, PublicProfilePage) keep working.
 *
 * Le rendu lui-même vit dans `./PlayHeatmapView.tsx` — pur, sans
 * import Firebase, importable côté site web public sans tirer le
 * SDK Firebase dans le bundle.
 */
export function PlayHeatmap({
  uid,
  title,
  subtitle,
  totalOverride,
}: {
  uid: string;
  title?: string;
  subtitle?: string;
  totalOverride?: number;
}) {
  const [heatmap, setHeatmap] = useState<Heatmap>({
    cells: {},
    totalLaunches: 0,
    updatedAtMs: null,
  });

  useEffect(() => {
    if (!uid) return;
    return watchHeatmap(uid, setHeatmap);
  }, [uid]);

  return (
    <PlayHeatmapView
      heatmap={heatmap}
      title={title}
      subtitle={subtitle}
      totalOverride={totalOverride}
    />
  );
}

// Re-export for callers that want the pure view directly (e.g. site web).
export { PlayHeatmapView } from "./PlayHeatmapView";
