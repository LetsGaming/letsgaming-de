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

/**
 * Convenience for authoring a string in both shipped locales.
 *
 * The counterpart to `en()`, and the one that should be reached for by default now
 * that German is a shipped locale rather than a later content task. Written as a
 * positional pair rather than an object literal because the call sites are long
 * lists of short strings — `l("Home", "Start")` stays readable down a nav tree
 * where `{ en: "Home", de: "Start" }` does not.
 *
 * `en()` stays, and stays honest: it marks a string that genuinely has no German
 * yet, which is a different claim from one whose German happens to match.
 */
export function l(english: string, german: string): Localized {
  return { en: english, de: german };
}

/**
 * Fill in locales `base` is missing from `source`, without touching what it has.
 *
 * The rule the IA reconciler needs on boot: a store seeded before German existed
 * has `{ en }` where the code now has `{ en, de }`, and the German has to reach it
 * — but a heading the owner has since edited in the CMS must not be reverted to
 * the code's wording. Adding only absent locales does both: the German lands, the
 * edited English survives.
 */
export function mergeLocales(base: Localized, source: Localized): Localized {
  const merged: Localized = { ...base };
  let changed = false;
  for (const locale of LOCALES) {
    if (merged[locale] === undefined && source[locale] !== undefined) {
      merged[locale] = source[locale];
      changed = true;
    }
  }
  return changed ? merged : base;
}
