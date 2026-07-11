import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWakapi } from "../src/wakapi/index.js";
import type { WakapiRaw } from "../src/wakapi/fetch.js";
import { normalizeSteam } from "../src/steam/index.js";
import type { SteamRaw } from "../src/steam/fetch.js";

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

test("steam: recent games sorted by 2-week playtime, current game surfaced", () => {
  const raw: SteamRaw = {
    summary: { response: { players: [{ gameid: "730", gameextrainfo: "Counter-Strike 2" }] } },
    recent: {
      response: {
        games: [
          { appid: 427520, name: "Factorio", playtime_2weeks: 120 },
          { appid: 730, name: "Counter-Strike 2", playtime_2weeks: 300, img_icon_url: "abc" },
        ],
      },
    },
  };
  const d = normalizeSteam(raw);
  assert.equal(d.playing?.name, "Counter-Strike 2");
  assert.equal(d.playing?.appId, 730);
  assert.equal(d.recent[0]?.name, "Counter-Strike 2"); // higher 2-week playtime first
  assert.match(d.recent[0]?.iconUrl ?? "", /apps\/730\/abc\.jpg$/);
});

test("steam: no current game when profile isn't in-game", () => {
  const raw: SteamRaw = {
    summary: { response: { players: [{}] } },
    recent: { response: { games: [] } },
  };
  assert.equal(normalizeSteam(raw).playing, undefined);
});
