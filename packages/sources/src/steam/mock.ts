/**
 * A stand-in Steam source for local dev when no key is configured. Returns the
 * normalized shape directly, so the presence widget's "recently played" renders
 * offline. Deterministic — no RNG.
 */

import { ok } from "@lg/core";
import type { Source, SteamData } from "@lg/core";

const DEMO: SteamData = {
  recent: [
    { name: "Counter-Strike 2", appId: 730, minutes2Weeks: 620 },
    { name: "Factorio", appId: 427520, minutes2Weeks: 310 },
    { name: "Hades II", appId: 1145350, minutes2Weeks: 145 },
  ],
};

export function steamMockSource(): Source<SteamData, SteamData> {
  return {
    id: "steam",
    targetArea: "life",
    schedule: "*/15 * * * *",
    fetch: async () => ok(DEMO),
    normalize: (raw) => raw,
  };
}
