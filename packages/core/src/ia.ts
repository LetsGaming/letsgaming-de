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

export const LAUNCH_NAV: NavNode[] = [
  { id: "home", label: en("Home"), modules: ["hero", "glance", "featured", "guestbook"] },
  { id: "code", label: en("Code"), modules: ["activity", "coding", "projects"] },
  { id: "life", label: en("Life"), modules: ["presence", "hobbies", "gallery", "now"] },
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
  { id: "hobbies", kind: "hobbies", heading: en("Off the clock") },
  { id: "gallery", kind: "gallery", heading: en("Snapshots") },
  { id: "now", kind: "now", heading: en("Lately") },
  { id: "guestbook", kind: "guestbook", heading: en("Guestbook") },
  { id: "bio", kind: "bio", heading: en("About") },
  { id: "contact", kind: "contact", heading: en("Get in touch") },
  { id: "posts", kind: "posts", heading: en("Blog") },
];

export const LAUNCH_MODULE_IDS: readonly string[] = LAUNCH_MODULES.map((m) => m.id);
