/**
 * Playtime service: one day's game breakdown, fetched when a ledger column is
 * clicked. Separate module from music and presence — the concerns don't share an
 * endpoint (see the server's split routes), so they don't share a client either.
 */
import type { PlaytimeDayResponse } from "@lg/core";
import { apiUrl } from "./api";

/** Throws on a non-2xx or network error; the drill composable maps that to its
 *  error state. `day` is `YYYY-MM-DD`. */
export async function fetchPlaytimeDay(day: string, tz?: string): Promise<PlaytimeDayResponse["games"]> {
  const res = await fetch(apiUrl(`/api/playtime/day?day=${day}${tz ? `&tz=${encodeURIComponent(tz)}` : ""}`), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as PlaytimeDayResponse).games;
}
