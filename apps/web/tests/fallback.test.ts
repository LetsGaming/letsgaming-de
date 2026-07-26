import { describe, expect, it } from "vitest";
import { isModuleKind, LOCALES } from "@lg/core";
import fallback from "../src/data/fallback-site.json";

/**
 * The committed fixture the site renders when neither the store nor the read API
 * is reachable.
 *
 * `loadSite()` returns it through a double cast, because importing JSON widens
 * every `kind: "hero"` to `kind: string` and a discriminated union won't take
 * that. The workaround is fine; the consequence isn't. Nothing checked this file
 * against the shape it claims, so it rotted quietly — by the time anyone looked it
 * still named an area that had been renamed several releases earlier — and you'd
 * find out during an outage, which is the one moment it exists for.
 *
 * It's generated from the seed now (`pnpm --filter=@lg/web gen:fallback`) rather
 * than hand-maintained, which is the real fix for that drift. These checks stay as
 * the guard that the generator was actually re-run: regenerate and commit, or this
 * fails.
 *
 * Every check runs per locale. The fixture is a *resolved* view, so it carries one
 * fully-localized copy per language, and "the English one is fine" says nothing
 * about what a German visitor to a degraded site sees.
 */
type Fixture = {
  locale: string;
  meta: Record<string, string>;
  nav: { id: string; label: string; modules: string[] }[];
  modules: Record<string, { id: string; kind: string }>;
};

const fixtures = fallback as unknown as Record<string, Fixture>;

it("carries a resolved view for every shipped locale", () => {
  for (const locale of LOCALES) expect(Object.keys(fixtures)).toContain(locale);
});

describe.each(LOCALES)("the %s fallback fixture is still a site", (locale) => {
  const site = fixtures[locale]!;

  it("declares the locale it was resolved in", () => {
    expect(site.locale).toBe(locale);
  });

  it("only names module kinds that exist", () => {
    const kinds = Object.values(site.modules).map((m) => m.kind);
    expect(kinds.length).toBeGreaterThan(0);
    const unknown = kinds.filter((k) => !isModuleKind(k));
    expect(unknown).toEqual([]);
  });

  it("every module it places, it also defines", () => {
    // A nav entry pointing at a missing module renders as a gap. The live path
    // has the resolver to catch this; the fixture has nothing but this test.
    const defined = new Set(Object.keys(site.modules));
    const placed = site.nav.flatMap((a) => a.modules);
    expect(placed.filter((id) => !defined.has(id))).toEqual([]);
  });

  it("every module it defines, it also places", () => {
    // The other direction: a module in the fixture that no area shows is dead
    // weight shipped to every visitor of a degraded site.
    const placed = new Set(site.nav.flatMap((a) => a.modules));
    const orphans = Object.keys(site.modules).filter((id) => !placed.has(id));
    expect(orphans).toEqual([]);
  });

  it("keys each module by its own id", () => {
    for (const [key, mod] of Object.entries(site.modules)) expect(mod.id).toBe(key);
  });

  it("is resolved, not authored — no Localized objects survived", () => {
    // The fixture is a *SiteView*: the resolver already picked a locale, so a
    // `{ en, de }` anywhere means someone pasted SiteContent in by hand.
    const walk = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;
      const rec = node as Record<string, unknown>;
      if ("en" in rec && typeof rec.en === "string") return true;
      return Object.values(rec).some(walk);
    };
    expect(walk(site.modules)).toBe(false);
  });
});

it("actually localizes — the German fixture isn't the English one", () => {
  // The failure this catches is a generator that resolved both passes in one
  // locale, which produces a file that satisfies every check above and still
  // serves English to a German visitor. Nav labels are the cheapest witness: they
  // are seeded in both languages and at least one of them differs.
  const labels = (f: Fixture) => f.nav.map((a) => a.label).join("|");
  expect(labels(fixtures.de!)).not.toBe(labels(fixtures.en!));
});
