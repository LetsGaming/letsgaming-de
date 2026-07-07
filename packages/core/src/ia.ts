/**
 * The canonical launch information architecture (PROJECT.md §5 "Launch areas").
 *
 * Four areas, one level: Home / Work / Life / About. Within Work, Activity sits
 * above Projects (spec is explicit). This is the reference structure the DB
 * seeds from and the nav lint checks against — keeping it in `core` means the
 * lint has a single source of truth for "which module ids are known".
 *
 * The tree is flat today, but it's a *tree*: promoting a module to a sub-area
 * later is adding a node here, nothing else.
 */

import { en } from "./i18n.js";
import type { ModuleDescriptor } from "./modules.js";
import type { NavNode } from "./nav.js";

export const LAUNCH_NAV: NavNode[] = [
  { id: "home", label: en("Home"), modules: ["hero", "featured", "glance"] },
  { id: "work", label: en("Work"), modules: ["activity", "projects"] },
  { id: "life", label: en("Life"), modules: ["hobbies", "now"] },
  { id: "about", label: en("About"), modules: ["bio", "contact"] },
];

/**
 * Default module registry. `heading`/`note` are defaults the resolver may
 * override (e.g. the projects note gets the live repo count appended). Kept in
 * declaration order per area for readability, though placement is the nav's job.
 */
export const LAUNCH_MODULES: ModuleDescriptor[] = [
  { id: "hero", kind: "hero" },
  { id: "featured", kind: "featured", heading: en("Featured") },
  { id: "glance", kind: "glance", heading: en("At a glance") },
  {
    id: "activity",
    kind: "activity",
    heading: en("Activity"),
    note: en("synced & accumulated by the backend"),
  },
  { id: "projects", kind: "projects", heading: en("Stuff I make") },
  { id: "hobbies", kind: "hobbies", heading: en("Off the clock"), note: en("the non-code half") },
  { id: "now", kind: "now", heading: en("Right now"), note: en("kept fresh, not stale") },
  { id: "bio", kind: "bio", heading: en("About"), note: en("the longer version") },
  { id: "contact", kind: "contact", heading: en("Get in touch") },
];

export const LAUNCH_MODULE_IDS: readonly string[] = LAUNCH_MODULES.map((m) => m.id);
