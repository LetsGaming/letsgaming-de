import { DEFAULT_LOCALE, plural, t, type Locale, type MessageKey } from "@lg/core";

/**
 * UI-string lookup bound to the locale the page was rendered in.
 *
 * The locale is resolved server-side per request (`?lang`, else Accept-Language)
 * and travels with the SiteView, so it's stored here rather than re-derived: a
 * component that guessed from `navigator.language` would disagree with what SSR
 * rendered and cause a hydration mismatch.
 *
 *   const { t } = useT();
 *   t("showMore", { n: 3 })
 */
export function useLocale() {
  return useState<Locale>("site-locale", () => DEFAULT_LOCALE);
}

export function useT() {
  const locale = useLocale();
  return {
    locale,
    t: (key: MessageKey, vars?: Record<string, string | number>) => t(key, locale.value, vars),
    plural: (noun: "track" | "artist" | "game", count: number) => plural(noun, count, locale.value),
  };
}
