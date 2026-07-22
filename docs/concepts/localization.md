# Localization

The site is served in English and German. Which text you get from where depends on
what kind of text it is, and the split is the whole design.

## Two layers, two mechanisms

**Content** — headings, the bio, link labels, hobby descriptions, "now" lines.
Authored in the CMS, stored as `Localized`:

```json
{ "en": "Listening", "de": "Gehört" }
```

`localize(value, locale)` resolves one, falling back to English (always present) when
a German value hasn't been written yet. Translating content is therefore a CMS task,
not a deploy — and partially-translated content is valid rather than a build error.

**UI strings** — text the components emit themselves: "show 3 more", "Nothing played
this day", "last 14 days", the footer. These have no CMS row to live in, so they come
from a typed catalog: `packages/core/src/ui-messages.ts`.

```ts
const { t, plural } = useT();
t("showMore", { n: 3 })        // "show 3 more" / "3 weitere anzeigen"
plural("track", count)          // "tracks" / "Songs"
```

Before this existed the chrome was hardcoded English, so switching to German
translated the content and left everything around it in the wrong language.

## Why the catalog is typed the way it is

`Messages` is derived from the English catalog:

```ts
export type MessageKey = keyof typeof EN;
export type Messages = Record<MessageKey, string>;
const DE: Messages = { … };
```

So a German entry that's missing or misspelled is a compile error, and adding a key
forces both translations. That's the property worth having — the failure mode of an
untyped catalog is a stray English word in a German page, which nothing catches.

Plurals are a separate table, because English and German don't split the same way
(`1 Song / 2 Songs`, `1 Künstler:in / 2 Künstler:innen`).

Deliberately not an i18n framework: `@lg/core` stays runtime-dependency-free, and at
this size the library would weigh more than the problem.

## How the locale is chosen

Server-side, per request, in this order:

1. `?lang=de` — an explicit choice, and what the language switcher sets (it also
   persists to `localStorage` and reloads, because the locale is resolved during SSR).
2. The visitor's `Accept-Language`.
3. `DEFAULT_LOCALE` (`en`).

`pickLocale()` does this; the resolved locale travels with the `SiteView` and is
published via `useLocale()`. Components read it through `useT()` rather than deriving
it from `navigator.language` — a client that guessed would disagree with what the
server rendered and cause a hydration mismatch.

## Adding a string

1. Add the key and English text to `EN` in `packages/core/src/ui-messages.ts`.
2. Add the German. (Skip it and the build fails, which is the point.)
3. Use it: `const { t } = useT()`, then `t("yourKey")`.

## What isn't translated

The `/admin` CMS is English only. It's single-user, behind auth, and not indexed —
the catalog is available if that ever changes, but translating ~200 admin strings
buys nothing today. `/datenschutz` is German by nature.
