import { describe, expect, it } from "vitest";
import { chooseRequestLang, pickLocale } from "../../src/lib/text";

describe("chooseRequestLang", () => {
  it("lets an explicit ?lang win over everything", () => {
    expect(chooseRequestLang({ explicit: "de", hydrating: false, rendered: "en", stored: "en" })).toBe("de");
    expect(chooseRequestLang({ explicit: "en", hydrating: true })).toBe("en");
  });

  it("sends nothing during the first render, so the server decides", () => {
    expect(chooseRequestLang({ hydrating: true, rendered: "en", stored: "en" })).toBeUndefined();
  });

  it("keeps the language the previous page rendered in on a tab switch", () => {
    // The bug: the new URL has no ?lang and the browser prefers German.
    expect(chooseRequestLang({ hydrating: false, rendered: "en" })).toBe("en");
    expect(chooseRequestLang({ hydrating: false, rendered: "de", stored: "en" })).toBe("de");
  });

  it("falls back to the stored choice when no area page has rendered yet", () => {
    expect(chooseRequestLang({ hydrating: false, rendered: null, stored: "en" })).toBe("en");
    expect(chooseRequestLang({ hydrating: false, stored: "de" })).toBe("de");
  });

  it("ignores an unknown stored value and leaves the choice to the server", () => {
    expect(chooseRequestLang({ hydrating: false, rendered: null, stored: "fr" })).toBeUndefined();
    expect(chooseRequestLang({ hydrating: false, rendered: null, stored: null })).toBeUndefined();
  });
});

describe("pickLocale", () => {
  it("honours an explicit, valid ?lang param above everything", () => {
    expect(pickLocale("de", "en-US,en;q=0.9")).toBe("de");
    expect(pickLocale("en", "de-DE,de;q=0.9")).toBe("en");
  });

  it("ignores an invalid param and falls through", () => {
    expect(pickLocale("fr", "de-DE,de;q=0.9")).toBe("de");
    expect(pickLocale("", null)).toBe("en");
  });

  it("reads the first known base tag from Accept-Language", () => {
    expect(pickLocale(null, "de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(pickLocale(null, "fr-FR,fr;q=0.9,de;q=0.7")).toBe("de");
  });

  it("defaults to English when nothing matches", () => {
    expect(pickLocale(null, "fr-FR,es;q=0.9")).toBe("en");
    expect(pickLocale(undefined, undefined)).toBe("en");
  });
});
