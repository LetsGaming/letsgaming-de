/**
 * Modules (PROJECT.md §5 "Areas and modules").
 *
 * A module is a placeable content block. Features and data sources arrive as
 * modules dropped into a nav leaf — never as new tabs. Placement is the nav
 * tree's job (a leaf's `modules: string[]`), so a descriptor carries no area of
 * its own: the same module could be placed anywhere the IA decides.
 *
 * Adding a feature = one new `ModuleKind` + its resolver + a component. The nav
 * doesn't grow; a section grows inside an existing theme.
 */

import type { Localized } from "./i18n.js";

/**
 * Every module kind, as a typed lookup.
 *
 * Same reason as `AREA` (ia.ts): a kind spelled as a bare string typechecks
 * perfectly and fails at runtime. `MODULE_KIND.gallery` makes a rename a compile
 * error, and `MODULE_KINDS` gives the runtime the whole list — so a narrowing
 * predicate or a CMS dropdown can't hold a *stale* copy of it. The type derives
 * from the object rather than the other way round, because an array annotated
 * `ModuleKind[]` only checks that each value is valid, never that the list is
 * whole. That gap is how `isModuleKind` kept `highlights` (deleted) and never
 * grew `posts`.
 */
export const MODULE_KIND = {
  hero: "hero",
  teasers: "teasers",
  areas: "areas",
  featured: "featured",
  glance: "glance",
  activity: "activity",
  coding: "coding",
  projects: "projects",
  hobbies: "hobbies",
  now: "now",
  guestbook: "guestbook",
  presence: "presence",
  gallery: "gallery",
  bio: "bio",
  contact: "contact",
  posts: "posts",
  playtime: "playtime",
  music: "music",
  wrapped: "wrapped",
} as const;

export type ModuleKind = (typeof MODULE_KIND)[keyof typeof MODULE_KIND];

/** Every kind, for iteration and runtime narrowing. Derived — can't go stale. */
export const MODULE_KINDS: readonly ModuleKind[] = Object.values(MODULE_KIND);

/** Narrow an untrusted string (a DB row, an API payload) to a ModuleKind. */
export function isModuleKind(value: unknown): value is ModuleKind {
  return typeof value === "string" && (MODULE_KINDS as readonly string[]).includes(value);
}

export interface ModuleDescriptor {
  id: string;
  kind: ModuleKind;
  /** Optional heading override; each kind has a sensible default otherwise. */
  heading?: Localized;
  /** Optional small sub-note shown beside the heading. */
  note?: Localized;
  /** Per-kind configuration. Only `featured` has any today. */
  settings?: FeaturedSettings;
}

/** Which repos the Featured module shows. `auto` takes the first `count` pinned
 *  repos in pin order; `manual` takes `repos` in the order given. */
export interface FeaturedSettings {
  mode: "auto" | "manual";
  /** Repo names, used in manual mode. At most `FEATURED_MAX`. */
  repos: string[];
  count: 1 | 2 | 3;
}

export const FEATURED_MAX = 3;

export const DEFAULT_FEATURED_SETTINGS: FeaturedSettings = { mode: "auto", repos: [], count: 3 };

/** Coerce untrusted input to a valid `FeaturedSettings`: known keys only, count
 *  clamped to 1..3, repos trimmed, de-duplicated and capped. */
export function sanitizeFeaturedSettings(input: unknown): FeaturedSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const repos = Array.isArray(o.repos)
    ? [...new Set(o.repos.filter((r): r is string => typeof r === "string").map((r) => r.trim()).filter(Boolean))]
    : [];
  const n = Math.round(Number(o.count));
  return {
    mode: o.mode === "manual" ? "manual" : "auto",
    repos: repos.slice(0, FEATURED_MAX),
    count: (Number.isFinite(n) ? Math.min(FEATURED_MAX, Math.max(1, n)) : 3) as 1 | 2 | 3,
  };
}
