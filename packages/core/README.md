# @lg/core

Shared contracts and pure logic, no runtime dependencies. The seam the whole
system is built around.

| Path | Role |
|---|---|
| `i18n.ts` | `Locale`, `Localized`, `localize()`. i18n-ready from day one. |
| `nav.ts`, `nav-lint.ts` | The recursive `NavNode` tree and the build-time lint that enforces the IA gates (`pnpm lint:nav`). |
| `content.ts` | The CMS-owned content model (all localized). |
| `source.ts` | The `Source<Raw, Normalized>` contract and the normalized outputs (`GitHubData`, `WakapiData`, `SteamData`). |
| `modules.ts`, `view.ts` | Module kinds and the render-ready `SiteView`. |
| `resolve.ts` | `resolveSiteView()`: content + normalized source data into the exact JSON the frontend renders. |
| `ia.ts` | The canonical launch nav tree + module registry. |
| `format.ts` | Relative times, heatmap bucketing, and other pre-computation. |
| `analytics.ts`, `guestbook.ts`, `presence.ts`, `assets.ts` | Shared types and pure helpers for the engagement vocabulary, guestbook scoring, presence filtering, and asset views. |

Build before the other packages: `pnpm --filter @lg/core build`.
