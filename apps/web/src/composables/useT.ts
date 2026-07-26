import { DEFAULT_LOCALE, formatDuration, plural, t, type Locale, type MessageKey } from "@lg/core";
import { fmtDay } from "../lib/calendar";

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
    /**
     * A duration as plain text, for the places a `<Duration>` can't go: a `title`
     * attribute, an `aria-label`. Same rule and same unit labels as the component,
     * so a heatmap tooltip and the row beneath it can't disagree.
     */
    duration: (minutes: number) =>
      formatDuration(minutes, { hours: t("hoursShort", locale.value), minutes: t("minutesShort", locale.value) }),
    /**
     * A short day label — `Mon 3 Mar` / `Mo., 3. März`.
     *
     * Bound here for the same reason `duration` is: the eight call sites across the
     * two ledger modules would otherwise each thread the locale by hand, and the
     * one that forgot would render an English date on a German page — which is
     * exactly what `fmtDay`'s hardcoded `"en-GB"` did to all eight.
     */
    day: (iso: string) => fmtDay(iso, locale.value),
  };
}
