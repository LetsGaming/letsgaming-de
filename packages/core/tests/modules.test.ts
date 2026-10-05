import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeFeaturedSettings } from "../src/modules.js";

test("sanitizeFeaturedSettings keeps known keys, clamps count, caps and dedupes repos", () => {
  assert.deepEqual(
    sanitizeFeaturedSettings({ mode: "manual", repos: [" a ", "a", "b", "c", "d", 5], count: 9, extra: 1 }),
    { mode: "manual", repos: ["a", "b", "c"], count: 3 },
  );
  assert.deepEqual(sanitizeFeaturedSettings({ mode: "x", count: 0 }), { mode: "auto", repos: [], count: 1 });
  assert.deepEqual(sanitizeFeaturedSettings(null), { mode: "auto", repos: [], count: 3 });
});
