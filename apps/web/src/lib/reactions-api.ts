/**
 * The wave reaction service. Resolves to the new global count, or `null` on any
 * failure (including the server's rate limit) so the caller can roll back its
 * optimistic increment.
 */
import { apiUrl } from "./api";

export async function postWave(): Promise<number | null> {
  try {
    const res = await fetch(apiUrl("/api/reactions/wave"), {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { count?: number };
    return typeof body.count === "number" ? body.count : null;
  } catch {
    return null;
  }
}
