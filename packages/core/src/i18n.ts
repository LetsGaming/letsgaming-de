/**
 * i18n primitives.
 *
 * Every human-authored string in the system is `Localized`, so shipping German
 * later is a content task in the CMS, not a schema migration. English is the
 * launch locale (PROJECT.md §13.3); `de` exists in the type from day one but may
 * be absent in data — `localize()` falls back gracefully.
 */

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * A locale-keyed string. `en` is required (launch locale); other locales are
 * optional so partially-translated content is valid rather than a build error.
 */
export type Localized = { en: string } & Partial<Record<Locale, string>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Resolve a Localized value for a locale, falling back to English (always present). */
export function localize(value: Localized, locale: Locale = DEFAULT_LOCALE): string {
  return value[locale] ?? value.en;
}

/** Convenience for authoring English-only content that stays type-correct. */
export function en(text: string): Localized {
  return { en: text };
}
