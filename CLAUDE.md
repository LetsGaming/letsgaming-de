# Agent instructions for this repo

letsgaming.de: a personal, data-driven homepage with a small custom CMS.
TypeScript pnpm monorepo — Nuxt 3 (SSR web + `/admin` CMS), Fastify (read API +
CMS API + OAuth + sync worker), SQLite via `node:sqlite`. See
[`README.md`](./README.md) and [`docs/OVERVIEW.md`](./docs/OVERVIEW.md) /
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full picture; this file
is the agent-specific operating notes on top of that.

```
apps/
  web/       Nuxt 3, public site (SSR) + the /admin CMS
  server/    Fastify, read API + CMS API + OAuth + media + analytics + sync worker
packages/
  core/      contracts + resolver + nav lint (no runtime deps)
  db/        SQLite store: schema + repositories + seed
  sources/   pluggable adapters: github, wakapi
```

## Before doing any dev/manual-testing work

Run:

```bash
node scripts/dev-up.mjs --id <your-session-id>
```

Pick `<your-session-id>` yourself — something short and specific to this
task/session (e.g. `settings-clarify`, `guestbook-bugfix`). This builds the
workspace packages, then starts an isolated backend + frontend pair, each on
its own automatically-picked free port, backed by its own disposable SQLite
database and media dir. `NODE_ENV` is left unset, which is what makes the
server register `/auth/dev/login` and fall back to the deterministic
GitHub/Wakapi mock sources (no token needed) — real repos, languages, and
contribution-graph data with nothing configured. On top of that it seeds
guestbook entries (approved + pending, for pagination and the moderation
queue) and ~3 weeks of playtime/listening history (Played, Listening, and
Wrapped modules), so the site shows real content instead of empty states. It
prints the frontend URL, the dev-login URL (on the *backend* origin — it mints
a CMS session cookie and redirects into `/admin`), a CMS bearer token for
direct API calls, and the log paths to use.

One thing it can't fake: the *live* Discord presence widget needs a real
Lanyard connection (`DISCORD_USER_ID`), so it'll show nothing live in a dev
session — that's expected, not a bug. The accumulated Played/Listening
history it seeds is unrelated to that live socket and works fully offline.

**Never run bare `pnpm dev` / `pnpm dev:web` for manual testing, and never
reuse another session's server or port.** Each agent/session gets its own
`--id` and therefore its own isolated server, frontend, and database — this is
what stops concurrent agents from clobbering each other's data or fighting
over a port (and from stepping on the human owner's own `pnpm dev`, which
writes to the shared default `./data/letsgaming.sqlite`), and it holds across
separate sessions too, not just within one conversation.

## After finishing that work

Run:

```bash
node scripts/dev-down.mjs --id <the-same-session-id>
```

This stops exactly the two processes `dev-up.mjs` started for that id (never a
broad process-name kill — only the recorded PIDs), then deletes that id's
database, media dir, and logs. Always pair a `dev-up` with a matching
`dev-down`, even if the session ends abnormally — `dev-up.mjs` also
defensively wipes stale state under the same id before starting, but don't
rely on that; clean up your own id when you're done with it.

## Never do this instead

- Never `kill`/`taskkill` a dev process by matching its command name or port —
  that risks killing another agent's or the working owner's process. Use
  `dev-down.mjs`, which kills by exact recorded PID.
- Never delete `data/` wholesale, or edit the repo's own `.env` — that state
  may not be yours and may belong to someone else's in-progress work.
  `dev-up.mjs`/`dev-down.mjs` only ever touch `data/agent-<id>/`.
- Never point a manually-started `pnpm dev` / `pnpm dev:web` pair at the
  default ports/database "just this once" — even for a quick check. Use
  `dev-up.mjs` every time; it's exactly as fast and never collides with
  anyone else's session.

See `scripts/dev-up.mjs` / `scripts/dev-down.mjs` /
`apps/server/scripts/seed-mock-data.ts` for the implementation, and
[`docs/reference/commands.md`](./docs/reference/commands.md) for the full
command reference.

## Before considering any change done

```bash
pnpm lint:nav      # information-architecture gates — nav can't widen past 5 or nest past 3
pnpm typecheck     # all packages, incl. vue-tsc for the web app
pnpm test          # unit + integration
pnpm build         # full build (also runs lint:nav)
```

CI runs the same checks on Node 22 and 24. `@lg/core` is imported by every
other package and resolves through `dist/`, so build it first on a fresh
checkout: `pnpm --filter @lg/core build`.

## Conventions worth knowing before editing

- **Only normalized data crosses the store/API/frontend seam.** A raw source
  API shape (GitHub, Wakapi) never leaks past that source's own `normalize()`
  in `packages/sources`.
- **Everything human-authored is `Localized`** (`packages/core`'s `l(en, de)`
  helper): English is required, German is added as content, never as a schema
  change. A new seed string, module heading, or UI message needs both.
- **The nav is a tree with a lint** (`pnpm lint:nav`): don't widen a level
  past five children or nest past three deep — split into sub-nodes instead.
  See [`docs/concepts/information-architecture.md`](./docs/concepts/information-architecture.md).
- **The CMS stays small.** Every proposed CMS feature is measured against
  "does this project actually need it?" — see
  [`docs/concepts/the-cms.md`](./docs/concepts/the-cms.md).
- **TypeScript strict**, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
  Use `import type` for type-only imports; relative imports use `.js`
  extensions (ESM); workspace packages are imported by name (`@lg/core`).
- Playbooks for adding a data source, a module, or a nav node live in
  [`docs/guides/extending.md`](./docs/guides/extending.md) — each is meant to
  be a small, local change.
- Privacy is a design constraint, not an afterthought: no cookies/identifiers
  in analytics, contact relays to email and stores nothing, IP is dropped at
  parse time. See [`docs/concepts/analytics-and-privacy.md`](./docs/concepts/analytics-and-privacy.md)
  before touching anything in `apps/server/src/analytics` or the contact route.
