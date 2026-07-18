/**
 * Music service: one day's tracks, fetched when a listening-timeline column is
 * clicked. A sibling of playtime-api — same day-drill shape, different concern
 * and endpoint (`/api/music/day`).
 */
import type { MusicDayResponse } from "@lg/core";
import { apiUrl } from "./api";

/** Throws on a non-2xx or network error; the drill composable maps that to its
 *  error state. `day` is `YYYY-MM-DD`. */
export async function fetchMusicDay(day: string): Promise<MusicDayResponse["tracks"]> {
  const res = await fetch(apiUrl(`/api/music/day?day=${day}`), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as MusicDayResponse).tracks;
}
