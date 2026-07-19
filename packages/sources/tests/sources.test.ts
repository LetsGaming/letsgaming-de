import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWakapi } from "../src/wakapi/index.js";
import type { WakapiRaw } from "../src/wakapi/fetch.js";

test("wakapi: languages sort by time, drop zero-time, and cap", () => {
  const raw: WakapiRaw = {
    data: {
      human_readable_range: "last 7 days",
      total_seconds: 10000,
      languages: [
        { name: "CSS", total_seconds: 1000, percent: 10 },
        { name: "TypeScript", total_seconds: 6000, percent: 60 },
        { name: "Nothing", total_seconds: 0, percent: 0 },
        { name: "Python", total_seconds: 3000, percent: 30 },
      ],
    },
  };
  const d = normalizeWakapi(raw);
  assert.equal(d.range, "last 7 days");
  assert.deepEqual(d.languages.map((l) => l.name), ["TypeScript", "Python", "CSS"]); // zero dropped, sorted
  assert.equal(d.languages[0]?.pct, 60);
});

// ── RAWG game-metadata adapter ───────────────────────────────────────────────
import { normalizeRawgGame } from "../src/rawg/index.js";
import { searchRawgGame } from "../src/rawg/fetch.js";

test("rawg: normalize picks cover art + first genre, tolerates gaps", () => {
  assert.deepEqual(
    normalizeRawgGame({
      name: "Palworld",
      background_image: "https://media.rawg.io/media/games/x.jpg",
      genres: [{ name: "Action" }, { name: "Adventure" }],
    }),
    { coverUrl: "https://media.rawg.io/media/games/x.jpg", genre: "Action" },
  );
  // no cover, no genre → an empty object, never undefined-valued fields
  assert.deepEqual(normalizeRawgGame({ name: "Obscure Jam Game" }), {});
  // null background_image (RAWG's schema allows it) is treated as absent
  assert.deepEqual(normalizeRawgGame({ name: "X", background_image: null, genres: [] }), {});
});

test("rawg: search returns the top match, null when RAWG has none", async () => {
  const hit = (async () =>
    new Response(
      JSON.stringify({ results: [{ name: "Palworld", background_image: "u", genres: [{ name: "Action" }] }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  const res = await searchRawgGame("Palworld", { apiKey: "k", fetchImpl: hit });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value?.name, "Palworld");

  const empty = (async () =>
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  const none = await searchRawgGame("zzznotagame", { apiKey: "k", fetchImpl: empty });
  assert.equal(none.ok, true);
  if (none.ok) assert.equal(none.value, null);
});
