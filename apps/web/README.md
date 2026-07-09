# @lg/web

Astro (SSR) + Vue islands. The public site, the `/admin` CMS, and the on-site
docs.

| Path | Role |
|---|---|
| `pages/index.astro` | SSR: loads the `SiteView` from the read API per request (`lib/site.ts`, briefly cached), renders the shell. |
| `components/TabbedSite.vue` | The interactive island: tabs, 3D tilt, entrance, theme toggle (all off under `prefers-reduced-motion`). |
| `components/Module.vue` | Renders each module by kind. |
| `components/AssetPicture.vue` | Renders library images as responsive `<picture>` elements. |
| `pages/admin.astro`, `components/cms/CmsApp.vue` | The CMS (client-only). |
| `pages/docs/[...slug].astro`, `lib/docs.ts` | The `/docs` renderer over the repo's own Markdown. |
| `pages/md/[slug].astro` | Markdown assets published at `/md/<slug>`. |
| `pages/datenschutz.astro` | Static privacy page. |
| `styles/tokens.css` | Dark and light design tokens; fonts self-hosted. |

Two API URLs: `API_URL` (SSR, server-side) and `PUBLIC_API_URL` (browser, baked
in at build). Scripts: `pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm typecheck`.
