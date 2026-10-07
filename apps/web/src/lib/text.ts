import { isLocale, type Locale } from "@lg/core";

/**
 * Client-safe text helpers.
 *
 * These were in `site.ts`, but that file now imports the database layer to build
 * the SiteView directly (no HTTP hop) — and three client components import
 * `mdBold`. Anything a `.vue` imports gets bundled into the browser, so pulling
 * `mdBold` in from `site.ts` would drag `@lg/db` and node:sqlite into the client
 * bundle. Keeping the pure helpers here keeps that boundary clean: this file has
 * no server-only imports, so a component can use it freely.
 */

/**
 * Decide which locale to render, SSR-side. Precedence: an explicit `?lang`
 * choice, then the browser's `Accept-Language` (first tag whose base is a known
 * locale — browsers send these in descending preference), then English. Pure so
 * it's unit-testable; the page passes the request's param + header.
 */
export function pickLocale(param?: string | null, acceptLanguage?: string | null): Locale {
  if (param && isLocale(param)) return param;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const base = part.split(";")[0]?.trim().toLowerCase().split("-")[0] ?? "";
    if (isLocale(base)) return base;
  }
  return "en";
}

/**
 * The `lang` the next `/api/site` request should carry.
 *
 * An explicit `?lang` always wins. During the first render nothing is sent and the
 * server decides: the head script has already reloaded with `?lang` when the
 * visitor stored a choice. After that, navigation is client-side. The head script
 * does not run again and the request's own `Accept-Language` knows nothing about
 * the visitor's choice, so a tab click would fall back to the browser language.
 * The locale the previous area page rendered in is reused instead, or the stored
 * choice when no area page has rendered yet (a visit that started on a page that
 * ignores `?lang`).
 */
export function chooseRequestLang(input: {
  explicit?: string | null;
  hydrating: boolean;
  rendered?: Locale | null;
  stored?: string | null;
}): Locale | string | undefined {
  if (input.explicit) return input.explicit;
  if (input.hydrating) return undefined;
  if (input.rendered) return input.rendered;
  return isLocale(input.stored) ? input.stored : undefined;
}

/** Escape HTML, then turn `**bold**` into <b>…</b>. Safe for v-html: the only
 *  markup introduced is <b>, and all original characters are escaped first. */
export function mdBold(input: string): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
