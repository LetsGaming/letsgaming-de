/**
 * UI strings — the site's own chrome, as opposed to content.
 *
 * There are two kinds of text on this site and they localize differently.
 * *Content* (headings, bio paragraphs, link labels) is authored in the CMS and
 * stored as `Localized`, so translating it is a content task — that's `i18n.ts`.
 * *Chrome* is the text the components themselves emit: "show 3 more", "Nothing
 * played this day", the footer, the empty states. That has no CMS row to live in,
 * and it was hardcoded English, which is why switching to German left half the
 * page in English.
 *
 * This is the catalog for the second kind. Deliberately a plain typed object and
 * not an i18n framework: `@lg/core` stays runtime-dependency-free, and the whole
 * surface is small enough that the value of a library is outweighed by the weight.
 *
 * The typing is the point. `Messages` is derived from the English catalog, so a
 * German entry that's missing or misspelled is a compile error rather than a
 * string that silently renders in the wrong language. Adding a key forces both
 * translations.
 */

import { DEFAULT_LOCALE, type Locale } from "./i18n.js";

/**
 * Plural forms. English and German both have a simple singular/plural split, so
 * one shape covers both; a locale needing more forms would extend this type and
 * the compiler would demand the extra entries everywhere.
 */
export interface Plural {
  one: string;
  other: string;
}

const EN = {
  // Shared / shell
  loading: "Loading…",
  lastSynced: "last synced",
  docs: "Docs",
  privacy: "Privacy",
  backToStart: "← back to the homepage",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  theme: "Theme",
  language: "Language",

  // Generic empty + error states
  nothingHere: "Nothing here yet.",
  loadDayFailed: "Couldn't load that day.",
  loadPreviewFailed: "Couldn't render the preview.",

  // Section-specific empty states
  emptyActivity: "Nothing synced from GitHub yet.",
  emptyCoding: "No coding time synced yet.",
  emptyFeatured: "Nothing pinned right now.",
  emptyProjects: "No projects to show.",
  emptyGallery: "No pictures yet.",
  emptyGuestbook: "No notes yet — be the first to sign.",
  emptyPosts: "Nothing published yet.",
  emptyNow: "Nothing written here lately.",
  emptyMusic:
    "Nothing recorded yet. Tracks show up here after the presence sampler catches Spotify playing — give it a day.",
  emptyPlaytime:
    "Nothing recorded yet. Games show up here after the presence sampler catches you playing — give it a day.",
  emptyDayPlaytime: "Nothing played this day.",
  emptyDayMusic: "Nothing played this day.",

  // Lists
  showLess: "show less",
  showMore: "show {n} more",
  andMore: "and {n} more",

  // Activity
  contributions: "Contributions",
  contributionsScope: "last 26 weeks · {n} in the window",
  languages: "Languages",
  languagesScope: "across all public repos",
  recentEvents: "Recent events",
  newestFirst: "newest first",
  fullActivity: "full activity →",

  // Projects / featured
  seeAllWork: "see all my work →",
  allReposGitHub: "all repos on GitHub →",

  // Music / playtime
  listening: "Listening",
  played: "Played",
  lastFourteenDays: "last 14 days",
  topSongs: "Top songs",
  topArtists: "Top artists",
  topGames: "Top games",
  backToTopSongs: "← back to top songs",
  backToTopArtists: "← back to top artists",
  backToTopGames: "← back to top games",
  whenIPlay: "When I play",
  localTime: "Local",
  timeListening: "time listening",
  timePlayed: "time played",
  emptyWrapped: "Nothing to look back on for this period yet.",
  tracksPlayed: "tracks played",
  differentArtists: "different artists",
  minutesShort: "min",

  // Coding
  codingScope: "{range} · {hours}h tracked",
} as const;

/** The key set every locale must provide, derived from English. */
export type MessageKey = keyof typeof EN;
export type Messages = Record<MessageKey, string>;

const DE: Messages = {
  loading: "Lädt…",
  lastSynced: "zuletzt synchronisiert",
  docs: "Doku",
  privacy: "Datenschutz",
  backToStart: "← zurück zur Startseite",
  openMenu: "Menü öffnen",
  closeMenu: "Menü schließen",
  theme: "Design",
  language: "Sprache",

  nothingHere: "Hier ist noch nichts.",
  loadDayFailed: "Dieser Tag konnte nicht geladen werden.",
  loadPreviewFailed: "Vorschau konnte nicht erstellt werden.",

  emptyActivity: "Noch nichts von GitHub synchronisiert.",
  emptyCoding: "Noch keine Coding-Zeit synchronisiert.",
  emptyFeatured: "Gerade nichts angepinnt.",
  emptyProjects: "Keine Projekte vorhanden.",
  emptyGallery: "Noch keine Bilder.",
  emptyGuestbook: "Noch keine Einträge — trag dich als Erste:r ein.",
  emptyPosts: "Noch nichts veröffentlicht.",
  emptyNow: "Hier steht gerade nichts.",
  emptyMusic:
    "Noch nichts aufgezeichnet. Songs erscheinen hier, sobald der Presence-Sampler Spotify beim Abspielen erwischt — gib ihm einen Tag.",
  emptyPlaytime:
    "Noch nichts aufgezeichnet. Spiele erscheinen hier, sobald der Presence-Sampler dich beim Spielen erwischt — gib ihm einen Tag.",
  emptyDayPlaytime: "An diesem Tag nichts gespielt.",
  emptyDayMusic: "An diesem Tag nichts gehört.",

  showLess: "weniger anzeigen",
  showMore: "{n} weitere anzeigen",
  andMore: "und {n} weitere",

  contributions: "Beiträge",
  contributionsScope: "letzte 26 Wochen · {n} im Zeitraum",
  languages: "Sprachen",
  languagesScope: "über alle öffentlichen Repos",
  recentEvents: "Letzte Aktivitäten",
  newestFirst: "neueste zuerst",
  fullActivity: "gesamte Aktivität →",

  seeAllWork: "alle Projekte ansehen →",
  allReposGitHub: "alle Repos auf GitHub →",

  listening: "Gehört",
  played: "Gespielt",
  lastFourteenDays: "letzte 14 Tage",
  topSongs: "Top-Songs",
  topArtists: "Top-Künstler:innen",
  topGames: "Top-Spiele",
  backToTopSongs: "← zurück zu den Top-Songs",
  backToTopArtists: "← zurück zu den Top-Künstler:innen",
  backToTopGames: "← zurück zu den Top-Spielen",
  whenIPlay: "Wann ich spiele",
  localTime: "Lokal",
  timeListening: "Hörzeit",
  timePlayed: "Spielzeit",
  emptyWrapped: "Für diesen Zeitraum gibt es noch nichts zurückzublicken.",
  tracksPlayed: "Songs gehört",
  differentArtists: "verschiedene Künstler:innen",
  minutesShort: "Min",

  codingScope: "{range} · {hours} Std. erfasst",
};

/**
 * Plural-sensitive strings, kept apart from the flat catalog because they need a
 * count to resolve. German and English disagree here in ways a single string
 * can't express (one "Song" vs several "Songs", one "Spiel" vs "Spiele").
 */
const PLURALS: Record<Locale, Record<"track" | "artist" | "game", Plural>> = {
  en: {
    track: { one: "track", other: "tracks" },
    artist: { one: "artist", other: "artists" },
    game: { one: "game", other: "games" },
  },
  de: {
    track: { one: "Song", other: "Songs" },
    artist: { one: "Künstler:in", other: "Künstler:innen" },
    game: { one: "Spiel", other: "Spiele" },
  },
};

const CATALOG: Record<Locale, Messages> = { en: EN, de: DE };

/**
 * Look up a UI string, substituting `{name}` placeholders.
 *
 * Falls back to English for an unknown locale rather than rendering a key — a
 * visitor seeing English is a much smaller failure than one seeing `showMore`.
 */
export function t(
  key: MessageKey,
  locale: Locale = DEFAULT_LOCALE,
  vars?: Record<string, string | number>,
): string {
  const message = (CATALOG[locale] ?? CATALOG[DEFAULT_LOCALE])[key];
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** The correct plural form of a countable noun for the locale. */
export function plural(
  noun: "track" | "artist" | "game",
  count: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const forms = (PLURALS[locale] ?? PLURALS[DEFAULT_LOCALE])[noun];
  return count === 1 ? forms.one : forms.other;
}
