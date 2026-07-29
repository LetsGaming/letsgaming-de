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

  // Settings modal. Every string here was hardcoded English, so the one dialog a
  // German visitor opens to *switch to German* was the loudest untranslated
  // surface on the site.
  settings: "Settings",
  close: "Close",
  appearance: "Appearance",
  themeLight: "Light",
  themeDark: "Dark",
  // The settings group reuses the footer's `privacy` — same word, same meaning,
  // and a second key would be two strings to keep saying the same thing.
  analyticsTitle: "Anonymous usage analytics",
  analyticsDesc:
    "Helps me see which sections are useful. No cookies, no IP, no identifier — just aggregate counts.",
  analyticsDetails: "Details",
  analyticsDnt: "Turned off automatically — your browser sends a “Do Not Track” signal, which I respect.",
  languageNote: "Reloads the page in your language. Untranslated bits fall back to English.",

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

  // Glance stats. These were literals in `resolve.ts` — the numbers are synced,
  // but the words around them are chrome, and chrome belongs here. It's why a
  // German page read "20 public repos · 725 commits this year".
  // Default heading for the `areas` overview, used when the CMS hasn't set one.
  areasHeading: "Where to go next",
  areaModules: "{n} sections",
  areaModulesOne: "1 section",

  statRepos: "public repos",
  statCommitsYear: "commits this year",
  statCommitsAllTime: "commits all-time",
  statLongestStreak: "longest streak",
  repoCount: "{n} public repos",

  // Repo card meta.
  updatedAgo: "updated {age} ago",

  // Activity feed. The verb is chosen from the event type at render time; the
  // repo name is data. Previously `sources/github` baked the whole English
  // sentence into the stored event, which put a string no translation could
  // reach inside the store.
  eventCommit: "Pushed to {repo}",
  eventPr: "Opened a PR in {repo}",
  eventStar: "Starred {repo}",
  eventRepo: "Created {repo}",
  eventRelease: "Released {repo} {name}",
  eventMergedPr: "Merged “{title}” in {repo}",
  eventGist: "Shared a gist",
  eventGistNamed: "Shared a gist: {description}",

  // Projects / featured
  seeAllWork: "see all my work →",
  allReposGitHub: "all repos on GitHub →",

  // Music / playtime
  listening: "Listening",
  played: "Played",
  // The window a module is showing. `lastDays*` is the card's note — it has to
  // stand alone, because the picker scrolls out of view; `range*` is the picker
  // segment itself, abbreviated to fit a card header. One pair per
  // ACTIVITY_RANGES entry; `ACTIVITY_RANGE_LABELS` maps between them, so a new
  // range won't compile until both labels exist in both locales.
  lastDays14: "last 14 days",
  lastDays30: "last 30 days",
  lastDays90: "last 3 months",
  lastDays180: "last 6 months",
  lastDays365: "last year",
  range14: "14d",
  range30: "30d",
  range90: "3m",
  range180: "6m",
  range365: "1y",
  /** Names the range picker for assistive tech. */
  rangeLabel: "Time range",
  topSongs: "Top songs",
  topArtists: "Top artists",
  topGames: "Top games",
  topGenres: "Top genres",
  backToTopSongs: "← back to top songs",
  backToTopArtists: "← back to top artists",
  backToTopGames: "← back to top games",
  whenIPlay: "When I play",
  localTime: "Local",
  /** The owner's clock, when the viewer is in a different zone. `{city}` is the
   *  IANA zone's city ("Berlin") — a name, so it isn't translated, only framed. */
  ownerTime: "{city} time",
  /** Names the owner/local timezone toggle for assistive tech. */
  showTimesIn: "Show times in",
  timeListening: "time listening",
  timePlayed: "time played",
  emptyWrapped: "Nothing to look back on for this period yet.",
  tracksPlayed: "tracks played",
  differentArtists: "different artists",
  hoursShort: "h",
  minutesShort: "min",

  // Presence — the live Discord widget. Status names and the per-category source
  // lines ("Listening to Spotify") are what Discord itself says, so German keeps
  // the product names and translates only the verb around them.
  presenceOnline: "Online",
  presenceIdle: "Idle",
  presenceDnd: "Do not disturb",
  presenceOffline: "Offline",
  presenceUnreachable: "Can't reach Discord",
  presenceLoading: "· loading…",
  presenceUnknown: "· status unknown",
  presenceOfflineIdle: "Offline right now — nothing to show",
  presenceNoActivity: "No activity to display right now",
  presenceNothing: "Nothing to show here right now.",
  presenceSrcMusic: "Listening to Spotify",
  presenceSrcGame: "Playing",
  presenceSrcWatching: "Watching",
  presenceSrcStreaming: "Streaming",

  // Heat strip
  minutesPerDay: "minutes per day",
  clickDayToDrill: "click a day to drill in",
  today: "today",

  // Freshness — a synced module's own age. One key per FreshnessState, so the
  // component maps the state to a key instead of branching five ways in its
  // template. `{age}` is the pre-computed short relative ("8m", "2d").
  freshFresh: "synced {age} ago",
  freshStale: "{age} old",
  freshFailed: "sync failed · showing {age} old",
  freshNever: "not synced yet",
  freshEmpty: "nothing synced",
  /** A bare relative age, for a timestamp that isn't a sync (a post's date). */
  ago: "{age} ago",

  // Contact. The module offers a form when the relay is configured and a mailto
  // when it isn't, so both paths need copy — the mailto branch is the one an
  // unconfigured deployment actually shows.
  contactEmailMe: "Email me",
  contactFormName: "Name",
  contactFormEmail: "Email",
  contactFormMessage: "Message",
  contactSend: "Send message",
  contactSending: "Sending…",
  contactSent: "Thanks — your message is on its way. I'll get back to you soon.",
  contactUnconfigured: "The contact form isn't set up right now — try email instead.",
  contactTooMany: "Too many messages just now — please try again a little later.",

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

  settings: "Einstellungen",
  close: "Schließen",
  appearance: "Darstellung",
  themeLight: "Hell",
  themeDark: "Dunkel",
  analyticsTitle: "Anonyme Nutzungsstatistik",
  analyticsDesc:
    "Hilft mir zu sehen, welche Bereiche nützlich sind. Keine Cookies, keine IP, keine Kennung — nur zusammengefasste Zahlen.",
  analyticsDetails: "Details",
  analyticsDnt:
    "Automatisch deaktiviert — dein Browser sendet ein „Do Not Track“-Signal, und das respektiere ich.",
  languageNote: "Lädt die Seite in deiner Sprache neu. Nicht Übersetztes fällt auf Englisch zurück.",

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

  areasHeading: "Wo es weitergeht",
  areaModules: "{n} Bereiche",
  areaModulesOne: "1 Bereich",

  statRepos: "öffentliche Repos",
  statCommitsYear: "Commits dieses Jahr",
  statCommitsAllTime: "Commits insgesamt",
  statLongestStreak: "längste Serie",
  repoCount: "{n} öffentliche Repos",

  updatedAgo: "vor {age} aktualisiert",

  // "Push", "PR" and "Repo" stay English: they're the words used in German dev
  // speech, and translating them ("Zusammenführungsanfrage") would be less
  // legible to the audience, not more.
  eventCommit: "Push nach {repo}",
  eventPr: "PR in {repo} geöffnet",
  eventStar: "{repo} mit Stern markiert",
  eventRepo: "{repo} erstellt",
  eventRelease: "{repo} {name} veröffentlicht",
  eventMergedPr: "„{title}“ in {repo} gemerged",
  eventGist: "Gist geteilt",
  eventGistNamed: "Gist geteilt: {description}",

  seeAllWork: "alle Projekte ansehen →",
  allReposGitHub: "alle Repos auf GitHub →",

  listening: "Gehört",
  played: "Gespielt",
  lastDays14: "letzte 14 Tage",
  lastDays30: "letzte 30 Tage",
  lastDays90: "letzte 3 Monate",
  lastDays180: "letzte 6 Monate",
  lastDays365: "letztes Jahr",
  range14: "14T",
  range30: "30T",
  range90: "3M",
  range180: "6M",
  range365: "1J",
  rangeLabel: "Zeitraum",
  topSongs: "Top-Songs",
  topArtists: "Top-Künstler:innen",
  topGames: "Top-Spiele",
  topGenres: "Top-Genres",
  backToTopSongs: "← zurück zu den Top-Songs",
  backToTopArtists: "← zurück zu den Top-Künstler:innen",
  backToTopGames: "← zurück zu den Top-Spielen",
  whenIPlay: "Wann ich spiele",
  localTime: "Lokal",
  ownerTime: "Zeit in {city}",
  showTimesIn: "Zeiten anzeigen in",
  timeListening: "Hörzeit",
  timePlayed: "Spielzeit",
  emptyWrapped: "Für diesen Zeitraum gibt es noch nichts zurückzublicken.",
  tracksPlayed: "Songs gehört",
  differentArtists: "verschiedene Künstler:innen",
  hoursShort: "Std.",
  minutesShort: "Min",

  presenceOnline: "Online",
  presenceIdle: "Abwesend",
  presenceDnd: "Bitte nicht stören",
  presenceOffline: "Offline",
  presenceUnreachable: "Discord nicht erreichbar",
  presenceLoading: "· lädt…",
  presenceUnknown: "· Status unbekannt",
  presenceOfflineIdle: "Gerade offline — nichts zu zeigen",
  presenceNoActivity: "Gerade keine Aktivität",
  presenceNothing: "Hier gibt es gerade nichts zu sehen.",
  presenceSrcMusic: "Hört Spotify",
  presenceSrcGame: "Spielt",
  presenceSrcWatching: "Schaut",
  presenceSrcStreaming: "Streamt",

  minutesPerDay: "Minuten pro Tag",
  clickDayToDrill: "Tag anklicken für Details",
  today: "heute",

  freshFresh: "vor {age} synchronisiert",
  freshStale: "{age} alt",
  freshFailed: "Sync fehlgeschlagen · zeige {age} alte Daten",
  freshNever: "noch nicht synchronisiert",
  freshEmpty: "nichts synchronisiert",
  ago: "vor {age}",

  contactEmailMe: "Schreib mir eine E-Mail",
  contactFormName: "Name",
  contactFormEmail: "E-Mail",
  contactFormMessage: "Nachricht",
  contactSend: "Nachricht senden",
  contactSending: "Wird gesendet…",
  contactSent: "Danke — deine Nachricht ist unterwegs. Ich melde mich bald.",
  contactUnconfigured: "Das Kontaktformular ist gerade nicht eingerichtet — schreib mir stattdessen eine E-Mail.",
  contactTooMany: "Gerade zu viele Nachrichten — bitte versuch es etwas später noch einmal.",

  codingScope: "{range} · {hours} Std. erfasst",
};

/**
 * Plural-sensitive strings, kept apart from the flat catalog because they need a
 * count to resolve. German and English disagree here in ways a single string
 * can't express (one "Song" vs several "Songs", one "Spiel" vs "Spiele").
 */
const PLURALS: Record<Locale, Record<"track" | "artist" | "game" | "file", Plural>> = {
  en: {
    track: { one: "track", other: "tracks" },
    artist: { one: "artist", other: "artists" },
    game: { one: "game", other: "games" },
    file: { one: "file", other: "files" },
  },
  de: {
    track: { one: "Song", other: "Songs" },
    artist: { one: "Künstler:in", other: "Künstler:innen" },
    game: { one: "Spiel", other: "Spiele" },
    file: { one: "Datei", other: "Dateien" },
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
  noun: "track" | "artist" | "game" | "file",
  count: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const forms = (PLURALS[locale] ?? PLURALS[DEFAULT_LOCALE])[noun];
  return count === 1 ? forms.one : forms.other;
}
