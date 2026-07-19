import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchSteam } from "../src/steam/client.js";

/**
 * The Steam client is parked (nothing in the live site imports it), but it stays
 * in the build and under test so it can't rot before someone revives it. These
 * exercise the two things that matter: it hits both endpoints and returns the raw
 * shape on success, and it degrades to a typed error (never throws) on failure.
 */

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("fetchSteam returns the raw summary + recent on success", async () => {
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("GetPlayerSummaries")) {
      return jsonResponse({ response: { players: [{ gameid: "1623730", gameextrainfo: "Palworld" }] } });
    }
    return jsonResponse({ response: { games: [{ appid: 1623730, name: "Palworld", playtime_2weeks: 900 }] } });
  }) as typeof fetch;

  const res = await fetchSteam({ apiKey: "k", steamId: "1", fetchImpl });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.value.summary.response?.players?.[0]?.gameextrainfo, "Palworld");
  assert.equal(res.value.recent.response?.games?.[0]?.name, "Palworld");
});

test("fetchSteam degrades to a typed http error, does not throw", async () => {
  const fetchImpl = (async () => new Response("nope", { status: 503 })) as typeof fetch;
  const res = await fetchSteam({ apiKey: "k", steamId: "1", fetchImpl });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.kind, "http");
  assert.equal(res.error.status, 503);
});
