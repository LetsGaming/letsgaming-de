/**
 * Pure formatting helpers used by the resolver. Kept dependency-free and tested
 * so the read API's output stays deterministic.
 *
 * Note on emphasis: prose fields keep their `**bold**` markers verbatim through
 * resolution — turning them into markup is a frontend concern (and the only safe
 * place to do it, since the API never emits raw HTML).
 */

/** 428 -> "428", 2100 -> "2.1k", 1_200_000 -> "1.2M". */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${trim(k)}k`;
  }
  const m = n / 1_000_000;
  return `${trim(m)}M`;
}

function trim(x: number): string {
  // One decimal, but drop a trailing ".0".
  const s = x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Short relative time from an ISO timestamp: "2d", "6d", "1w", "3mo", "2y". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days < 1) {
    if (hours >= 1) return `${hours}h`;
    if (mins >= 1) return `${mins}m`;
    return "now";
  }
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

/**
 * Bucket per-day contribution intensities into levels 0..4 (5 heatmap shades).
 * Thresholds are relative to the window's max so the graph reads well regardless
 * of absolute volume; a zero day is always level 0.
 */
export function bucketHeat(contributions: number[]): { levels: number[]; total: number } {
  const total = contributions.reduce((a, b) => a + b, 0);
  const max = contributions.reduce((a, b) => Math.max(a, b), 0);
  if (max === 0) return { levels: contributions.map(() => 0), total };
  const levels = contributions.map((v) => {
    if (v <= 0) return 0;
    const ratio = v / max;
    if (ratio > 0.8) return 4;
    if (ratio > 0.6) return 3;
    if (ratio > 0.35) return 2;
    return 1;
  });
  return { levels, total };
}
