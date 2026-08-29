# Repo Audit — 2026-08-26

Full-repo bug/issue sweep across all five workspaces (`apps/server`, `apps/web`, `packages/core`, `packages/db`, `packages/sources`), done by five independent reviews reading the actual source rather than diffs. Scope was correctness bugs, security issues, error handling, and resource/concurrency problems — not style.

**Bottom line**: the codebase is unusually disciplined (extensive "why" comments, consistent trust-boundary handling, no SQL injection, no XSS, no missing timeouts on almost every outbound fetch). Ten real findings survived review, two of them worth fixing soon.

## Summary

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | HIGH | server | Unhandled promise rejection in presence sampler can crash the whole process |
| 2 | HIGH | db | `seedIfEmpty` isn't transactional — an interrupted first boot permanently bricks the store |
| 3 | MEDIUM | server | Dev-login loopback guard trusts `req.ip`, which depends on the independently-configurable `TRUST_PROXY` flag |
| 4 | MEDIUM | core | `targetHref`/`areaHref` don't recurse into nested nav `children` — landmine for the next IA change |
| 5 | MEDIUM | db | Presence/music history tables are indexed on `last_seen_at` but queried on `started_at` |
| 6 | MEDIUM | sources | GitHub repo list caps at 100 with no pagination — repo count and repo list/language mix can silently diverge |
| 7 | LOW | server | GitHub OAuth token/user-info fetches have no timeout (only fetch pair in the codebase without one) |
| 8 | LOW | db | `0008_game_metadata.sql` missing `IF NOT EXISTS`, inconsistent with sibling migrations |
| 9 | LOW | sources | GitHub gists `files` field has no explicit limit — possible undercount past schema default |
| 10 | LOW | sources | Merged-PR/event cards fall back to blank repo name instead of being dropped when the source repo is deleted |
| — | note | server | `apps/server/src/routes/media.ts` is never registered in `app.ts` — dead code, confirm it's superseded by `routes/assets.ts` |

`apps/web` had no findings above the noise floor — SSR guarding, `v-html` trust boundaries, and route-param handling all checked out.

---

## Findings in detail

### 1. [HIGH] Unhandled promise rejection can crash the server
**`apps/server/src/sync/presence-sampler.ts:94,109,141`**

`sample()` try/catches only the Lanyard `fetch` call. The `store.music.observe(...)` / `store.sessions.observe(...)` calls below it (a DB write) have no try/catch, and the cron callback invokes `sample()` as `() => void this.sample())` — nothing awaits or `.catch()`s it. Node's default `unhandledRejections` mode is `throw`, so any DB error here (constraint violation, lock contention, an unexpected Lanyard response shape) takes down the entire API/CMS/sync process, not just presence sampling.

`SyncRunner.runSource` already wraps normalize/persist in try/catch for exactly this reason — the sampler should follow the same pattern.

**Fix**: wrap the per-activity persistence calls in try/catch, and add a `.catch()` at the `void this.sample()` call site as a backstop. Consider a top-level `process.on("unhandledRejection", ...)` safety net too.

### 2. [HIGH] `seedIfEmpty` isn't transactional
**`packages/db/src/seed.ts:135-163`**

The bootstrap seed does several sequential `INSERT`s (`site_content`, `site_ia`, `site_presence`, then projects/hobbies/links/now) with no `transact()` wrapper — unlike every other multi-statement write in this codebase. The "already seeded" guard only checks `site_content`. If the process dies between the first and second insert (OOM, container restart, disk-full on first deploy), `site_content` exists but `site_ia` doesn't. On the next boot, the guard sees `site_content` and returns early without retrying — `site_ia` is now permanently empty, and `store.ia.getNav()` throws uncaught on every SSR page render (`site-view.ts:90`).

**Fix**: wrap the seed body in `transact(db, () => { ... })`, same pattern used in `content-repo.ts`/`source-repo.ts`/`analytics-repo.ts`.

### 3. [MEDIUM] Dev-login loopback guard depends on `TRUST_PROXY`
**`apps/server/src/auth/dev-login.ts:43`**

The dev-login route's second guard checks `req.ip` against a loopback allowlist, but `req.ip` reflects `X-Forwarded-For` whenever `env.trustProxy` is true — a separate toggle from `NODE_ENV`. A staging deploy with `TRUST_PROXY=true` behind a reverse proxy, reachable from the internet, would let an attacker spoof `X-Forwarded-For: 127.0.0.1` and mint a valid signed CMS session — full auth bypass. Guard 1 (route not registered in production) is the real defense; guard 2 is weaker than its comment implies.

**Fix**: use the raw socket address for this specific check instead of `req.ip`, or explicitly document/enforce that `TRUST_PROXY` must never be combined with a non-`production` `NODE_ENV` on a publicly reachable host.

### 4. [MEDIUM] `targetHref`/`areaHref` don't recurse into nav `children`
**`packages/core/src/nav.ts:138-143`**

`NavNode` is a documented recursive tree (`nav-lint.ts` enforces up to 3 levels deep), and `walkNav`/`collectModuleIds` correctly recurse. `targetHref`/`areaHref` don't — they only `.find()` in the flat array they're handed. Currently masked because the shipped nav (`LAUNCH_NAV`) is one level deep. The moment the CMS-owned nav grows a branch, any `#anchor` link into a nested area silently falls through to the inert `#target` fallback — no crash, no lint error, just a dead link.

**Fix**: make `targetHref`/`areaHref` recurse into `children`, mirroring `walkNav`.

### 5. [MEDIUM] Index/query mismatch on presence & music history tables
**`packages/db/src/sessions-repo.ts:148,172,204`, `music-repo.ts:216,245`; migrations `0003`, `0005`**

`heatmap`/`dailyTotals`/`dayBreakdown` filter on `started_at`, but the only indexes on `presence_sessions`/`music_plays` are keyed on `last_seen_at`. These are append-only, never-pruned tables — fine at today's scale, will degrade as history grows.

**Fix**: add `(category, started_at)` / `(started_at)` indexes matching the actual query shape, in a new migration (existing ones are immutable per the project's own rule).

### 6. [MEDIUM] GitHub repo list has no pagination past 100
**`packages/sources/src/github/fetch.ts:109,177`, `github/index.ts:15-27`**

`repositories(first: 100, ...)` has no cursor handling. For an account with >100 non-fork public repos, `stats.repos` (from `totalCount`) would report the true count while the repo list and language-mix aggregation silently only reflect the 100 most-recently-pushed repos — a display inconsistency, not a crash.

**Fix**: add cursor-based pagination, or explicitly cap and document it the way the codebase already does for other `first: N` calls (which carry an explicit "top N" comment — this one doesn't).

### 7–10. LOW

- **`apps/server/src/auth/github-oauth.ts:62-77`** — the OAuth token/user-info fetches are the only pair in the codebase without `AbortSignal.timeout(...)`. Add one for consistency; a hanging github.com response otherwise holds the login request open indefinitely.
- **`packages/db/src/migrations/0008_game_metadata.sql:9`** — missing `IF NOT EXISTS` on `CREATE TABLE game_metadata`. Not a functional bug (migrations only ever run once), but inconsistent with `0002`/`0003`/`0012`. Leave as-is (don't edit an applied migration) — just don't copy this pattern forward.
- **`packages/sources/src/github/fetch.ts:131,203`** — `gists(first: 8, ...)` doesn't cap `files`, so `g.files.length` could undercount past GitHub's schema default. Add an explicit `files(first: N)`.
- **`packages/sources/src/github/fetch.ts:195,283`** — merged-PR/event cards fall back to an empty repo name (`""`) instead of being dropped when the source repo was deleted/renamed. Filter these out in `normalizeGitHub` instead.

### Note: dead code
**`apps/server/src/routes/media.ts`** — `registerMediaRoutes` is never called from `app.ts`. Not flagged as a bug (unreachable code doesn't misbehave), but worth a quick check that `routes/assets.ts` fully supersedes it, then delete it.

---

## Suggested work plan

**Phase 1 — fix now (both HIGH, low effort, real production risk) — ✅ done 2026-08-26**
1. ✅ Wrapped `seedIfEmpty` in `transact()` — `packages/db/src/seed.ts`. Required making `transact()` reentrant first (`packages/db/src/row-mapper.ts`), since `content.upsertProject`/etc. each open their own transaction internally via `write()`. Verified with a fresh-store smoke test (seed + re-open) plus the full `@lg/db` suite (70/70 pass).
2. ✅ Guarded the presence sampler's DB writes with try/catch (mirroring `SyncRunner.runSource`) + a `.catch()` backstop on the cron callback — `apps/server/src/sync/presence-sampler.ts`. Full `@lg/server` suite passes (122/122).

Both fixes typecheck clean repo-wide (`pnpm -r typecheck`) and all tests pass repo-wide (`pnpm -r test`).

**Phase 2 — fix soon (MEDIUM, no urgency but real bugs) — ✅ done 2026-08-26**
3. ✅ `targetHref` now recurses into nav `children` (`packages/core/src/nav.ts`) — resolves to the top-level routable ancestor's href regardless of nesting depth. Added `packages/core/tests/nav.test.ts` (7 new tests) covering flat, nested-leaf, and nested-branch-id resolution.
4. ✅ Dev-login loopback guard now checks `req.socket.remoteAddress` instead of `req.ip` (`apps/server/src/auth/dev-login.ts`), so it no longer depends on `TRUST_PROXY`. Added `apps/server/tests/dev-login.test.ts` with a regression test that spoofs `X-Forwarded-For` behind `TRUST_PROXY=true` and confirms the request is still rejected (403).
5. ✅ Added `packages/db/src/migrations/0013_history_started_at_indexes.sql` — `(category, started_at)` on `presence_sessions`, `(started_at)` on `music_plays`, matching the day/heatmap query shape. Verified the migration applies on a fresh store.
6. ✅ Documented the GitHub repo-list's 100-item cap as deliberate (`packages/sources/src/github/fetch.ts`) rather than adding cursor pagination — per the audit's own note this is low-likelihood for a personal-site-scale account, and the codebase's convention elsewhere (`pinnedItems`, `pullRequests`, `gists`) is a documented cap, not pagination. `repositoriesTotal` and `repos.length` are now explicitly noted as able to diverge.

Full repo-wide `pnpm -r typecheck` and `pnpm -r test` pass after each of the four fixes.

**Phase 3 — cleanup (LOW + housekeeping) — ✅ done 2026-08-26**
7. ✅ Added `AbortSignal.timeout(8000)` to both GitHub OAuth fetches (`apps/server/src/auth/github-oauth.ts`), matching the timeout already used elsewhere (`presence-sampler.ts`'s Lanyard fetch).
8. ✅ Capped `gists.files(first: 20)` in the GraphQL query and documented why (`packages/sources/src/github/fetch.ts`). Merged-PR cards with a deleted source repo (`repository: null`) are now filtered out instead of showing a blank repo name; same fix applied to the REST-sourced event feed (`e.repo?.name` missing).
9. ✅ Deleted `apps/server/src/routes/media.ts` after confirming `routes/assets.ts` fully supersedes it (asset library with folders/tags/variants vs. the old flat upload endpoint) and nothing imports `registerMediaRoutes`. `env.mediaDir` stays — it's actively used by `assets.ts`/`cms.ts`/`module.ts`/`read.ts`.
10. Left as-is per the finding itself: `0008_game_metadata.sql`'s missing `IF NOT EXISTS` is a style inconsistency in an already-applied migration — editing it would trip the runner's checksum guard, and it isn't a functional bug.

Repo-wide `pnpm -r typecheck` and `pnpm -r test` pass after every fix in this phase.

## Status: all three phases complete (2026-08-26)

Every finding from the original sweep has been addressed — fixed, tested, and verified, or (for #6 and #10) deliberately left as documented, lower-risk alternatives to the audit's own suggested fix. Repo-wide typecheck and test suite are green.
