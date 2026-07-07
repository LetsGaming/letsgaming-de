# @lg/core

Shared contracts and pure logic — no runtime dependencies. The seam the whole
system is built around.

- **`i18n.ts`** — `Locale`, `Localized`, `localize()`. i18n-ready from day one.
- **`nav.ts` / `nav-lint.ts`** — the recursive `NavNode` tree and the build-time
  lint that enforces the information-architecture gates (`pnpm lint:nav`).
- **`content.ts`** — the CMS-owned content model (all localized).
- **`source.ts`** — the `Source<Raw,Normalized>` adapter contract + normalized
  source outputs (`GitHubData`).
- **`modules.ts` / `view.ts`** — module kinds and the render-ready `SiteView`.
- **`resolve.ts`** — `resolveSiteView()`: content + normalized source data →
  the exact JSON the frontend renders.
- **`ia.ts`** — the canonical launch nav tree + module registry.

Build before the other packages: `pnpm --filter @lg/core build`.
