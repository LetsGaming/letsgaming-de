import { describe, expect, it } from "vitest";
import { isModuleKind, type ModuleKind } from "@lg/core";
import fallback from "../src/data/fallback-site.json";

/**
 * The committed fixture the site renders when the read API is unreachable.
 *
 * `loadSite()` returns it as `fallback as unknown as SiteView` — a double cast,
 * because importing JSON widens every `kind: "hero"` to `kind: string` and a
 * discriminated union won't take that. The workaround is fine; the consequence
 * isn't. Nothing checks this file against the shape it claims, so it can rot
 * quietly and you'd find out during an outage, which is the one moment it exists
 * for.
 *
 * These are the checks the double cast switched off. They're the cheap half —
 * the real fix is deleting the fetch this fixture exists to survive (SWEEP §4,
 * "the HTTP hop"): with the store a function call away, there's no network to
 * fall back from.
 */
describe("the fallback fixture is still a site", () => {
  const site = fallback as {
    locale: string;
    meta: Record<string, string>;
    nav: { id: string; label: string; modules: string[] }[];
    modules: Record<string, { id: string; kind: string }>;
  };

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
