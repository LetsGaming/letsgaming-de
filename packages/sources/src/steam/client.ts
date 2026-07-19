/**
 * Steam Web API client — PARKED.
 *
 * The minimal fetch layer for the public Steam Web API: given an API key (secret)
 * and a 64-bit SteamID, fetch the profile summary (current game) and the
 * recently-played list. Runs server-side only — the key is a secret.
 *
 * Nothing in the live site imports this. The Steam integration was trimmed back to
 * this core (the adapter, the icon-colour sampler, and the registry wiring were
 * removed) so it can be revived later without having quietly rotted in the
 * meantime — see the README in this folder.
 *
 * It deliberately depends on NOTHING internal — not `@lg/core`, not the shared
 * `http` helper. That independence is the whole point: the rest of the codebase
 * can change its `Result` type, restructure its http client, rename its errors,
 * and this keeps compiling, because it references none of it. The only assumption
 * is the platform `fetch`. A little duplication (a local result type, a small
 * fetch wrapper) is the deliberate price of a dormant module that stands alone.
 *
 * To revive: wrap {@link fetchSteam} in a `Source` adapter — map {@link SteamResult}
 * to the app's `Result`, and {@link SteamRaw} to a normalized shape — and register
 * it in `../registry.ts`. The previous adapter and accent sampler are in git
 * history if you want them back.
 */

export interface SteamConfig {
  /** Steam Web API key (secret). */
  apiKey: string;
  /** 64-bit SteamID (the profile to read). */
  steamId: string;
  /** Injectable fetch, for tests. */
  fetchImpl?: typeof fetch;
}

export interface RawSteamSummary {
  response?: {
    players?: { gameid?: string; gameextrainfo?: string }[];
  };
}

export interface RawSteamRecent {
  response?: {
    games?: {
      appid: number;
      name: string;
      playtime_2weeks?: number;
      /** Lifetime minutes. Monotonic, unlike the 2-week window — which is what
       *  makes differencing two snapshots of it exact rather than decay-corrupted. */
      playtime_forever?: number;
      img_icon_url?: string;
    }[];
  };
}

export interface SteamRaw {
  summary: RawSteamSummary;
  recent: RawSteamRecent;
}

/** Why a fetch failed. The client's own error vocabulary, so it owes nothing to
 *  the app's error types. */
export interface SteamFetchError {
  kind: "timeout" | "network" | "http" | "parse";
  message: string;
  /** HTTP status, when the failure was an HTTP one. */
  status?: number;
}

/** This client's own Result — decoupled from the app's on purpose. */
export type SteamResult<T> = { ok: true; value: T } | { ok: false; error: SteamFetchError };

const HOST = "https://api.steampowered.com";
const DEFAULT_TIMEOUT_MS = 10_000;

/** GET JSON with a hard timeout, returning a typed result rather than throwing —
 *  a slow or down upstream is expected during a background sync. */
async function getJson<T>(url: string, fetchImpl?: typeof fetch): Promise<SteamResult<T>> {
  const doFetch = fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: timedOut ? "timeout" : "network",
        message: timedOut
          ? `request to ${hostOf(url)} timed out after ${DEFAULT_TIMEOUT_MS}ms`
          : `request to ${hostOf(url)} failed: ${messageOf(e)}`,
      },
    };
  }

  if (!res.ok) {
    return { ok: false, error: { kind: "http", message: `${hostOf(url)} responded ${res.status}`, status: res.status } };
  }

  try {
    return { ok: true, value: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: { kind: "parse", message: `invalid JSON from ${hostOf(url)}: ${messageOf(e)}` } };
  }
}

/** Fetch the profile summary (current game) and the recently-played list. */
export async function fetchSteam(config: SteamConfig): Promise<SteamResult<SteamRaw>> {
  const key = encodeURIComponent(config.apiKey);
  const id = encodeURIComponent(config.steamId);

  const [summary, recent] = await Promise.all([
    getJson<RawSteamSummary>(`${HOST}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${id}`, config.fetchImpl),
    getJson<RawSteamRecent>(
      `${HOST}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${key}&steamid=${id}&count=6`,
      config.fetchImpl,
    ),
  ]);
  if (!summary.ok) return summary;
  if (!recent.ok) return recent;
  return { ok: true, value: { summary: summary.value, recent: recent.value } };
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
