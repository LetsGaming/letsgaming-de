/**
 * The day-drill client: one day's breakdown, fetched when a timeline column is
 * clicked.
 *
 * Music and playtime had a module each — `music-api.ts` and `playtime-api.ts` —
 * that were identical apart from the response type and one path segment, right
 * down to the comments. The justification given at the time was that the concerns
 * don't share an endpoint, so they shouldn't share a client; but what's shared
 * here isn't the endpoint, it's the *request shape* — same query params, same
 * timezone handling, same error contract, same consumer (`useLedgerStrip`). A
 * change to any of those had to be made twice, which is exactly the failure mode
 * duplication causes.
 *
 * The per-service functions stay, so call sites read the same and each keeps its
 * own response type; only the body they shared is written once.
 */
import type { MusicDayResponse, PlaytimeDayResponse } from "@lg/core";
import { apiUrl } from "./api";

/**
 * Fetch one day from a service's `/day` endpoint. Throws on a non-2xx or network
 * error; the drill composable maps that to its error state. `day` is `YYYY-MM-DD`;
 * `tz` is the viewer's zone, omitted when the server should use the owner's.
 */
async function fetchDay<T>(service: "music" | "playtime", day: string, tz?: string): Promise<T> {
  const query = new URLSearchParams({ day });
  if (tz) query.set("tz", tz);
  const res = await fetch(apiUrl(`/api/${service}/day?${query.toString()}`), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/** One day's tracks, for the listening timeline. */
export const fetchMusicDay = (day: string, tz?: string): Promise<MusicDayResponse> =>
  fetchDay<MusicDayResponse>("music", day, tz);

/** One day's game breakdown, for the playtime ledger. */
export const fetchPlaytimeDay = (day: string, tz?: string): Promise<PlaytimeDayResponse> =>
  fetchDay<PlaytimeDayResponse>("playtime", day, tz);
