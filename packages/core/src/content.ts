/**
 * CMS-owned content model (PROJECT.md §6 "Content model").
 *
 * These are the shapes the owner edits in the small custom CMS: bio,
 * status, links, projects, hobbies, "Right now", featured selection, nav labels.
 * Every human-authored string is `Localized` so German is a later content task,
 * not a migration. Prose fields (`lede`, `bio` paragraphs, project descriptions)
 * support a tiny, safe subset of markdown — `**bold**` only — which the frontend
 * renders without ever injecting raw HTML.
 *
 * Source-owned data (repos, languages, contribution graph, event feed, stats)
 * does NOT live here — see `source.ts`. The seam between the two is deliberate.
 */

import type { Localized } from "./i18n.js";
import type { PresenceSettings } from "./presence.js";

/** Site identity / config. Small and stable; edited rarely. */
export interface SiteMeta {
  name: string;
  handle: string;
  location: Localized;
  /** Eyebrow role line, e.g. "web developer". */
  role: Localized;
  /** Optional portrait/avatar — a reference to a library image asset. */
  avatar?: string;
}

/** The hero headline, split so one word can carry the highlight underline. */
export interface Headline {
  before: Localized;
  highlight: Localized;
  after: Localized;
}

/** The pulsing "currently building …" status. */
export interface Status {
  /** What the status verb is, e.g. "building". Kept editable for flexibility. */
  verb: Localized;
  /** The thing itself, e.g. "plantcare-tracker". */
  now: Localized;
}

export interface Link {
  id: string;
  label: Localized;
  href: string;
  /** Icon key resolved by the frontend icon set (e.g. "gh", "mail"). */
  icon?: string;
  /** Primary links get the filled, pressable button treatment. */
  primary?: boolean;
}

/** A curated project card. Distinct from a synced repo (see source.ts). */
export interface Project {
  id: string;
  name: string;
  /** Language/label pill, e.g. "TypeScript". */
  tag: Localized;
  description: Localized;
  /** Small meta chips, e.g. ["★ 3", "updated 2d ago"]. */
  meta: Localized[];
  href: string;
  /** Exactly one project should be featured — it gets the gradient hero card. */
  featured?: boolean;
  /**
   * Optional link to a synced repo by name. Not used at launch, but this is the
   * seam a future sync can use to enrich `meta` (stars, last-push) automatically.
   */
  repo?: string;
}

/** Visual tone for a hobby tile — maps to an accent in the design system. */
export type Tone = "purple" | "coral" | "mint" | "sun";

export interface Hobby {
  id: string;
  title: Localized;
  blurb: Localized;
  icon?: string;
  tone: Tone;
}

/** A "Right now" line: a key ("building") and a value. */
export interface NowItem {
  id: string;
  key: Localized;
  value: Localized;
}

/** The whole CMS-owned document. One row per site (single-user project). */
export interface SiteContent {
  meta: SiteMeta;
  headline: Headline;
  lede: Localized;
  status: Status;
  bio: Localized[];
  links: Link[];
  projects: Project[];
  hobbies: Hobby[];
  now: NowItem[];
  /** CMS-owned presence widget config (optional; resolver falls back to default). */
  presence?: PresenceSettings;
  /** CMS-owned image gallery — uploaded media placed on the site. */
  gallery?: GalleryItem[];
}

/** One image placed on the site via the CMS (chosen from the asset library). */
export interface GalleryItem {
  id: string;
  /** Which gallery module this image belongs to (supports multiple galleries). */
  module: string;
  /** Reference to a library asset, "asset:<id>". */
  asset: string;
  /** Optional localized caption (shown under the image; overrides the asset's). */
  caption: Localized;
}
