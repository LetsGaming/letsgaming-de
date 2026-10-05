/** One page's numbers from GET /api/cms/sections. The tracker records per page, not per module. */
export interface SectionStat {
  key: string;
  modules: string[];
  views: number;
  medianDwellSeconds: number | null;
  medianDwellBucket: string | null;
  reach: number | null;
  depth: Record<"25" | "50" | "75" | "100", number>;
}

export interface SectionsResponse {
  source: "script";
  hours: number;
  from: string;
  to: string;
  visits: number;
  sections: SectionStat[];
}

/**
 * Where the stats of one page go on the canvas: always in the page strip, and on
 * a module only when it is the page's sole module (otherwise every module would
 * repeat the same numbers and read as per-module data).
 */
export function statsPlacement(stat: SectionStat | undefined): {
  strip: SectionStat | null;
  moduleId: string | null;
  perPage: boolean;
} {
  if (!stat) return { strip: null, moduleId: null, perPage: false };
  const single = stat.modules.length === 1;
  return { strip: stat, moduleId: single ? (stat.modules[0] ?? null) : null, perPage: stat.modules.length > 1 };
}

export function formatDwell(seconds: number | null): string {
  if (seconds === null) return "n/a";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function formatReach(reach: number | null): string {
  return reach === null ? "n/a" : `${Math.round(reach * 100)}%`;
}
