/**
 * The read API's output shape (PROJECT.md §2.1 "Everything visible is
 * data-driven. The frontend renders normalized JSON; it never knows which API
 * data came from.").
 *
 * `SiteView` is fully *resolved*: strings are already localized for the
 * requested locale (no `Localized` left), source data is already normalized and
 * bucketed, relative times are pre-computed. The frontend is a dumb renderer: it
 * walks `nav`, and for each leaf's module ids it looks up `modules[id]` and
 * switches on `kind`. It never knows a module's data came from GitHub vs. the CMS.
 */

import type { PlaytimeView } from "./presence.js";
import type { Tone } from "./content.js";
import type { Locale } from "./i18n.js";
import type { ImageAssetView, GifAssetView } from "./assets.js";

export interface ProjectView {
  id: string;
  name: string;
  tag: string;
  description: string;
  meta: string[];
  href: string;
  featured: boolean;
}

export interface LinkView {
  id: string;
  label: string;
  href: string;
  icon?: string;
  /** Inline SVG markup when the icon is an uploaded asset (else use `icon`). */
  iconSvg?: string;
  primary: boolean;
}

export interface HobbyView {
  id: string;
  title: string;
  blurb: string;
  icon?: string;
  tone: Tone;
}

export interface NowView {
  id: string;
  key: string;
  value: string;
}

export interface StatView {
  value: string;
  /** e.g. "d" for a day suffix, rendered smaller. */
  unit?: string;
  label: string;
}

export interface LanguageView {
  name: string;
  pct: number;
}

export interface EventView {
  /** A release is an event. So is a merged PR, and a gist. These were a second
   *  lookalike feed ("Recently shipped") sorted by the same key as this one. */
  type: "commit" | "pr" | "star" | "repo" | "release" | "gist";
  text: string;
  meta?: string;
  /** ISO timestamp (kept for tooltips / machine use). */
  at: string;
  /** Pre-computed short relative time, e.g. "2d", "1w". */
  relative: string;
  /** Where the event points, when it has a destination (releases, PRs, gists). */
  href?: string;
}

/** Contribution heatmap, bucketed server-side to levels 0..4 (5 shades). */
export interface HeatView {
  /** Per-day level 0..4, oldest first. */
  levels: number[];
  /** Sum of raw contributions in the window, for the "N this year" caption. */
  total: number;
}

/** One blog post, newest first. Posts are markdown assets in the library; the
 *  renderer already exists at /md/[slug]. */
export interface PostView {
  slug: string;
  title: string;
  /** ISO timestamp. */
  at: string;
  relative: string;
  excerpt?: string;
  /** Display only — rendered as chips, not links. */
  tags: string[];
}

/** Internal: a release/PR/gist on the way into the merged event stream. */
export interface HighlightView {
  type: "release" | "pr" | "gist";
  /** Ready-to-read sentence, e.g. "Released plantcare-tracker v1.2.0". */
  text: string;
  /** Optional secondary label (tag, repo, or "N files"). */
  meta?: string;
  href: string;
  /** ISO timestamp (kept for tooltips / machine use). */
  at: string;
  /** Pre-computed short relative time, e.g. "3d". */
  relative: string;
}

/**
 * What a synced module knows about its own age.
 *
 * `stale` is the state that matters here. The brief's failure mode is "it goes
 * stale", so a module that can't tell fresh from old can't fail safely: it just
 * lies quietly. `never` is the true empty (no successful sync yet); `failed`
 * still carries the last-known data, because old-and-labelled beats blank.
 */
export type FreshnessState = "fresh" | "stale" | "empty" | "failed" | "never";

export interface FreshnessView {
  state: FreshnessState;
  /** ISO timestamp of the last successful sync, when there's been one. */
  syncedAt?: string;
  /** Pre-computed short relative age, e.g. "8m", "2d". */
  relative?: string;
  /** Which source this describes, e.g. "github". */
  source: string;
}

/** One approved guestbook entry, as shown publicly. */
export interface GuestbookEntryView {
  id: number;
  name: string;
  message: string;
  /** ISO timestamp (kept for tooltips / machine use). */
  at: string;
  /** Pre-computed short relative time, e.g. "3d". */
  relative: string;
}

/** Wakapi coding time, resolved for display. */
export interface CodingView {
  range: string;
  totalHours: number;
  languages: { name: string; pct: number; hours: number }[];
}

/**
 * What the *client* is allowed to know about presence. Deliberately minimal: no
 * Discord id, no category list — the browser never talks to Lanyard and never
 * learns what was disabled. `live` just says whether to poll the server's
 * already-filtered `/api/presence`; `steam` is included only when enabled.
 */
export interface PresenceModuleView {
  live: boolean;
  /** Owner identity for the Discord-style profile header (from meta). */
  name: string;
  handle: string;
  /** Optional portrait, resolved from meta.avatar (shared with the hero). */
  avatar?: ImageAssetView | GifAssetView;
  steam?: {
    playing?: { name: string; appId: number };
    recent: { name: string; appId: number; minutes2Weeks: number; iconUrl?: string }[];
  };
  /**
   * Playtime per game, Steam and non-Steam together, each saying where it came
   * from.
   *
   * `steam` above is the raw fortnight and stays — the widget's "recently on
   * Steam" list is a different claim than "what I've played". This is the merged
   * one: Steam's minutes where Steam has them (it counts hours Discord was closed),
   * observed minutes for everything else (Steam never saw them at all).
   *
   * `source` is on every entry because the two aren't interchangeable and a chart
   * that hides which is which is a chart that invites the wrong conclusion.
   */
  playtime?: PlaytimeView[];
}

/** One resolved gallery image: a client-ready picture spec plus its caption. */
export interface GalleryImageView {
  id: string;
  image: ImageAssetView | GifAssetView;
  caption: string;
}

/** One block of the bio: a paragraph of text, or an inline image. */
export type BioBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; image: ImageAssetView | GifAssetView };

export interface HeroView {
  eyebrow: string;
  headline: { before: string; highlight: string; after: string };
  lede: string;
  status: { verb: string; now: string };
  links: LinkView[];
  /** Optional portrait/avatar, resolved from meta.avatar. */
  avatar?: ImageAssetView | GifAssetView;
}

export interface ActivityView extends SectionMeta {
  stats: StatView[];
  contributions: HeatView;
  languages: LanguageView[];
  events: EventView[];
  /** Source labels feeding this module, e.g. ["GitHub"]. */
  sources: string[];
}

export interface SectionMeta {
  /** Present on modules fed by a Source. Absent on CMS-authored ones — local
   *  content can't be stale. */
  freshness?: FreshnessView;
  heading: string;
  note?: string;
}

/** Discriminated by `kind`; the frontend maps kind -> component. */
export type ResolvedModule =
  | { id: string; kind: "hero"; data: HeroView }
  | { id: string; kind: "featured"; data: SectionMeta & { project: ProjectView | null; moreHref: string } }
  | {
      id: string;
      kind: "glance";
      data: SectionMeta & { stats: StatView[]; latest?: EventView; moreHref: string };
    }
  | { id: string; kind: "activity"; data: ActivityView }
  | { id: string; kind: "posts"; data: SectionMeta & { posts: PostView[] } }
  | { id: string; kind: "coding"; data: SectionMeta & { coding: CodingView | null } }
  | { id: string; kind: "projects"; data: SectionMeta & { projects: ProjectView[]; githubUrl?: string } }
  | { id: string; kind: "hobbies"; data: SectionMeta & { hobbies: HobbyView[] } }
  | { id: string; kind: "now"; data: SectionMeta & { items: NowView[] } }
  | { id: string; kind: "guestbook"; data: SectionMeta & { entries: GuestbookEntryView[] } }
  | { id: string; kind: "presence"; data: SectionMeta & PresenceModuleView }
  | { id: string; kind: "playtime"; data: SectionMeta & PlaytimeModuleView }
  | { id: string; kind: "music"; data: SectionMeta & MusicModuleView }
  | { id: string; kind: "gallery"; data: SectionMeta & { images: GalleryImageView[] } }
  | { id: string; kind: "bio"; data: SectionMeta & { blocks: BioBlock[] } }
  | { id: string; kind: "contact"; data: SectionMeta & { links: LinkView[] } };

/**
 * The historical playtime module (features 02 + 03).
 *
 * Deliberately separate from `PresenceModuleView`, which is present-tense — "Right
 * now", the live dot, the fortnight. This is the *past*: an all-time day strip and
 * a weekday×hour heatmap, both built from data the present-tense card never reads
 * (`source_snapshots` history and accumulated `presence_sessions`). Two subjects,
 * two modules — the split the sampler-vs-source distinction already drew.
 *
 * `dayBreakdown` isn't here: it's fetched on demand when a column is clicked, so
 * the module ships one day-strip and one grid rather than 30 days of breakdowns
 * nobody asked to see.
 */
export interface PlaytimeModuleView {
  /** All-time hours, rounded, for the headline figure. */
  totalHours: number;
  /** The day strip: exact minutes played per day, differenced from lifetime
   *  counters. Oldest first. */
  ledger: { day: string; minutes: number }[];
  /** The heatmap: minutes per weekday×hour over the window. Sparse — only cells
   *  with play are present; the view fills the 7×24 grid. */
  heat: { weekday: number; hour: number; minutes: number }[];
  /** How many days the ledger covers, for "since <date>" copy. */
  since?: string;
}

/** One row of a music "top" list, ready to render. */
export interface MusicRankView {
  name: string;
  minutes: number;
  plays: number;
  /** Artist(s), for a song/album row. */
  by?: string;
  /** Album cover URL; absent → the row shows a monogram. */
  artUrl?: string;
}

/**
 * The music module — a fortnight of Spotify listening, sliced three ways plus a
 * timeline. Sibling to `PlaytimeModuleView`: same "accumulated past" shape (top
 * lists + a per-day strip), driven by `music_plays` instead of Steam counters.
 *
 * Like playtime, the per-day breakdown isn't shipped here — it's fetched on demand
 * when a timeline column is clicked (`/api/music/day`), so the module carries one
 * strip and three short lists, not fourteen days of tracks.
 *
 * Genre and podcast-vs-music are absent by construction: Discord's Spotify
 * presence exposes neither, so the module doesn't pretend to.
 */
export interface MusicModuleView {
  /** Total listening hours over the window, for the headline figure. */
  totalHours: number;
  /** Distinct tracks played over the window (the "tracks played" stat). */
  trackCount: number;
  /** Distinct artists over the window (the "different artists" stat). */
  artistCount: number;
  topSongs: MusicRankView[];
  topArtists: MusicRankView[];
  topAlbums: MusicRankView[];
  /** Minutes listened per day, oldest first — the clickable timeline. */
  ledger: { day: string; minutes: number }[];
  /** First day in the ledger, for "since <date>" copy. */
  since?: string;
}

/** A nav node with its label already localized (children/modules preserved). */
export interface NavView {
  id: string;
  label: string;
  icon?: string;
  children?: NavView[];
  modules?: string[];
}

export interface SiteView {
  locale: Locale;
  meta: { name: string; handle: string; location: string; role: string };
  /** The nav tree, labels localized. */
  nav: NavView[];
  /** Every resolved module referenced anywhere in the nav, keyed by id. */
  modules: Record<string, ResolvedModule>;
  /** ISO timestamp of the last source sync, if any data has been synced. */
  syncedAt?: string;
}


