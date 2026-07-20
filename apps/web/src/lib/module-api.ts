/**
 * Module service: fetch one freshly-resolved module by id from `/api/module/:id`.
 *
 * The live-refresh counterpart to the day-drill fetchers — it returns the same
 * `{ id, kind, data }` the SSR page rendered, so a widget can replace its slice
 * with current data. Returns `null` on any failure so the caller keeps its last
 * good render rather than blanking.
 */
import type { ResolvedModule } from "@lg/core";
import { apiUrl } from "./api";

export async function fetchModule(id: string, locale: string, tz?: string): Promise<ResolvedModule | null> {
  try {
    const params = new URLSearchParams({ locale });
    if (tz) params.set("tz", tz);
    const res = await fetch(apiUrl(`/api/module/${encodeURIComponent(id)}?${params.toString()}`), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as ResolvedModule;
  } catch {
    return null;
  }
}
