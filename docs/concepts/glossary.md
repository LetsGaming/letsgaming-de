# Glossary

The words this project uses in a specific way. When a doc says "module" or
"snapshot" it means the thing defined here.

| Term | Meaning |
|---|---|
| Area | A top-level themed section of the nav that answers one visitor question (Home, Work, Life, About). See [information-architecture](./information-architecture.md). |
| Module | A placeable content block (a hero, a stats card, the projects list). Features and data sources arrive as modules dropped into a nav leaf, never as new tabs. |
| Module kind | The type of a module (`hero`, `projects`, `presence`, ...), defined in `packages/core/src/modules.ts`. Each kind has a resolver and a component. |
| Node | A single entry in the nav tree. Every node is either a leaf or a branch. |
| Leaf | A node that holds modules (a `modules: string[]`). It renders content. |
| Branch | A node that holds two or more child nodes with their own secondary nav. It groups, it doesn't render content directly. |
| Promotion gate | The four tests a module must pass to earn its own nav node: distinct question, weight to stand alone, homeless elsewhere, durable not seasonal. |
| Nav lint | The build-time check (`pnpm lint:nav`) that fails the build if the nav tree breaks a structural rule. |
| Localized | A `{ "en": "...", "de"?: "..." }` value. Every human-authored string is one, so translating *content* is a CMS task, not a migration. |
| UI string | Text the components emit themselves ("show 3 more", empty states, the footer). Has no CMS row, so it lives in the typed EN/DE catalog `packages/core/src/ui-messages.ts` and is read with `useT()`. |
| Source | An external integration behind the `Source` contract (GitHub, Wakapi). One adapter per source. See [sources-and-sync](./sources-and-sync.md). |
| Adapter | The code that implements a source: `fetch()` hits the API, `normalize()` maps the raw response to the common shape. |
| Normalized shape | The per-source common shape (`GitHubData`, `WakapiData`) that is the only thing the store, API, and frontend ever see. |
| Game metadata | Cover art + genre for a game, resolved by name from RAWG and cached in `game_metadata`. Not a source — a per-name lookup, not a snapshot. Decorates the playtime shelf. See [sources-and-sync](./sources-and-sync.md#game-metadata-not-a-source). |
| Mock source | A deterministic stand-in adapter used in dev when a source isn't configured, emitting the same normalized shape as the real one. |
| Snapshot | One persisted sync result in `source_snapshots`. The append-only archive. Can't be re-fetched, so it's what you back up. |
| Current | The latest snapshot per source in `source_current`. What a page render actually reads. |
| Sync worker | The in-process scheduler that polls each source on its interval and persists the result. |
| Store | The single SQLite database, the single source of truth. `@lg/db`. |
| Seed | The idempotent launch content and IA written when the store is empty. |
| SiteView | The fully resolved JSON the read API returns: localized strings, folded-in source data, pre-computed times. What the frontend renders. |
| ResolvedModule | One entry in a `SiteView`'s `modules` map, discriminated by `kind`. The frontend switches on it. |
| Asset | A file in the asset library, identified by its content hash. See [the-cms](./the-cms.md). |
| Variant | A cached rendition of an image asset at one width in one format (webp or avif), generated lazily on first request. |
| Usage | A recorded place an asset is referenced, so the library can show "used in" and warn before a delete. |
| `asset:<id>` | The reference string a content field stores instead of a file path; resolved to a rendered image at read time. |
| Gallery | A CMS-curated set of images placed on the site, each referencing a library asset. There can be more than one. |
| Presence | The "right now" widget fed by Lanyard, filtered server-side to an owner-set category allow-list. |
| Engagement beacon | The cookieless `POST /api/pulse` endpoint that receives already-bucketed, anonymous interaction events. |
| Traffic analytics | The log-derived, IP-free counts of paths, referrers, and coarse UA families. |
| Rollup | The maintenance pass that bundles old hourly analytics into daily rows and prunes them, keeping storage flat. |
