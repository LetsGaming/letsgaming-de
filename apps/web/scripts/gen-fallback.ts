/**
 * Regenerate the SSR fallback fixture from the seed.
 *
 * `fallback-site.json` is what `loadSite` serves when neither the store nor the
 * read API is reachable. It was hand-written once and then rotted quietly: by the
 * time this script was added it still called the Code area `work` — renamed
 * several releases earlier — and was missing `wrapped`, `guestbook`, `gallery` and
 * `posts` entirely. Nothing caught it, because the only way to see the fixture is
 * to break the database.
 *
 * So it isn't hand-maintained any more. This boots an in-memory store, runs the
 * real seed and IA reconcile, and resolves the view through the real resolver —
 * once per locale. The fixture is therefore the same shape the site actually
 * serves, and a rename in `LAUNCH_NAV` can't leave it behind: re-run and commit.
 *
 *   pnpm --filter=@lg/web gen:fallback
 *
 * Both locales are emitted because the fallback is a *resolved* view — strings are
 * already localized, so a single fixture can only ever be one language. Serving a
 * German visitor the English one was the last place the locale silently didn't
 * apply.
 *
 * No source data is seeded, so the synced modules (activity, coding, projects)
 * resolve to their empty states. That's correct for this artefact: it is the
 * "nothing is reachable" view, and inventing repo counts here is exactly how the
 * old fixture came to show numbers that were never true.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, type SiteView } from "@lg/core";
import { buildSiteView, openStore } from "@lg/db";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/data/fallback-site.json");

// `openStore` migrates, seeds and reconciles — the same three steps the API runs
// on boot, so the fixture is built the way a real empty deployment would be.
const store = openStore(":memory:");

const byLocale: Record<string, SiteView> = {};
for (const locale of LOCALES) {
  byLocale[locale] = prune(
    await buildSiteView(store, {
      locale,
      mediaDir: "",
      // Pinned, not read from the environment: this file is committed, and a
      // fixture that recorded whether *the committing machine* had SMTP would
      // hand a deployment someone else's answer. `loadSite` overlays the real one
      // at serve time — the contact capability is knowable even when the store
      // isn't, so it's the one thing here that shouldn't be frozen.
      contact: { relay: false },
    }),
  );
}

/**
 * Drop the two ways a resolved view is legitimately self-inconsistent.
 *
 * Both are correct live behaviour, and both make a *fixture* wrong:
 *
 * - A nav leaf can place a module the resolver declined to emit. `wrapped` returns
 *   null outside its scheduled window — that's how its visibility is enforced — so
 *   `nav` names it and `modules` doesn't have it. The live site copes (`SitePanels`
 *   filters), but a fixture carrying a dangling id is a gap waiting to be rendered
 *   the day something stops filtering.
 * - A module can resolve without being reachable. `posts` sits in the hidden `blog`
 *   area, which `visibleNav` strips, so it survives in `modules` with nothing
 *   pointing at it — dead weight shipped to every visitor of a degraded site.
 *
 * Pruning both makes the fixture match what a page can actually draw, which is the
 * only thing this artefact is for.
 */
function prune(view: SiteView): SiteView {
  for (const area of view.nav) {
    if (area.modules) area.modules = area.modules.filter((id) => view.modules[id]);
  }
  const reachable = new Set(view.nav.flatMap((a) => a.modules ?? []));
  for (const id of Object.keys(view.modules)) {
    if (!reachable.has(id)) delete view.modules[id];
  }
  return view;
}

// `syncedAt` is whenever this ran, which would make the fixture look freshly
// synced to anything reading it. It hasn't synced at all — drop it, so the
// freshness badges resolve to "never" rather than lying about an hour ago.
for (const view of Object.values(byLocale)) delete (view as { syncedAt?: string }).syncedAt;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(byLocale, null, 2)}\n`, "utf8");

console.log(`✓ wrote ${target} (${LOCALES.join(", ")})`);
