# PROJECT.md — letsgaming.de

Personal homepage for **Domenic** (`@LetsGaming`, GitHub) — a full-time web
developer (Fachinformatiker Anwendungsentwicklung) in Germany. This document is
the accumulated spec: every decision and agreement reached during design, ready
to hand to a build (including Claude Code).

Status: **spec locked, ready to scaffold.** Items marked ⚑ are my picks awaiting
a final yes/no.

---

## 1. Vision

A personal homepage that shows who Domenic is and what he makes — **more than a
GitHub mirror** — without leaking sensitive personal data. It should feel like a
person, not a company.

Two north stars govern every decision:

- **Maintainability** — the site must never look stale after being left alone for
  a month. Freshness lives in the backend, not in the owner remembering to update.
- **Scalability** — adding new content or a new data source (a new public API,
  etc.) must be cheap and must not degrade the experience or bloat the navigation.

A hard cultural constraint sits alongside these: the CMS stays **small and
custom on purpose.** It must never grow toward Typo3/WordPress territory. It does
exactly what this project needs and nothing more.

---

## 2. Guiding principles

1. **Everything visible is data-driven.** The frontend renders normalized JSON;
   it never knows which API data came from.
2. **The store is the single source of truth**, and holds only normalized data —
   never raw API shapes. This one seam buys both north stars.
3. **Self-updating, not self-maintained.** A scheduled backend keeps data current;
   the page just renders what's there.
4. **Group by theme, not by feature.** Navigation maps to durable themes; features
   and data sources are modules placed inside a theme. (See §5.)
5. **Scale by depth, not breadth.** The nav is a recursive tree; any one level
   stays small, the tree grows as deep as needed. (See §5.)
6. **Privacy by omission.** If collecting data risks DSGVO/GDPR liability, don't
   collect it. (See §9.)
7. **Small CMS, forever.** Resist every feature that turns it into a platform.

---

## 3. Tech stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** everywhere | One language across the whole stack |
| Backend framework | **Fastify** ⚑ | Schema-first validation + plugin model fit the modular-source design; TS-native |
| Frontend | **Astro + Vue islands** ⚑ | Astro = content-driven, near-zero JS shell; Vue islands for the tactile interactive bits (leverages existing Vue experience) |
| Repo | **Monorepo** | pnpm workspaces |
| Package manager | **pnpm** | |
| Database | **SQLite** | Expected to cover ~95% of anything this project will ever need; upgrade path to Postgres exists but not planned |
| Sync | **Modular in-app worker** | Scheduled runner that can poll many APIs; each source is a pluggable adapter |
| Auth (CMS) | **GitHub OAuth** | Single user (Domenic) |
| Hosting | **Homelab, Docker** | |
| Domain | **letsgaming.de** | Owned |
| Analytics | **Privacy-respecting, cookieless** | Opt-in for anything more; self-hosted (see §9) |
| License | **Open source** | Public repo, all the way |

---

## 4. Backend architecture

### Data flow

```
  [ Data sources ]      GitHub (+ future APIs)
        │  fetch
        ▼
  [ Adapters ]          scheduled, normalize to a common shape
        │  persist
        ▼
  [ Data store ]  ◄──── [ CMS admin ]  (owner-edited content)
   single source        writes normalized content
   of truth,
   accumulates history
        │  read
        ▼
  [ Read API ]  ──►  [ Site (SPA) ]   landing + themed tabs
```

- **Nothing is fetched on page load.** The sync worker runs on a schedule, writes
  current data to the store, and the site reads whatever's there. This is what
  keeps the site fresh if untouched for months.
- **Accumulation beyond the public API.** The store keeps every sync, so over time
  it holds data GitHub's API won't hand you directly (all-time totals, long-range
  trends, "what I was into in 2024"). The public API is today's snapshot; the store
  is the archive. **At launch, only launch-available data matters** — history
  accrues from day one onward.

### The Source contract (the key abstraction)

Every integration is an adapter implementing one interface. Adding a source =
writing one adapter and registering it. The store, API, and entire frontend stay
untouched because they only ever speak the normalized shape.

```ts
interface Source<Raw, Normalized> {
  id: string;                      // "github"
  targetArea?: string;             // default area its modules belong to
  schedule: string;                // interval (cron-ish)
  fetch(): Promise<Raw>;           // hit the external API
  normalize(raw: Raw): Normalized; // -> common shape stored in the DB
}
// sync runner: fetch -> normalize -> persist (append snapshot + upsert "current")
```

**At launch: GitHub only.** No concrete plans beyond it yet, but the contract
exists so the next one is trivial.

---

## 5. Information architecture

The IA is the load-bearing idea that keeps the site from bloating as it scales.

### Areas and modules

- The nav is a small, fixed set of **themed areas.** Each area answers one
  question a visitor has.
- Features and data sources are **modules** placed inside the area they belong to
  — **never their own nav item by default.**
- Adding content grows a section within a theme; it does not grow the nav.

**Launch areas (one level, four areas):**

| Area | Answers | Contains at launch |
|---|---|---|
| **Home** | "who is this, quickly?" | Hero, status, featured taste, at-a-glance stats |
| **Work** | "what do you build?" | **Activity** (GitHub dashboard) then **Projects** |
| **Life** | "who are you outside that?" | Hobbies, "Right now" module |
| **About** | "the longer story + reach me" | Bio, contact |

> Within Work, **Activity is above Projects.**

### The promotion gate — when a *new nav node* is justified

Content enters as a module inside an existing node by default. A new nav node is a
**promotion it must earn** by clearing all four gates:

1. **Distinct question** — answers something no existing sibling already owns.
2. **Weight to stand alone** — multiple substantial modules, or one deep
   interactive experience. One card of light data is a section, not a node.
3. **Homeless elsewhere** — placing it in any existing sibling would feel forced.
4. **Durable, not seasonal** — experiments live as modules first and graduate if
   they prove out.

The gates apply identically at **every level** of the tree.

### Scaling model — depth, not breadth (recursive nav tree)

The "~5 max" limit is a property of a **single level** (human scannability of one
row), **not the whole site.** So:

- **Any one level stays ≤ 5 children.** When a node gets too heavy, you **split it
  into sub-nodes with their own secondary nav inside it** — you do not add a
  sibling at the top. Total nodes across the tree are unbounded; breadth per level
  stays small.
- The unit is **recursive**: a node is either a **leaf** (holds modules) or a
  **branch** (holds ≥2 child nodes). Same shape at every depth. The ladder is
  `module → sub-area → area`.
- **Depth preference (release valve):** aim for **2 levels**, treat **3 as the
  practical ceiling.** Split only when each sub-theme independently clears the four
  gates. Most of the site stays one level deep for years.
- **Lifecycle, both directions:** modules can be **promoted** to nodes once they
  hit critical mass; nodes that thin out get **demoted** back to modules. A
  straining top row is the signal that two top areas share a parent question and
  should **merge** under it.

### Enforcement (build-time lint, not discipline)

The above are enforced by checks that fail the build:

- ≤ 5 children on any node.
- Every node is either a **leaf with ≥1 real module** or a **branch with ≥2
  children** (no thin tabs, no single-child branches).
- Max depth 3.
- No orphan modules (every module resolves to a node).

---

## 6. Data model

### Navigation as a recursive tree (chosen at scaffold time — the expensive-to-retrofit decision)

Even though the launch tree is deliberately flat (one level, four areas), the
schema is a **tree from day one** so adding sub-areas later is adding a node, not
rewriting the model + renderer + CMS.

```ts
type Locale = "en" | "de";
type Localized = Record<Locale, string>;   // i18n-ready from day one

interface NavNode {
  id: string;
  label: Localized;
  icon?: string;
  children?: NavNode[];   // branch  (mutually exclusive with modules)
  modules?: string[];     // leaf    (module ids rendered in order)
}
```

### Content model

- **CMS-owned** (owner edits): bio, tagline, status ("currently building…"),
  links, projects, hobbies, "Right now", featured selection, nav labels.
- **Source-owned** (synced): repos, languages, contribution graph, event feed,
  stats — all under a source's normalized output.
- All human-authored strings are **`Localized`** (locale-keyed) so German is a
  content task later, not a migration.

### Normalized source output (example: GitHub)

```ts
interface GitHubData {
  stats: { repos: number; commitsYear: number; commitsAllTime: number; longestStreakDays: number };
  languages: { name: string; pct: number }[];
  contributions: number[];        // per-day intensity, accumulated over time
  events: { type: "commit"|"pr"|"star"|"repo"; text: string; meta?: string; at: string }[];
}
```

---

## 7. Design system

Direction is locked from the prototype: **bold but soft** — chunky rounded cards
with real depth, springy/tactile micro-interactions, purple-forward but not
drowning in it.

- **Motion:** keep current level — 3D tilt-on-hover cards, pressable buttons with
  a physical depress, staggered entrance, pulsing status dot. `prefers-reduced-
  motion` disables all of it (non-negotiable baseline).
- **Typography:** Fredoka (display), Inter (body), Space Mono (mono/data).
- **Themes:** **dark + light**, driven by CSS custom-property tokens, respecting
  `prefers-color-scheme` with a manual toggle (persisted). Light mode is low
  overhead precisely because the prototype already themes via tokens.
- **Accessibility floor:** responsive to mobile, visible keyboard focus, reduced
  motion respected, sufficient contrast in both themes.

### Tokens (dark — from prototype; light to be finalized in build)

```
ink #ece9f7 / ink-strong #fff / muted #948cb6
purple #8b5cf6  purple-bright #a78bfa  purple-deep #5b34d6
coral #ff7a5e   sun #ffc64b   mint #38d6a6
card #1a1730    bg #0e0c18 (+ radial purple glow)
```

Light mode: pale-lavender bg + white cards, a purple that pops on light
(≈ `#6d48e5`), same accent family — finalized during build against contrast checks.

### Components (from prototype)

Tactile project cards (one gradient "feature" card outranks the rest), stat cards,
contribution heatmap, language bars, event feed, hobby tiles, "Right now" list,
pressable buttons, pill tab bar.

---

## 8. CMS

**Scope discipline is a feature.** Small, custom, and it stays that way.

- **Auth:** GitHub OAuth, single user.
- **Edits:** the CMS-owned content in §6 — CRUD on projects/hobbies/links/"now",
  plus bio/status/tagline/nav labels.
- **Media:** yes, image upload is in scope for v1 (project shots, avatar) — but
  minimal: local storage on the homelab, basic resize/optimize, no asset library /
  DAM / plugin system. It uploads an image and stops there.
- **i18n:** edits localized fields per locale; German content added here later
  without code changes.
- **Never** becomes Typo3/WordPress. Every proposed CMS feature is measured
  against "does this project actually need it?"

---

## 9. Privacy & compliance

Overriding rule from the owner: **do not want to deal with DSGVO/GDPR. If it risks
a lawsuit, don't collect it at all.** Privacy by omission. *(Everything below is
general information, not legal advice — confirm specifics with a Fachanwalt für
IT-Recht.)*

### Analytics — decided: zero-thoughts tier now, upgrade path preserved

- **Launch (chosen): server-side aggregate counting that never retains personal
  data.** Parse own web-server access logs, drop/never store the IP at processing
  time, keep only anonymous aggregates: per-page view counts, popular paths,
  referrer sources, coarse trends, browser/OS/device family. No cookies, no
  identifiers, no consent banner, no privacy-policy complexity — nothing personal
  is stored, so it sits essentially outside GDPR scope.
- **Cannot** provide (by design at this tier): unique visitors, sessions, bounce
  rate, user journeys — those need a cookie or a pseudonymous hash.
- **Upgrade path (kept in mind, not built): self-hosted Umami or Plausible.**
  Cookieless, no raw-IP retention; derives a "unique visitor" from a short-lived
  daily IP+UA+salt hash. Very likely fine under legitimate interest (Art. 6(1)(f)),
  strengthened by self-hosting, but a notch less bulletproof than "retain nothing."
  Adopt only if unique visitors / richer dashboards become worth that small nuance.
- **No third-party trackers, no ad tech, no fingerprinting.** Self-hosted on the
  homelab keeps all data on infrastructure the owner controls.

### Contact

- **Contact form** relays to email; **stores nothing** in the DB; minimal fields;
  short privacy note. No message archive = little to no personal-data processing.
  Plus social links.

### Impressum — omitted (risk accepted)

- **Decision: no Impressum.** The owner leans on the **purely-private exemption**
  from § 5 DDG and **accepts the Abmahnung risk** rather than publish personal
  contact data. This is a deliberate, eyes-open choice, not an oversight.
- **Rationale:** the Impressumspflicht runs directly against the DSGVO's spirit for
  a private individual — it would force publishing a real name + **ladungsfähige
  Anschrift** (a P.O. box does **not** satisfy it) to every visitor and scraper.
  The owner prioritizes not exposing that data.
- **Acknowledged risk:** a developer homepage showcasing work sits on the
  **geschäftsmäßig** line, so the private exemption is *not* guaranteed to hold;
  missing Impressum is a known German Abmahnung target. This risk is knowingly taken.
- **Fallback if it ever bites / if the site turns commercial:** add an Impressum
  then, ideally using a **Zustellungsbevollmächtigter / c/o address** so the home
  address stays private. (Kept in mind, not implemented.)
- **Datenschutzerklärung:** still include a short static page — it's low-exposure
  (no address required) and consistent with the minimal, log-based, no-retention
  posture above. Worth keeping even without an Impressum.

---

## 10. Hosting & ops

- **Where:** homelab, **Docker** deployment.
- **Domain:** letsgaming.de (TLS via reverse proxy / Let's Encrypt).
- **Services:** one container for the Fastify server (API + CMS + sync worker),
  one for the built static/SSR site, SQLite on a mounted volume, analytics
  container. Compose-orchestrated.
- **Backups:** the SQLite file + uploaded media (the store is the archive — back it
  up, since accumulated history can't be re-fetched).

---

## 11. Scope

**v1 = minimal, like the prototype, but built on the scaling structure.**

- Ship **Home / Work / About** wired to **GitHub + CMS**, dark + light themes,
  the tactile look, EN content (scaffolded where real copy isn't ready yet).
- Built on the recursive nav tree + area/module model + lint from day one, so
  growth is cheap later.

**Deferred (built to slot in, not built yet):**

- **Life** area content depth / first personal data source.
- Additional sources (the Source contract is ready; none planned yet).
- German locale content (schema is ready).
- Secondary-level nav UI (schema is ready; UI built when a node first needs to
  split).

**Content readiness:** some real (bio direction, real projects: `plantcare-
tracker`, `LED-Controller-Websocket`, `dotfiles`); most scaffolded and filled in
through the CMS. Contact = mail + social links.

---

## 12. Proposed repo layout (pnpm monorepo)

```
letsgaming.de/
├─ apps/
│  ├─ web/            # Astro (SSR) + Vue islands — public site + /admin CMS
│  └─ server/         # Fastify — read API, CMS API, OAuth, media, analytics, sync worker
├─ packages/
│  ├─ core/           # shared TS: NavNode tree, content model, Localized, Source contract
│  ├─ sources/        # pluggable adapters — github/ first; each implements Source
│  └─ db/             # SQLite schema, repositories, seed
├─ docs/              # PROJECT.md (this file), ARCHITECTURE, API, DATA-MODEL,
│                     # CONFIGURATION, SECURITY, DEPLOYMENT, CONTRIBUTING, adr/
├─ README.md
├─ docker-compose.yml
└─ pnpm-workspace.yaml
```

---

## 13. Open items (⚑ — need a yes/no)

1. **Fastify** over Express — confirm.
2. **Astro + Vue islands** for the frontend — confirm (vs. Vue SPA, or vanilla TS).
3. **Launch locale** — English-first with German added later via CMS (my pick, to
   cap overhead) vs. bilingual at launch.

Everything else is decided above.
