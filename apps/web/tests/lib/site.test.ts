import { describe, expect, it } from "vitest";
import { pickLocale } from "../../src/lib/site";

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
