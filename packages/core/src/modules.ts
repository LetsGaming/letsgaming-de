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

export type ModuleKind =
  // Home
  | "hero"
  | "featured"
  | "glance"
  // Work
  | "activity"
  | "projects"
  // Life
  | "hobbies"
  | "now"
  // About
  | "bio"
  | "contact";

export interface ModuleDescriptor {
  id: string;
  kind: ModuleKind;
  /** Optional heading override; each kind has a sensible default otherwise. */
  heading?: Localized;
  /** Optional small sub-note shown beside the heading. */
  note?: Localized;
}
