# @lg/web

Nuxt 3 (SSR). The public site, the `/admin` CMS, and the on-site docs — one Vue
app, no island directives.

| Path | Role |
|---|---|
| `pages/index.vue`, `pages/[area].vue` | The dashboard. One area per route; a hidden area 404s because the resolver strips it from `nav`. |
| `server/utils/site.ts` | Resolves the `SiteView` per request by opening the store **read-only** — a local read, not an HTTP hop. Falls back to the API, then to the committed fixture. Server-only. |
| `server/api/site.get.ts` | What the pages fetch; picks the locale from `?lang` / `Accept-Language`. Called in-process during SSR. |
| `components/shell/AreaPage.vue` | The dashboard shell: brand, `SiteChrome`, `SitePanels`, footer, per-area SEO. |
| `components/shell/Module.vue` | Renders each module by kind (a `kind → component` map). |
| `components/ui/SmartLink.vue` | The site's only anchor. On-site → `<NuxtLink>`; off-site → `target="_blank"`. `target`/`as` override the rule where needed. |
| `components/docs/DocsShell.vue` | Sidebar, mobile drawer and topbar, shared by both docs routes. |
| `pages/docs/[...slug].vue`, `server/utils/docs.ts` | The `/docs` renderer over the repo's own Markdown (`marked` + the `lib/docs` helpers). Prerendered. |
| `pages/docs/api.vue` | Generated API reference, read from repo-root `openapi.yml`. Prerendered. |
| `pages/md/[...slug].vue` | Markdown assets published at `/md/<slug>`, fetched from the API. |
| `pages/admin.vue`, `components/cms/CmsApp.vue` | The CMS. Auth and data are client-side against the API. |
| `stores/site.ts` | Theme, as a Pinia store — per-request on the server, so state can't leak between visitors. |
| `styles/tokens.css` | Dark and light design tokens; fonts self-hosted. `pnpm lint:tokens` fails the build if a `var()` resolves to nothing. |

Two API URLs: `API_URL` (SSR, server-side) and `PUBLIC_API_URL` (browser, inlined
at build via `vite.define`, because `lib/api.ts` captures it at module scope).

`DOCS_DIR` and `OPENAPI_PATH` override where the docs and the OpenAPI spec are
read from. The cwd-relative defaults are correct when prerendering; the container
sets both explicitly so the SSR fallback also works.

Scripts: `pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm typecheck`, `pnpm test`,
`pnpm lint:tokens`.
