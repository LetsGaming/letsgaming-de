import {
  defaultPresenceSettings,
  l,
  mergeLocales,
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
import { asNumber, mapRow, transact } from "./row-mapper.js";
import { contentRepo } from "./content-repo.js";
import { iaRepo } from "./ia-repo.js";

/**
 * Launch seed content, in both shipped locales.
 *
 * German is seeded rather than left as a later content task: a site that offers a
 * language switch and then answers half of it in English isn't bilingual, it's
 * broken in two places. Everything here is still fully CMS-editable — this is the
 * starting text, not the authority. `mergeLocales` in `reconcileIa` is what carries
 * the same guarantee to the module headings and area labels of a store that was
 * seeded before German existed.
 *
 * The German is a translation of intent, not of grammar: "Off the clock" is
 * "Nach Feierabend", not "Von der Uhr". Where a term is genuinely the English one
 * in German usage (Fachinformatiker, Home Lab, Raspberry Pi) it stays.
 *
 * Prose fields use `**bold**`; the frontend renders it safely. No source data is
 * seeded — repos/stats/graph/feed arrive only from a real sync.
 */
const SEED: Omit<SiteContent, "projects" | "hobbies" | "links" | "now"> = {
  meta: {
    name: "Domenic",
    handle: "LetsGaming",
    location: l("Germany", "Deutschland"),
    role: l("web developer", "Webentwickler"),
  },
  headline: {
    before: l("I build for the web — and ", "Ich baue fürs Web — und "),
    highlight: l("tinker", "bastle"),
    after: l(" after hours.", " nach Feierabend."),
  },
  lede: l(
    "Full-time web developer, **Fachinformatiker Anwendungsentwicklung**. Clean, usable interfaces by day; plant sensors and LED strips by night.",
    "Webentwickler in Vollzeit, **Fachinformatiker Anwendungsentwicklung**. Tagsüber klare, benutzbare Oberflächen; nachts Pflanzensensoren und LED-Streifen.",
  ),
  status: { verb: l("building", "baue"), now: l("plantcare-tracker", "plantcare-tracker") },
  bio: [
    l(
      "I'm a full-time web developer in Germany who came up through a Fachinformatiker Anwendungsentwicklung apprenticeship. Most of my day goes into making interfaces that are genuinely pleasant to use.",
      "Ich bin Webentwickler in Vollzeit und über eine Ausbildung zum Fachinformatiker für Anwendungsentwicklung hierhergekommen. Den größten Teil des Tages verbringe ich damit, Oberflächen zu bauen, die sich wirklich angenehm bedienen lassen.",
    ),
    l(
      "Outside work I'm happiest with a soldering iron or a Raspberry Pi nearby — usually attached to a plant, an LED strip, or some corner of my home lab that didn't strictly need automating.",
      "Nach der Arbeit bin ich am glücklichsten mit einem Lötkolben oder einem Raspberry Pi in Reichweite — meistens angeschlossen an eine Pflanze, einen LED-Streifen oder irgendeine Ecke meines Home Labs, die man nicht zwingend hätte automatisieren müssen.",
    ),
    l(
      "This site is its own little project: a small custom CMS feeds the content, and a backend quietly accumulates data from GitHub (and whatever I plug in next) so it stays current on its own.",
      "Diese Seite ist selbst so ein Projekt: Ein kleines, selbstgebautes CMS liefert die Inhalte, und ein Backend sammelt im Hintergrund Daten von GitHub (und was ich als Nächstes anschließe), damit sie sich von allein aktuell hält.",
    ),
  ],
};

// Projects are no longer seeded: the Projects/Featured sections are driven by
// GitHub (pinned repos first, then most-recently-updated). The CMS project
// entity remains as an optional fallback for when no GitHub data is synced yet.
const PROJECTS: Project[] = [];

const HOBBIES: Hobby[] = [
  {
    id: "gaming",
    title: l("Gaming", "Gaming"),
    blurb: l("where the name comes from", "daher kommt der Name"),
    tone: "purple",
    icon: "game",
  },
  {
    id: "plants",
    title: l("Houseplants", "Zimmerpflanzen"),
    blurb: l("more than I can count", "mehr, als ich zählen kann"),
    tone: "mint",
    icon: "plant",
  },
  {
    id: "leds",
    title: l("LEDs & Pi", "LEDs & Pi"),
    blurb: l("lights that do things", "Licht, das etwas tut"),
    tone: "coral",
    icon: "chip",
  },
  {
    id: "homelab",
    title: l("Home lab", "Home Lab"),
    blurb: l("automating the boring bits", "das Langweilige automatisieren"),
    tone: "sun",
    icon: "server",
  },
];

const LINKS: Link[] = [
  { id: "github", label: l("GitHub", "GitHub"), href: "https://github.com/LetsGaming", icon: "gh", primary: false },
  { id: "contact", label: l("Get in touch", "Kontakt aufnehmen"), href: "#contact", icon: "mail", primary: true },
];

const NOW: NowItem[] = [
  {
    id: "building",
    key: l("building", "baue"),
    value: l("**plantcare-tracker** — watering schedules", "**plantcare-tracker** — Gießpläne"),
  },
  {
    id: "playing",
    key: l("playing", "spiele"),
    value: l("whatever's in the backlog", "was gerade im Backlog liegt"),
  },
  {
    id: "tinkering",
    key: l("tinkering", "bastle"),
    value: l("a Pi-driven LED shelf", "ein LED-Regal mit Raspberry Pi"),
  },
  {
    id: "growing",
    key: l("growing", "ziehe"),
    value: l("one more monstera, allegedly the last", "noch eine Monstera, angeblich die letzte"),
  },
];

/**
 * Idempotent: only seeds tables that are empty. Safe to run on every boot.
 *
 * Wrapped in a transaction: this is several inserts across site_content,
 * site_ia, site_presence, and the content-entity tables, and the "already
 * seeded" guard only checks site_content. Without a transaction, a process
 * killed mid-seed (OOM, container restart) leaves site_content populated but
 * site_ia empty — the guard then sees site_content and never retries, and the
 * store is permanently stuck: reconcileIa's getNav() throws, as does every
 * other caller of store.ia.getNav() outside that one try/catch (e.g. SSR's
 * buildSiteView). A transaction makes the boot either fully seed or fully not.
 */
export function seedIfEmpty(db: DB): { seeded: boolean } {
  const hasContent =
    (mapRow(db.prepare("SELECT COUNT(*) AS n FROM site_content"), (r) => asNumber(r.n)) ?? 0) > 0;
  if (hasContent) return { seeded: false };

  return transact(db, () => {
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
  });
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

  // 0. Structural drift the additive passes below can't express.
  //
  //    Everything after this point reconciles *by node id* and only ever adds:
  //    it can't rename a node, delete a retired module, or create a node the
  //    store has never heard of. Those are exactly what an area rename is, so
  //    without this an IA change would live in the code and never reach a store
  //    that was already seeded — the site would keep serving the old tree.
  //
  //    Each entry is one-shot and idempotent: it only fires while the old shape
  //    is still present.
  const renamedNodes: Record<string, string> = { work: "code" };
  /** Modules that moved area. Additive reconcile can't express a move: it would
   *  see the module already placed and leave it. */
  const movedModules: Record<string, string> = { guestbook: "home" };
  const retiredModules = new Set(["highlights"]);
  let structuralChange = false;

  const renameNodes = (nodes: NavNode[]): void => {
    for (const n of nodes) {
      const to = renamedNodes[n.id];
      if (to && !nodes.some((o) => o.id === to)) {
        n.id = to;
        structuralChange = true;
      }
      if (n.modules) {
        const kept = n.modules.filter((id) => !retiredModules.has(id));
        if (kept.length !== n.modules.length) {
          n.modules = kept;
          structuralChange = true;
        }
      }
      if (n.children) renameNodes(n.children);
    }
  };
  renameNodes(nav);

  for (const [moduleId, target] of Object.entries(movedModules)) {
    const from = nav.find((n) => n.modules?.includes(moduleId) && n.id !== target);
    if (from?.modules) {
      from.modules = from.modules.filter((m) => m !== moduleId);
      const to = nav.find((n) => n.id === target);
      if (to?.modules && !to.modules.includes(moduleId)) to.modules.push(moduleId);
      structuralChange = true;
    }
  }

  // Nodes the launch tree has and the store doesn't. Appended, keeping any
  // store-only areas the CMS added.
  for (const launchNode of LAUNCH_NAV) {
    if (!nav.some((n) => n.id === launchNode.id)) {
      nav.push(structuredClone(launchNode));
      structuralChange = true;
    }
  }

  if (retiredModules.size) {
    const before = modules.length;
    modules = modules.filter((m) => !retiredModules.has(m.id));
    if (modules.length !== before) structuralChange = true;
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

  // 1b. Fill in locales the store's descriptors are missing, without overwriting
  //     anything already there.
  //
  //     This used to assign `canon.heading` outright, on the grounds that headings
  //     were code-defined and not CMS-editable. They are editable now, which makes
  //     an unconditional overwrite a reverter: save a heading in the CMS, restart,
  //     and the code's wording is back. Additive merge instead — a store seeded
  //     before German existed gains the German, an edited English survives, and a
  //     rename in LAUNCH_MODULES no longer reaches a store that already has its own
  //     answer. (That last part is the trade, and it's the right way round: the
  //     registry is a *seed*, and the CMS owns the value once it exists.)
  const canonical = new Map(LAUNCH_MODULES.map((m) => [m.id, m]));
  let metaChanged = false;
  for (const m of modules) {
    const canon = canonical.get(m.id);
    if (!canon) continue;
    if (canon.heading) {
      const merged = m.heading ? mergeLocales(m.heading, canon.heading) : canon.heading;
      if (merged !== m.heading) {
        m.heading = merged;
        metaChanged = true;
      }
    }
    if (canon.note) {
      const merged = m.note ? mergeLocales(m.note, canon.note) : canon.note;
      if (merged !== m.note) {
        m.note = merged;
        metaChanged = true;
      }
    }
  }

  // 1c. The same rule for nav labels and area descriptions, which are CMS-owned
  //     for exactly the same reason and were previously never reconciled at all —
  //     so a store seeded before German would have kept English area names forever.
  // Keyed as `string`, not `AreaId`: the store's nav ids are whatever the CMS has
  //     created, so a lookup by a store id has to be expressible.
  const canonicalNav = new Map<string, NavNode>(LAUNCH_NAV.map((n) => [n.id, n]));
  const fillNavLocales = (nodes: NavNode[]): void => {
    for (const n of nodes) {
      const canon = canonicalNav.get(n.id);
      if (canon) {
        const merged = mergeLocales(n.label, canon.label);
        if (merged !== n.label) {
          n.label = merged;
          structuralChange = true;
        }
      }
      if (n.children) fillNavLocales(n.children);
    }
  };
  fillNavLocales(nav);

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

  if (structuralChange || addedModules.length || metaChanged) ia.setModules(modules);
  if (structuralChange || placed.length) ia.setNav(nav);
  return { addedModules, placed };
}
