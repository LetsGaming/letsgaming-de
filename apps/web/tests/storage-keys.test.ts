import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INLINE_SCRIPT_KEYS } from "@lg/core";
import { describe, expect, it } from "vitest";

/**
 * The anti-FOUC script (nuxt.config's `app.head`) runs before hydration and
 * cannot import, so it
 * inlines the storage key as a literal while the store uses STORAGE_KEY. Two
 * spellings of one key, in two files, with nothing linking them — rename one and
 * the site silently forgets the visitor's theme on every load, with nothing
 * failing anywhere.
 *
 * The script can't consume the constant. It can be checked against it.
 *
 * It's checked against INLINE_SCRIPT_KEYS rather than all of STORAGE_KEY, because
 * not every storage key belongs in a script about first paint — the analytics
 * opt-out is read long after hydration. Iterating the whole object made adding a
 * key anywhere fail a test about theme flashing, which is a test that has stopped
 * describing its own subject.
 */
describe("storage keys", () => {
  it("are read by the inline script exactly as the store writes them", () => {
    const config = readFileSync(resolve("nuxt.config.ts"), "utf8");
    const read = [...config.matchAll(/localStorage\.getItem\(["']([^"']+)["']\)/g)].map(
      (m) => m[1] as string,
    );
    for (const key of INLINE_SCRIPT_KEYS) {
      expect(read, `the inline theme script never reads localStorage key "${key}"`).toContain(key);
    }
  });
});
