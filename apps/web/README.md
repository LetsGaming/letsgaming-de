# @lg/web

Astro (SSR) + Vue islands. The public site and the `/admin` CMS.

- **`pages/index.astro`** — SSR: loads the `SiteView` from the read API per
  request (`lib/site.ts`, briefly cached), renders the shell.
- **`components/TabbedSite.vue`** — the interactive island: tabs, 3D tilt,
  entrance, theme toggle (all off under `prefers-reduced-motion`).
- **`components/Module.vue`** — renders each module by kind.
- **`pages/admin.astro` + `components/cms/CmsApp.vue`** — the CMS (client-only).
- **`pages/datenschutz.astro`** — static privacy page.
- **`styles/tokens.css`** — dark + light design tokens; fonts self-hosted.

Two API URLs: `API_URL` (SSR, server-side) and `PUBLIC_API_URL` (browser, baked
in at build). Scripts: `pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm typecheck`.
