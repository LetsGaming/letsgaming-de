import {
  defaultPresenceSettings,
  en,
  LAUNCH_MODULES,
  LAUNCH_NAV,
  type Hobby,
  type Link,
  type ModuleDescriptor,
  type NavNode,
  type NowItem,
  type Project,
  type SiteContent,
} from "@lg/core";
import type { DB } from "./database.js";
import { contentRepo } from "./content-repo.js";
import { iaRepo } from "./ia-repo.js";

/**
 * Launch seed content. Real where it's ready (bio direction, the real projects
 * plantcare-tracker / LED-Controller-Websocket / dotfiles), scaffolded English
 * elsewhere — all editable later in the CMS, German added as content (§11).
 *
 * Prose fields use `**bold**`; the frontend renders it safely. No source data is
 * seeded — repos/stats/graph/feed arrive only from a real sync.
 */
const SEED: Omit<SiteContent, "projects" | "hobbies" | "links" | "now"> = {
  meta: {
    name: "Domenic",
    handle: "LetsGaming",
    location: en("Germany"),
    role: en("web developer"),
  },
  headline: {
    before: en("I build for the web — and "),
    highlight: en("tinker"),
    after: en(" after hours."),
  },
  lede: en(
    "Full-time web developer, **Fachinformatiker Anwendungsentwicklung**. Clean, usable interfaces by day; plant sensors and LED strips by night.",
  ),
  status: { verb: en("building"), now: en("plantcare-tracker") },
  bio: [
    en(
      "I'm a full-time web developer in Germany who came up through a Fachinformatiker Anwendungsentwicklung apprenticeship. Most of my day goes into making interfaces that are genuinely pleasant to use.",
    ),
    en(
      "Outside work I'm happiest with a soldering iron or a Raspberry Pi nearby — usually attached to a plant, an LED strip, or some corner of my home lab that didn't strictly need automating.",
    ),
    en(
      "This site is its own little project: a small custom CMS feeds the content, and a backend quietly accumulates data from GitHub (and whatever I plug in next) so it stays current on its own.",
    ),
  ],
};

// Projects are no longer seeded: the Projects/Featured sections are driven by
// GitHub (pinned repos first, then most-recently-updated). The CMS project
// entity remains as an optional fallback for when no GitHub data is synced yet.
const PROJECTS: Project[] = [];

const HOBBIES: Hobby[] = [
  { id: "gaming", title: en("Gaming"), blurb: en("where the name comes from"), tone: "purple", icon: "game" },
  { id: "plants", title: en("Houseplants"), blurb: en("more than I can count"), tone: "mint", icon: "plant" },
  { id: "leds", title: en("LEDs & Pi"), blurb: en("lights that do things"), tone: "coral", icon: "chip" },
  { id: "homelab", title: en("Home lab"), blurb: en("automating the boring bits"), tone: "sun", icon: "server" },
];

const LINKS: Link[] = [
  { id: "github", label: en("GitHub"), href: "https://github.com/LetsGaming", icon: "gh", primary: false },
  { id: "contact", label: en("Get in touch"), href: "#contact", icon: "mail", primary: true },
];

const NOW: NowItem[] = [
  { id: "building", key: en("building"), value: en("**plantcare-tracker** — watering schedules") },
  { id: "playing", key: en("playing"), value: en("whatever's in the backlog") },
  { id: "tinkering", key: en("tinkering"), value: en("a Pi-driven LED shelf") },
  { id: "growing", key: en("growing"), value: en("one more monstera, allegedly the last") },
];

/** Idempotent: only seeds tables that are empty. Safe to run on every boot. */
export function seedIfEmpty(db: DB): { seeded: boolean } {
  const hasContent =
    (db.prepare("SELECT COUNT(*) AS n FROM site_content").get() as { n: number }).n > 0;
  if (hasContent) return { seeded: false };

  db.prepare("INSERT INTO site_content (id, meta, headline, lede, status, bio) VALUES (1, ?, ?, ?, ?, ?)").run(
    JSON.stringify(SEED.meta),
    JSON.stringify(SEED.headline),
    JSON.stringify(SEED.lede),
    JSON.stringify(SEED.status),
    JSON.stringify(SEED.bio),
  );

  db.prepare("INSERT INTO site_ia (id, nav, modules) VALUES (1, ?, ?)").run(
    JSON.stringify(LAUNCH_NAV),
    JSON.stringify(LAUNCH_MODULES),
  );
  db.prepare("INSERT OR IGNORE INTO site_presence (id, show) VALUES (1, ?)").run(
    JSON.stringify(defaultPresenceSettings().show),
  );

  const content = contentRepo(db);
  PROJECTS.forEach((p, i) => content.upsertProject(p, i));
  HOBBIES.forEach((h, i) => content.upsertHobby(h, i));
  LINKS.forEach((l, i) => content.upsertLink(l, i));
  NOW.forEach((n, i) => content.upsertNow(n, i));

  return { seeded: true };
}

/**
 * Idempotent IA reconciliation for an *already-seeded* store. The nav tree and
 * module registry live in the DB (seeded once), but module placement isn't
 * CMS-editable — so a new launch module (e.g. `highlights`) would never reach a
 * DB seeded by an earlier version. This additively:
 *   1. registers any `LAUNCH_MODULES` descriptor the store doesn't have yet, and
 *   2. places each such module into its launch leaf, in launch order, without
 *      removing or reordering anything the store already had.
 * Running it twice is a no-op. Called on every boot alongside `seedIfEmpty`.
 */
export function reconcileIa(db: DB): { addedModules: string[]; placed: string[] } {
  const ia = iaRepo(db);
  let modules: ModuleDescriptor[];
  let nav: NavNode[];
  try {
    modules = ia.getModules();
    nav = ia.getNav();
  } catch {
    return { addedModules: [], placed: [] }; // not seeded yet — seedIfEmpty handles it
  }

  // 1. Append missing launch-module descriptors.
  const known = new Set(modules.map((m) => m.id));
  const addedModules: string[] = [];
  for (const m of LAUNCH_MODULES) {
    if (!known.has(m.id)) {
      modules.push(m);
      addedModules.push(m.id);
    }
  }

  // 2. Ensure each launch leaf contains its launch module ids (launch order for
  //    known/new ids; any store-only extras are preserved at the end).
  const launchLeafOrder = new Map<string, string[]>();
  const collectLaunchLeaves = (nodes: NavNode[]): void => {
    for (const n of nodes) {
      if (n.modules) launchLeafOrder.set(n.id, n.modules);
      if (n.children) collectLaunchLeaves(n.children);
    }
  };
  collectLaunchLeaves(LAUNCH_NAV);

  const placed: string[] = [];
  const reconcileLeaves = (nodes: NavNode[]): void => {
    for (const n of nodes) {
      const launch = n.modules ? launchLeafOrder.get(n.id) : undefined;
      if (n.modules && launch) {
        const have = new Set(n.modules);
        const merged: string[] = [];
        for (const id of launch) {
          if (have.has(id) || addedModules.includes(id)) {
            if (!merged.includes(id)) merged.push(id);
            if (!have.has(id)) placed.push(id);
          }
        }
        for (const id of n.modules) if (!merged.includes(id)) merged.push(id);
        n.modules = merged;
      }
      if (n.children) reconcileLeaves(n.children);
    }
  };
  reconcileLeaves(nav);

  if (addedModules.length) ia.setModules(modules);
  if (placed.length) ia.setNav(nav);
  return { addedModules, placed };
}
