/**
 * Read-mostly CMS support endpoints: dashboard status, manual sync, editor
 * section stats, and the recorded-activity-name list. All authed.
 */

import { DWELL_BUCKETS, SOURCE_IDS, isLeaf, type DwellBucket, type NavNode } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/guard.js";
import type { ServerEnv } from "../env.js";
import { badRequest, notFound, unavailable } from "../errors.js";
import type { SyncRunner } from "../sync/runner.js";

const HOUR_MS = 3_600_000;
const RECENT_EDITS = 10;
const DEFAULT_SECTION_HOURS = 168;
const MAX_SECTION_HOURS = 8760;

/** The analytics-ingest row is read from `analytics_state`, not `sync_status`. */
const ANALYTICS_JOB = "analytics";

/** Human labels for `site_content_revisions.reason` (a column or table name, or `restore:<id>`). */
const REVISION_LABELS: Record<string, string> = {
  meta: "Site settings",
  headline: "Headline",
  lede: "Intro text",
  status: "Status line",
  bio: "Bio",
  music: "Listening settings",
  playtime: "Played settings",
  wrapped: "Wrapped settings",
  analytics: "Analytics settings",
  presence: "Presence settings",
  gallery: "Gallery",
  projects: "Projects",
  hobbies: "Hobbies",
  links: "Links",
  now_items: "Now items",
  "ia:nav": "Page layout",
  "ia:modules": "Section headings and settings",
  "ia:module-added": "Section added",
  "ia:module-removed": "Section removed",
};

export function revisionLabel(reason: string): string {
  if (reason.startsWith("restore:")) return `Restored revision ${reason.slice("restore:".length)}`;
  return REVISION_LABELS[reason] ?? reason;
}

/**
 * Representative seconds per dwell bucket, used to turn the bucket counters into
 * a median. The counters only say "how many visits fell in each bucket", so the
 * median is the midpoint of the bucket holding the 50th percentile. The open-ended
 * "10m+" bucket is assumed to be 15 minutes.
 */
export const DWELL_MIDPOINT_SECONDS: Record<DwellBucket, number> = {
  "<5s": 2.5,
  "5-15s": 10,
  "15-30s": 22.5,
  "30-60s": 45,
  "1-3m": 120,
  "3-10m": 390,
  "10m+": 900,
};

export function medianDwell(counts: Partial<Record<DwellBucket, number>>): {
  seconds: number;
  bucket: DwellBucket;
} | null {
  const total = DWELL_BUCKETS.reduce((n, b) => n + (counts[b] ?? 0), 0);
  if (total === 0) return null;
  let seen = 0;
  for (const bucket of DWELL_BUCKETS) {
    seen += counts[bucket] ?? 0;
    if (seen >= total / 2) return { seconds: DWELL_MIDPOINT_SECONDS[bucket], bucket };
  }
  return null;
}

function flatten(nodes: NavNode[], into: NavNode[] = []): NavNode[] {
  for (const n of nodes) {
    into.push(n);
    if (n.children) flatten(n.children, into);
  }
  return into;
}

const isoHour = (d: Date): string => d.toISOString().slice(0, 13);

type JobState = "ok" | "error" | "never";

interface StatusEntry {
  id: string;
  label: string;
  kind: "source" | "job" | "analytics";
  configured: boolean;
  mock: boolean;
  schedule: string | null;
  canSync: boolean;
  state: JobState;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export function registerCmsStatusRoutes(
  app: FastifyInstance,
  store: Store,
  env: ServerEnv,
  runner?: SyncRunner,
): void {
  const guard = { preHandler: requireAuth(env) };

  const sourceStatus = (): StatusEntry[] => {
    const rows = new Map(store.syncStatus.all().map((r) => [r.source, r]));
    const registered = new Map((runner?.listSources() ?? []).map((s) => [s.id, s]));
    const syncedAt = store.source.syncedAtBySource();

    const entry = (
      id: string,
      label: string,
      kind: StatusEntry["kind"],
      extra: { configured: boolean; mock?: boolean; schedule?: string | null; canSync?: boolean },
    ): StatusEntry => {
      const row = rows.get(id);
      // A snapshot that predates `sync_status` still proves the source worked.
      const lastSuccessAt = row?.lastSuccessAt ?? (kind === "source" ? (syncedAt[id as "github"] ?? null) : null);
      const lastError = row?.lastError ?? null;
      return {
        id,
        label,
        kind,
        configured: extra.configured,
        mock: extra.mock ?? false,
        schedule: extra.schedule ?? null,
        canSync: extra.canSync ?? false,
        state: lastError ? "error" : lastSuccessAt ? "ok" : "never",
        lastSuccessAt,
        lastErrorAt: row?.lastErrorAt ?? null,
        lastError,
      };
    };

    const labels: Record<string, string> = { github: "GitHub", wakapi: "Wakapi" };
    const out: StatusEntry[] = SOURCE_IDS.map((id) => {
      const reg = registered.get(id);
      return entry(id, labels[id] ?? id, "source", {
        configured: reg !== undefined || (runner === undefined && id === "github"),
        mock: reg?.mock ?? false,
        schedule: reg?.schedule ?? null,
        canSync: reg !== undefined,
      });
    });

    out.push(entry("presence", "Discord presence", "job", { configured: Boolean(env.discordUserId) }));
    out.push(entry("game-metadata", "Game metadata (RAWG)", "job", { configured: Boolean(env.rawg) }));
    out.push(entry("game-images", "Game images", "job", { configured: true }));

    const ingest = env.accessLog ? store.analytics.getIngestStatus(env.accessLog) : {};
    const lastSuccessAt = ingest.lastSuccessAt ?? null;
    out.push({
      id: ANALYTICS_JOB,
      label: "Analytics ingest",
      kind: "analytics",
      configured: Boolean(env.accessLog),
      mock: false,
      schedule: null,
      canSync: false,
      state: ingest.lastError ? "error" : lastSuccessAt ? "ok" : "never",
      lastSuccessAt,
      lastErrorAt: null,
      lastError: ingest.lastError ?? null,
    });
    return out;
  };

  app.get("/api/cms/status", guard, async () => ({
    sources: sourceStatus(),
    guestbook: store.guestbook.countsByStatus(),
    recentEdits: [
      ...store.content.listRevisions(RECENT_EDITS),
      ...store.ia.listRevisions(RECENT_EDITS).map((r) => ({ ...r, reason: `ia:${r.reason}` })),
    ]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .slice(0, RECENT_EDITS)
      .map((r) => ({ ...r, label: revisionLabel(r.reason) })),
  }));

  app.post<{ Params: { source: string } }>("/api/cms/sync/:source", guard, async (req) => {
    if (!runner) throw unavailable("The sync worker is not running.");
    const run = runner.runById(req.params.source);
    if (!run) throw notFound("Unknown source.");
    return run;
  });

  app.get<{ Querystring: { area?: string; hours?: string } }>("/api/cms/sections", guard, async (req) => {
    const hours = req.query.hours === undefined ? DEFAULT_SECTION_HOURS : Number(req.query.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_SECTION_HOURS) {
      throw badRequest(`hours must be an integer between 1 and ${MAX_SECTION_HOURS}.`);
    }

    const nav = flatten(store.ia.getNav());
    let nodes = nav;
    if (req.query.area !== undefined) {
      const root = nav.find((n) => n.id === req.query.area);
      if (!root) throw badRequest(`Unknown area "${req.query.area}".`);
      nodes = flatten([root]);
    }

    const now = new Date();
    const from = isoHour(new Date(now.getTime() - hours * HOUR_MS));
    const to = isoHour(now);
    const dwell = new Map<string, Partial<Record<DwellBucket, number>>>();
    for (const row of store.analytics.topHourly("dwell", from, to, 5000)) {
      const [id, bucket] = row.key.split("|");
      if (!id || !bucket) continue;
      const counts = dwell.get(id) ?? {};
      counts[bucket as DwellBucket] = row.count;
      dwell.set(id, counts);
    }
    const scrollRows = store.analytics.topHourly("scroll", from, to, 5000);
    const views = new Map(store.analytics.topHourly("tab", from, to, 5000).map((r) => [r.key, r.count]));
    // Only completed visits emit `session_dwell`, so this is the same "visits"
    // the analytics screen shows, and reach can read slightly low by construction.
    const visits = store.analytics.sumHourly("session_dwell", from, to);

    return {
      source: "script" as const,
      hours,
      from,
      to,
      visits,
      sections: nodes.map((n) => {
        const depth = { "25": 0, "50": 0, "75": 0, "100": 0 };
        for (const row of scrollRows) {
          const [id, d] = row.key.split("|");
          if (id === n.id && d && d in depth) depth[d as keyof typeof depth] = row.count;
        }
        const median = medianDwell(dwell.get(n.id) ?? {});
        return {
          key: n.id,
          modules: isLeaf(n) ? (n.modules ?? []) : [],
          views: views.get(n.id) ?? 0,
          medianDwellSeconds: median?.seconds ?? null,
          medianDwellBucket: median?.bucket ?? null,
          reach: visits > 0 ? Math.min(1, depth["25"] / visits) : null,
          depth,
        };
      }),
    };
  });

  app.get("/api/cms/activity-names", guard, async () => ({
    names: store.sessions.activityNames(),
  }));
}
