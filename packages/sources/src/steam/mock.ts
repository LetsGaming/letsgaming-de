/**
 * A stand-in Steam source for local dev when no key is configured. Returns the
 * normalized shape directly, so the presence widget's "recently played" renders
 * offline. Deterministic — no RNG.
 */

import { ok, SOURCE_TTL } from "@lg/core";
import type { Source, SteamData } from "@lg/core";

const DEMO: SteamData = {
  recent: [
    { name: "Counter-Strike 2", appId: 730, minutes2Weeks: 620, minutesForever: 74_300 },
    { name: "Factorio", appId: 427520, minutes2Weeks: 310, minutesForever: 12_800 },
    { name: "Hades II", appId: 1145350, minutes2Weeks: 145, minutesForever: 3_120 },
  ],
};

export function steamMockSource(): Source<SteamData, SteamData> {
  return {
    id: "steam",
    schedule: "*/15 * * * *",
    ttl: SOURCE_TTL.steam,
    fetch: async () => ok(DEMO),
    normalize: (raw) => raw,
  };
}
