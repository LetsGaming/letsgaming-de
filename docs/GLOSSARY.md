# Glossary

Terms specific to this project that are easy to misread or would otherwise need a
trip through the code. The general project vocabulary (module, node, snapshot,
store, and so on) lives in [concepts/glossary](./concepts/glossary.md); this page
holds the terms for analytics and the dashboard, plus the two navigation words the
analytics events lean on. Background is in
[analytics-and-privacy](./concepts/analytics-and-privacy.md) and
[ADR 0018](./adr/0018-visit-model.md).

## Navigation and content

| Term | Meaning |
|---|---|
| Area | A page of the site: a nav leaf the visitor switches to. The `tab`, `transition`, `dwell`, `scroll`, `exit` and `session_tabs` events are per area. Not the same as a module section. |
| Module section | One `<section class="module-section">` on a page, rendering one module. The tracker watches these with an `IntersectionObserver`; a module counts as seen once at least half of it (or half the viewport) is visible. Several per area. |

## Counting visits

| Term | Meaning |
|---|---|
| Script load | A page load in which the tracker ran and was allowed to measure. Counted once per load as the `viewport` event. Not a person: a bare load that never engages is still a load. |
| Confirmed visit | A script load that showed real engagement. Counted by the one-time `visit` event, sent at the first of four triggers: scroll to 25 percent, a module section seen, 5 seconds of visible time, or a click. The trigger is the event key. |
| Completed visit | A visit whose page reported its end. Counted by `session_dwell`, which is only sent on `pagehide`, so a tab the OS kills while backgrounded never completes. Reads below confirmed visits by construction. |
| Beacon coverage | `script loads / page views`. How much of the logged traffic ran the tracker at all. Null with no page views. |
| Confirmation rate | `confirmed visits / script loads`. How many loads turned into engagement. Null with no loads. |
| Unverified view | A log page view with no matching script load (`page views - script loads`, never negative): clients without JavaScript, tracker blockers, Do Not Track, opt-outs, and any non-human the classifier missed. A count, never a list of requests. |

## Classifying the access log

| Term | Meaning |
|---|---|
| Traffic class | What the classifier decides a counted log line is: **page view** (a 2xx page served to a browser-like client), **bot** (a request that says, or behaves like, automation), **probe** (a request for something only a scanner asks for), or **not found** (a 404 or 410 that is otherwise innocent). Stored as the `traffic` dimension (`pageview`, `bot`, `probe`, `notfound`). Redirects, assets and internal paths are ignored and never counted. |
| Exclusion rule | The stable id of the classifier rule that removed a request from the page views (`probe-wordpress`, `ua-headless`, `burst-adjacent`, and so on). Stored as the `exclusion` dimension so every excluded request stays explainable. Not-found lines record `not-found`. |
| Burst-adjacent | The one rule that looks past a single line: a page view with at least 3 probe or not-found lines within 10 seconds on either side is reclassified as a bot. It uses log timestamps only, never an address. A real page view that coincides with a scan can be lost to it; a confirmed visit cannot. |
| Stale browser rule | The user-agent rule `ua-stale-browser`: a browser older than a floor in `STALE_BROWSER_MIN` (for example Chrome below 120) is treated as a scanner's replayed user-agent pool, not a person. Raise the floors as real browsers move on. |

## Storage and reading

| Term | Meaning |
|---|---|
| Rollup grain | The bucket size of a pre-aggregated row in `analytics_rollup` and `analytics_summary`. `hour` is a UTC hour (`2026-07-17T14`), kept 14 days. `day` is a Europe/Berlin calendar day (`2026-07-17`), 23 to 25 hours long across DST, kept indefinitely. |
| Measured / not measured | A figure is measured only if its window reaches the first `visit` event ever recorded. Before that, confirmed visits are a missing number, not a zero, and the dashboard says "not measured" instead of showing 0 or inventing one from completed visits. |
| `confirmationSince` | The UTC hour bucket of the first recorded `visit` event, or null if there is none. It decides measured, partially measured and not measured for a window. |
| Approximate zone | A day-unit range read in a time zone other than Europe/Berlin. Day rollups are Berlin days, so these columns are rebuilt from the hourly rows instead: limited to the hourly retention (about 90 days) and flagged `range.approximateZone`. |
