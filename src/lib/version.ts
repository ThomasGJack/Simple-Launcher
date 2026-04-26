// Calver version formatting.
//
// Internal semver: `YY.MMDD.S`
//   - YY     : year (2-digit, 26 = 2026)
//   - MMDD   : month*100 + day (e.g. 426 = April 26, 1231 = December 31)
//   - S      : intra-day sequence (0 = first release of the day, 1 = second…)
//
// Display calver: `vYY.MM.DD[.{S+1}]`
//   - First release of the day → `v26.04.26`
//   - Second                   → `v26.04.26.2`
//   - Third                    → `v26.04.26.3`
//
// We use this encoding because semver forbids leading zeros (`26.04.26` is
// invalid) and because semver only has three components, so the fourth one in
// `26.04.26.2` has to be folded into the patch as a sequence number.

export type ParsedVersion = {
  year: number;
  month: number;
  day: number;
  sequence: number; // 0-indexed
};

export function parseVersion(semver: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const mmdd = parseInt(match[2], 10);
  const sequence = parseInt(match[3], 10);
  const month = Math.floor(mmdd / 100);
  const day = mmdd % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, sequence };
}

export function formatDisplay(semver: string): string {
  const parsed = parseVersion(semver);
  if (!parsed) return `v${semver}`;
  const { year, month, day, sequence } = parsed;
  const yy = String(year).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const suffix = sequence > 0 ? `.${sequence + 1}` : "";
  return `v${yy}.${mm}.${dd}${suffix}`;
}

export function buildSemver(year: number, month: number, day: number, sequence: number): string {
  return `${year}.${month * 100 + day}.${sequence}`;
}

export function nextVersion(currentSemver: string, today: Date = new Date()): string {
  const yy = today.getUTCFullYear() % 100;
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();

  const current = parseVersion(currentSemver);
  if (current && current.year === yy && current.month === month && current.day === day) {
    return buildSemver(yy, month, day, current.sequence + 1);
  }
  return buildSemver(yy, month, day, 0);
}
