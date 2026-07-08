import {
  en,
  LAUNCH_MODULES,
  LAUNCH_NAV,
  type Hobby,
  type Link,
  type NowItem,
  type Project,
  type SiteContent,
} from "@lg/core";
import type { DB } from "./database.js";
import { contentRepo } from "./content-repo.js";

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

  const content = contentRepo(db);
  PROJECTS.forEach((p, i) => content.upsertProject(p, i));
  HOBBIES.forEach((h, i) => content.upsertHobby(h, i));
  LINKS.forEach((l, i) => content.upsertLink(l, i));
  NOW.forEach((n, i) => content.upsertNow(n, i));

  return { seeded: true };
}
