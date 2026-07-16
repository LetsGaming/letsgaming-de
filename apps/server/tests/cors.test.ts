import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * The CORS allow-list is hand-maintained and the routes are not, so it drifts —
 * PATCH was absent from it since the CMS was written and only surfaced when
 * something finally tried to edit an asset. Preflight failures never reach the
 * server, so there's no log line to find: the browser just refuses.
 *
 * This asserts the list covers what's registered, by reading both.
 */
test("CORS allows every method the routes actually register", () => {
  const routeSrc = ["assets", "read", "cms", "track", "guestbook", "auth", "health"]
    .map((f) => {
      try {
        return readFileSync(new URL(`../src/routes/${f}.ts`, import.meta.url), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
  const used = new Set(
    [...routeSrc.matchAll(/\bapp\.(get|post|put|patch|delete)\s*[<(]/g)].map((m) =>
      (m[1] as string).toUpperCase(),
    ),
  );
  const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const listed = new Set(
    (/methods:\s*\[([^\]]+)\]/.exec(appSrc)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean),
  );
  const missing = [...used].filter((m) => !listed.has(m));
  assert.deepEqual(missing, [], `CORS omits registered method(s): ${missing.join(", ")}`);
});
