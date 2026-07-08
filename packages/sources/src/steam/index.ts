/**
 * The Steam adapter — Source<SteamRaw, SteamData>. `normalize` is pure.
 */

import type { Source, SteamData } from "@lg/core";
import { fetchSteam, type SteamConfig, type SteamRaw } from "./fetch.js";

/** CDN icon URL for a game, from its appid + img_icon_url hash. */
function iconUrl(appId: number, hash?: string): string | undefined {
  if (!hash) return undefined;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
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
    targetArea: "life",
    schedule: "*/15 * * * *", // every 15 minutes
    fetch: () => fetchSteam(config),
    normalize: normalizeSteam,
  };
}
