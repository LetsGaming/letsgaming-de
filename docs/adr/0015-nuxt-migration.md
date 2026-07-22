# 0015: Nuxt 3 for the web app (supersedes 0003)

Status: **Accepted** — supersedes [0003](./0003-astro-vue-ssr.md).

## Context

0003 chose Astro for the shell with Vue islands for the interactive parts, output
as SSR so the site resolves the `SiteView` per request. That decision held up: SSR
from the local store, minimal JS on content pages, and content collections for
`/docs` all delivered what they promised.

What changed is the shape of the app around it. The interactive surface grew until
the codebase was ~85% Vue by line count (5,578 lines of `.vue` against 952 lines of
`.astro`), and roughly half of that Vue is the `/admin` CMS — a full SPA that Astro
only hosts. The Astro layer had become a thin shell over a large Vue application.

That thinness had a cost at the seam: two link components (one `.astro`, one
`.vue`) for one rule, `client:*` directives to reason about on every interactive
component, and a separate state library (nanostores) chosen specifically because
Astro couldn't guarantee a single shared instance across island bundles.

An explicit alternative considered and rejected: a bare Vue SPA, and Ionic. Both
lose SSR and the content pipeline, which the public site genuinely uses.

## Decision

Migrate `apps/web` to **Nuxt 3** (SSR, Nitro `node-server` preset). Keep everything
the Astro setup was doing well:

- Per-request SSR resolving the `SiteView` by opening the store **read-only**
  in-process (`server/utils/site.ts`) — still a local read, not an HTTP hop, because
  Nuxt calls its own server routes in-process during SSR.
- `/docs` and `/datenschutz` prerendered, over the repo's own Markdown, reusing the
  existing pure helpers (`docTitle`, `buildDocTree`, `rewriteDocLink`) with `marked`
  as the renderer — the same one the blog already used, so there's now one markdown
  path instead of two.
- The API stays a separate Fastify service. Nitro serves the read path and SSR only.

`apps/server` and every package under `packages/` are untouched; the migration is
confined to `apps/web`.

## Consequences

- One framework, one component model. The dual `SmartLink` collapses to one, the
  `client:*` directives are gone, and internal links gain client-side navigation via
  `<NuxtLink>`.
- Shared client state moved to Nuxt's `useState`, which is per-request on the server
  — the isolation nanostores were being used to approximate. Pinia was tried first
  and removed: its Nuxt payload plugin calls `obj.hasOwnProperty()` over everything
  Nuxt serializes, which crashes on the null-prototype object in a 404 payload
  (nuxt/nuxt#32740, still open against pinia 3.x). One ref of state didn't justify
  a store library or that bug class.
- `PUBLIC_API_URL` is inlined into the client bundle at build via `vite.define`,
  because `lib/api.ts` captures it at module scope. Nuxt also has to be pointed at
  the shared monorepo-root `.env` explicitly — it only auto-loads a `.env` beside
  its own config, and `nuxt dev` runs with the app directory as cwd.
- Prerendered docs read repo-root files relative to cwd, which is correct at build
  time but not at runtime; `DOCS_DIR` and `OPENAPI_PATH` override those paths so the
  SSR fallback works in the container.
- Lost: Astro's built-in Shiki syntax highlighting for docs code blocks. `marked`
  emits plain `<pre><code>`, styled by our CSS. Reintroduce with `marked-shiki` if
  it turns out to matter.
