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

import type { Locale } from "./i18n.js";
import type { ModuleKind } from "./modules.js";

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
  primary: boolean;
}

export interface HobbyView {
  id: string;
  title: string;
  blurb: string;
  icon?: string;
  tone: "purple" | "coral" | "mint" | "sun";
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
  type: "commit" | "pr" | "star" | "repo";
  text: string;
  meta?: string;
  /** ISO timestamp (kept for tooltips / machine use). */
  at: string;
  /** Pre-computed short relative time, e.g. "2d", "1w". */
  relative: string;
}

/** Contribution heatmap, bucketed server-side to levels 0..4 (5 shades). */
export interface HeatView {
  /** Per-day level 0..4, oldest first. */
  levels: number[];
  /** Sum of raw contributions in the window, for the "N this year" caption. */
  total: number;
}

export interface HeroView {
  eyebrow: string;
  headline: { before: string; highlight: string; after: string };
  lede: string;
  status: { verb: string; now: string };
  links: LinkView[];
}

export interface ActivityView {
  heading: string;
  note?: string;
  stats: StatView[];
  contributions: HeatView;
  languages: LanguageView[];
  events: EventView[];
  /** Source labels feeding this module, e.g. ["GitHub"]. */
  sources: string[];
}

export interface SectionMeta {
  heading: string;
  note?: string;
}

/** Discriminated by `kind`; the frontend maps kind -> component. */
export type ResolvedModule =
  | { id: string; kind: "hero"; data: HeroView }
  | { id: string; kind: "featured"; data: SectionMeta & { project: ProjectView | null } }
  | { id: string; kind: "glance"; data: SectionMeta & { stats: StatView[] } }
  | { id: string; kind: "activity"; data: ActivityView }
  | { id: string; kind: "projects"; data: SectionMeta & { projects: ProjectView[] } }
  | { id: string; kind: "hobbies"; data: SectionMeta & { hobbies: HobbyView[] } }
  | { id: string; kind: "now"; data: SectionMeta & { items: NowView[] } }
  | { id: string; kind: "bio"; data: SectionMeta & { paragraphs: string[] } }
  | { id: string; kind: "contact"; data: SectionMeta & { links: LinkView[] } };

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

/** Narrowing helper so the frontend's switch is exhaustive & type-safe. */
export function isModuleKind(value: string): value is ModuleKind {
  return [
    "hero",
    "featured",
    "glance",
    "activity",
    "projects",
    "hobbies",
    "now",
    "bio",
    "contact",
  ].includes(value);
}
