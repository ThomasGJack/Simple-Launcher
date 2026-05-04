/**
 * Track the distinct Minecraft versions a user has launched, so the
 * `mc-multiple-versions` achievement (3+ different versions) can fire.
 *
 * Stored as a JSON-serialized `Set<string>` in localStorage. The set is
 * small (one short string per version, e.g. "1.20.1"), so quota is a
 * non-issue. Updates are idempotent — re-launching a known version is a
 * no-op write.
 */

const KEY = "ach.mcVersions.v1";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((v) => typeof v === "string"));
  } catch {
    /* corrupt / unavailable — start fresh */
  }
  return new Set();
}

function save(set: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* non-fatal */
  }
}

export const mcVersionsTracker = {
  /** Record a new version launch. No-op if already known. */
  add(version: string | null | undefined) {
    const v = (version ?? "").trim();
    if (!v) return;
    const set = load();
    if (set.has(v)) return;
    set.add(v);
    save(set);
  },
  count(): number {
    return load().size;
  },
  list(): string[] {
    return Array.from(load());
  },
};
