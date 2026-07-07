import type { SiteView } from "@lg/core";
import fallback from "../data/fallback-site.json";

/** Escape HTML, then turn `**bold**` into <b>…</b>. Safe for v-html: the only
 *  markup introduced is <b>, and all original characters are escaped first. */
export function mdBold(input: string): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

// Short server-side cache so per-request SSR doesn't hammer the API. The store
// only changes on a sync or a CMS edit, so a few seconds of staleness is fine.
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; view: SiteView }>();

/**
 * Load the resolved SiteView (server-side only — never runs in the browser).
 * Reads the read API (which reads the local store), with a brief cache and a
 * committed-fixture fallback so a page still renders if the API is briefly down.
 * "Nothing fetched on page load" holds: this reads the store, never GitHub.
 */
export async function loadSite(locale = "en"): Promise<SiteView> {
  const cached = cache.get(locale);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.view;

  // API_URL is server-only (no PUBLIC_ prefix) so it isn't exposed to the client.
  const base = import.meta.env.API_URL ?? process.env.API_URL;
  if (base) {
    try {
      const res = await fetch(`${base}/api/site?locale=${encodeURIComponent(locale)}`);
      if (res.ok) {
        const view = (await res.json()) as SiteView;
        cache.set(locale, { at: Date.now(), view });
        return view;
      }
      console.warn(`[web] read API returned ${res.status}; using fallback fixture.`);
    } catch (err) {
      console.warn(`[web] read API unreachable (${String(err)}); using fallback fixture.`);
    }
  }
  return fallback as unknown as SiteView;
}
