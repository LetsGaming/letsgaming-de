/**
 * Steam fetch layer (public Steam Web API). Needs an API key (secret) + a 64-bit
 * SteamID, so it runs server-side during sync — never in the browser. Provides
 * the "what I actually play" half of the Discord presence widget; Lanyard covers
 * the live half. Kept separate from normalize() so the mapping stays testable.
 */

export interface SteamConfig {
  /** Steam Web API key (secret). */
  apiKey: string;
  /** 64-bit SteamID (the profile to read). */
  steamId: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

export interface RawSteamSummary {
  response?: {
    players?: { gameid?: string; gameextrainfo?: string }[];
  };
}

export interface RawSteamRecent {
  response?: {
    games?: { appid: number; name: string; playtime_2weeks?: number; img_icon_url?: string }[];
  };
}

export interface SteamRaw {
  summary: RawSteamSummary;
  recent: RawSteamRecent;
}

const HOST = "https://api.steampowered.com";

/** Fetch the profile summary (current game) and recently-played list. */
export async function fetchSteam(config: SteamConfig): Promise<SteamRaw> {
  const doFetch = config.fetchImpl ?? fetch;
  const key = encodeURIComponent(config.apiKey);
  const id = encodeURIComponent(config.steamId);

  const [summaryRes, recentRes] = await Promise.all([
    doFetch(`${HOST}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${id}`),
    doFetch(`${HOST}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${key}&steamid=${id}&count=6`),
  ]);
  if (!summaryRes.ok) throw new Error(`Steam summary HTTP ${summaryRes.status}`);
  if (!recentRes.ok) throw new Error(`Steam recent HTTP ${recentRes.status}`);

  return {
    summary: (await summaryRes.json()) as RawSteamSummary,
    recent: (await recentRes.json()) as RawSteamRecent,
  };
}
