/**
 * The canonical information architecture.
 *
 * Five areas, one level: Home / Code / Life / About / Blog. This is the
 * reference structure the DB seeds from and the nav lint checks against —
 * keeping it in `core` means the lint has a single source of truth for "which
 * module ids are known".
 *
 * The tree is at the breadth cap: MAX_CHILDREN is 5, and there are 5. Every
 * future area splits an existing node; none adds a sibling. That's what depth is
 * for, and `lint:nav` will say so.
 *
 * `Work` was renamed to `Code` because there is no work on it — plantcare-tracker,
 * minecraft-*, game-server-lib and LED-Controller-Websocket are all hobby repos.
 * Coding is one of the hobbies; this is its area.
 */

import { en } from "./i18n.js";
import type { ModuleDescriptor } from "./modules.js";
import type { NavNode } from "./nav.js";

/**
 * Browser storage keys — every one of them, site and CMS.
 *
 * The site and the admin share an origin, so they share a storage namespace;
 * listing the keys together is the only way to see that. `analyticsOptout` used
 * to live as a lone `const OPTOUT_KEY` in the tracker, which is how a namespace
 * grows a fourth spelling convention without anyone deciding on one.
 *
 * Here in core rather than in the web app because the anti-FOUC script in
 * The inline script in nuxt.config reads two of these; it runs before
 * hydration — it can't import anything, so it must inline the literal. Two files,
 * one key, and nothing linking them: exactly the drift that renamed an area out
 * from under `go("work")`.
 */
export const STORAGE_KEY = {
  /** localStorage — theme choice, read by the inline no-flash script. */
  theme: "theme",
  /** localStorage — locale choice, read by the inline no-flash script. */
  lang: "lang",
  /** localStorage — the visitor's analytics opt-out (a functional preference). */
  analyticsOptout: "lg-analytics-optout",
  /** sessionStorage — CMS bearer token, tab-scoped on purpose (SEC-05). */
  cmsToken: "cms_token",
} as const;

/**
 * The keys the inline no-flash script must spell identically to the store.
 *
 * The script can't consume the constant. It can be *checked* against it, which is
 * what tests/storage-keys.test.ts does — and the check needs to know which keys
 * it should expect to find, or adding an unrelated key (the opt-out) fails a test
 * about theme flashing.
 */
export const INLINE_SCRIPT_KEYS = [STORAGE_KEY.theme, STORAGE_KEY.lang] as const;

/**
 * The launch areas, as a typed lookup.
 *
 * Every `go("code")`, `href="/life"` and `AREA_FOR_VIEW` entry in the codebase
 * should reference this: an area id spelled as a bare string typechecks perfectly
 * and fails at runtime, which is how "see all my work" kept pointing at `work`
 * for hours after the area was renamed to `code`. With AREA.code, the rename is a
 * compile error. LAUNCH_NAV below is constrained to these ids, so the tree and
 * this object are checked against each other by the compiler.
 *
 * This is a launch-time constant, not the live tree — the CMS owns the real nav.
 * Use it for code that must name a specific area (a link to Code, the fallback
 * home). Anything iterating the nav should read the resolved tree instead.
 */
export const AREA = {
  home: "home",
  code: "code",
  life: "life",
  about: "about",
  blog: "blog",
} as const;

/** The id of an area that ships at launch. */
export type AreaId = (typeof AREA)[keyof typeof AREA];

/**
 * Query marker the CMS adds when it frames the site in its live preview.
 *
 * A contract between two apps that never import each other: the CMS writes it,
 * the tracker reads it to stay silent so the owner's own previewing doesn't count
 * as traffic. Written as a literal on both sides, it's one rename away from
 * quietly logging every save as a visit.
 */
export const PREVIEW_PARAM = "preview";

/** Launch tree. Ids are constrained to {@link AreaId}, so the tree and AREA are
 *  checked against each other by the compiler rather than by convention. */
export const LAUNCH_NAV: (NavNode & { id: AreaId })[] = [
  { id: "home", label: en("Home"), modules: ["hero", "glance", "featured", "guestbook"] },
  { id: "code", label: en("Code"), modules: ["activity", "coding", "projects"] },
  { id: "life", label: en("Life"), modules: ["presence", "playtime", "music", "wrapped", "hobbies", "gallery", "now"] },
  { id: "about", label: en("About"), modules: ["bio", "contact"] },
  { id: "blog", label: en("Blog"), modules: ["posts"], hidden: true },
];

/**
 * Default module registry. `heading` is a default the resolver may override.
 *
 * Deliberately no `note` fields. They rendered as a small mono kicker beside
 * every H2 — eleven of them, on every section — which is a template slot being
 * filled, not orientation. Freshness now shows as a live marker on the modules
 * that sync (`● synced 8 min ago`), which is the one thing those notes were
 * gesturing at and never actually said.
 */
export const LAUNCH_MODULES: ModuleDescriptor[] = [
  { id: "hero", kind: "hero" },
  { id: "glance", kind: "glance", heading: en("At a glance") },
  { id: "featured", kind: "featured", heading: en("Featured") },
  // One stream. A release is an event, and "Recently shipped" was a second
  // lookalike box sorted by the same key — so `highlights` folded in here.
  { id: "activity", kind: "activity", heading: en("Recent") },
  { id: "coding", kind: "coding", heading: en("This week") },
  { id: "projects", kind: "projects", heading: en("Stuff I make") },
  { id: "presence", kind: "presence", heading: en("Right now") },
  { id: "playtime", kind: "playtime", heading: en("Time played") },
  { id: "music", kind: "music", heading: en("Listening") },
  { id: "wrapped", kind: "wrapped", heading: en("Wrapped") },
  { id: "hobbies", kind: "hobbies", heading: en("Off the clock") },
  { id: "gallery", kind: "gallery", heading: en("Snapshots") },
  { id: "now", kind: "now", heading: en("Lately") },
  { id: "guestbook", kind: "guestbook", heading: en("Guestbook") },
  { id: "bio", kind: "bio", heading: en("About") },
  { id: "contact", kind: "contact", heading: en("Get in touch") },
  { id: "posts", kind: "posts", heading: en("Blog") },
];

export const LAUNCH_MODULE_IDS: readonly string[] = LAUNCH_MODULES.map((m) => m.id);

/**
 * The gallery module that ships with the site.
 *
 * The CMS can create more (each is its own `gallery`-kind module) and delete
 * them, but not this one — deleting the last gallery would leave the Layout
 * screen with a gallery editor and nothing to edit. Named because "gallery" was
 * spelled three ways across the delete guard, the launch registry and the CMS's
 * default selection, and only one of them is a module *kind*.
 */
export const DEFAULT_GALLERY_ID = "gallery";
