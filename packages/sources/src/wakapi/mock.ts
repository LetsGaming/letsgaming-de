/**
 * A stand-in Wakapi source for local dev when no instance is configured. Returns
 * the normalized shape directly (identity normalize), so the widget renders
 * end-to-end offline. Deterministic — no RNG — so dev builds are stable.
 */

import { ok } from "@lg/core";
import type { Source, WakapiData } from "@lg/core";

const DEMO: WakapiData = {
  range: "last 7 days",
  totalSeconds: 28 * 3600 + 15 * 60,
  languages: [
    { name: "TypeScript", pct: 46, seconds: 13 * 3600 },
    { name: "Vue", pct: 18, seconds: 5 * 3600 },
    { name: "Python", pct: 14, seconds: 4 * 3600 },
    { name: "CSS", pct: 12, seconds: 3.5 * 3600 },
    { name: "Shell", pct: 6, seconds: 1.5 * 3600 },
    { name: "SQL", pct: 4, seconds: 3600 },
  ],
};

export function wakapiMockSource(): Source<WakapiData, WakapiData> {
  return {
    id: "wakapi",
    targetArea: "work",
    schedule: "*/30 * * * *",
    fetch: async () => ok(DEMO),
    normalize: (raw) => raw,
  };
}
