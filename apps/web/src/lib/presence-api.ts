/**
 * Presence service: the one place the browser fetches Discord presence.
 *
 * `/api/presence` is the server-filtered relay — the browser never talks to
 * Lanyard and never learns the Discord id. This returns `null` on any failure so
 * the caller can keep its last snapshot rather than invent a status (an offline
 * *response* is a fact; a failed *fetch* is not).
 */
import type { PresenceView } from "@lg/core";
import { apiUrl } from "./api";

export async function fetchPresence(): Promise<PresenceView | null> {
  try {
    const res = await fetch(apiUrl("/api/presence"), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as PresenceView;
  } catch {
    return null;
  }
}
