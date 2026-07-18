/**
 * The Steam adapter — Source<SteamRaw, SteamData>. `normalize` is pure.
 */

import { SOURCE_TTL, type Source, type SteamData } from "@lg/core";
import { fetchSteam, type SteamConfig, type SteamRaw } from "./fetch.js";
import { sampleAccent } from "./accent.js";

/** CDN icon URL for a game, from its appid + img_icon_url hash. */
function iconUrl(appId: number, hash?: string): string | undefined {
  if (!hash) return undefined;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
}

/**
 * Sample each game's icon and attach its dominant colour.
 *
 * This runs after `normalize` rather than inside it: the contract says normalize
 * is pure, and decoding an image is neither pure nor synchronous. Sampling in
 * `fetch` would be the alternative, but the icon URL only exists once normalize
 * has built it — so the adapter does it on the way out, in parallel, and a
 * failure just means no accent.
 */
export async function withAccents(data: SteamData): Promise<SteamData> {
  const recent = await Promise.all(
    data.recent.map(async (g) => {
      if (!g.iconUrl) return g;
      const accent = await sampleAccent(g.iconUrl);
      return accent ? { ...g, accent } : g;
    }),
  );
  return { ...data, recent };
}

export function normalizeSteam(raw: SteamRaw): SteamData {
  const player = raw.summary.response?.players?.[0];
  const playing =
    player?.gameid && player.gameextrainfo
      ? { name: player.gameextrainfo, appId: Number(player.gameid) }
      : undefined;

  const recent = (raw.recent.response?.games ?? [])
    .map((g) => ({
      name: g.name,
      appId: g.appid,
      minutes2Weeks: g.playtime_2weeks ?? 0,
      minutesForever: g.playtime_forever ?? 0,
      ...(iconUrl(g.appid, g.img_icon_url) ? { iconUrl: iconUrl(g.appid, g.img_icon_url) } : {}),
    }))
    .sort((a, b) => b.minutes2Weeks - a.minutes2Weeks)
    .slice(0, 6);

  return { ...(playing ? { playing } : {}), recent };
}

/** Build the Steam source. */
export function steamSource(config: SteamConfig): Source<SteamRaw, SteamData> {
  return {
    id: "steam",
    schedule: "*/15 * * * *", // every 15 minutes
    ttl: SOURCE_TTL.steam,
    fetch: () => fetchSteam(config),
    normalize: normalizeSteam,
    enrich: withAccents,
  };
}
