/**
 * Discord presence (Lanyard) — the live half of the activity widget.
 *
 * Lanyard streams *everything* Discord sees. This module is the curation layer:
 * a pure `normalizePresence(raw, show)` maps Lanyard's raw activities into a small,
 * friendly shape and keeps only the categories the owner enabled — so "disable
 * music" or "only games" is a config choice, not a code change. The live socket
 * lives in the web island; the accumulated "what I actually play" history is a
 * separate, sampled table (see the sessions repo), folded in alongside.
 */

/**
 * Every presence category the owner can toggle, in display order. All are filled
 * by Discord's live socket.
 *
 * The type derives from this array rather than the other way round, so a new
 * category can't be added to one and forgotten in the other. Everything that
 * needs the *list* — the CMS toggles, the write schema's enum, the resolver's
 * "is anything live?" check — derives from here too, for the same reason.
 */
export const PRESENCE_CATEGORIES = [
  "game",
  "streaming",
  "music",
  "watching",
  "custom",
] as const;

export type PresenceCategory = (typeof PRESENCE_CATEGORIES)[number];

export function isPresenceCategory(value: unknown): value is PresenceCategory {
  return typeof value === "string" && (PRESENCE_CATEGORIES as readonly string[]).includes(value);
}

/** CMS-owned presence config: which categories the widget may reveal. */
export interface PresenceSettings {
  /** DISPLAY axis: which categories the live widget reveals. Gates
   *  `/api/presence` — the browser never sees a category not in here. */
  show: PresenceCategory[];
  /**
   * RECORD axis: which categories the sampler writes to the database.
   *
   * Independent of `show`, on purpose. A category can be sampled-but-hidden
   * (accumulate history quietly) or shown-but-not-sampled (live only, no trail).
   * Before this existed the sampler recorded everything regardless of the
   * allow-list, so disabling music hid it from the widget while the table kept
   * filling — the two axes are now separate settings because they were always
   * separate questions.
   */
  sample: PresenceCategory[];
  /** Prune observed sessions older than this many days. `null` = keep forever.
   *  This table is the only long memory of what was played, so the default is to
   *  keep it. */
  retentionDays: number | null;
  /** Game names that are recorded but never shown on the public playtime chart.
   *  Matched case-insensitively. "Accumulate it" and "publish it" are separate
   *  decisions; this is the second one. */
  hiddenGames: string[];
}

/** Sensible starting allow-list; used to seed the store and as a fallback.
 *  Everything except `watching` — a YouTube title is a stronger claim about a
 *  person than "playing something", so it's opt-in. */
export function defaultPresenceSettings(): PresenceSettings {
  const live = PRESENCE_CATEGORIES.filter((c) => c !== "watching");
  return {
    show: live,
    // Sample by default whatever we'd display — the common case is "record what
    // you show". Watching is off in both: it records the app, not the video.
    sample: live,
    retentionDays: null, // keep forever; the table is one row per session
    hiddenGames: [],
  };
}

/** Keep only valid, de-duplicated categories (guards CMS input + stored rows). */
export function sanitizePresenceShow(input: unknown): PresenceCategory[] {
  if (!Array.isArray(input)) return [];
  // The predicate narrows, so nothing here asserts. `includes` + `as` was the
  // same check written as a claim the compiler couldn't verify.
  return [...new Set(input.filter(isPresenceCategory))];
}

/** The retention values the CMS offers. A free-form number could prune the whole
 *  table on a fat-fingered `1`; constraining to a known set makes that impossible. */
export const RETENTION_OPTIONS = [
  { label: "Forever", days: null },
  { label: "2 years", days: 730 },
  { label: "1 year", days: 365 },
] as const;

/** Coerce arbitrary input to one of the allowed retention values, or forever. */
export function sanitizeRetentionDays(input: unknown): number | null {
  if (input === null) return null;
  return RETENTION_OPTIONS.find((o) => o.days === input)?.days ?? null;
}

/** Clean the hidden-games list: strings only, trimmed, de-duped case-insensitively,
 *  capped so a runaway client can't write an unbounded blob. */
export function sanitizeHiddenGames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 200) break;
  }
  return out;
}

/** Sanitize a whole settings object from untrusted input — every field falls back
 *  to its default rather than trusting the shape. */
export function sanitizePresenceSettings(input: unknown): PresenceSettings {
  const obj = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const d = defaultPresenceSettings();
  const show = "show" in obj ? sanitizePresenceShow(obj.show) : d.show;
  const sample = "sample" in obj ? sanitizePresenceShow(obj.sample) : d.sample;
  return {
    show,
    sample,
    retentionDays: "retentionDays" in obj ? sanitizeRetentionDays(obj.retentionDays) : d.retentionDays,
    hiddenGames: "hiddenGames" in obj ? sanitizeHiddenGames(obj.hiddenGames) : d.hiddenGames,
  };
}

/** True when a game name is on the hidden list (case-insensitive), for the
 *  resolver to drop it from the public chart. */
export function isHiddenGame(name: string, hidden: string[]): boolean {
  const key = name.trim().toLowerCase();
  return hidden.some((h) => h.trim().toLowerCase() === key);
}

/**
 * Discord's four presence states. A const object, not a bare union: the widget
 * renders a class and a brand colour per state (`--discord-online` &c.), the
 * normalizer picks a default, and a blanket rename once flattened all of them —
 * so the values need one named home rather than a literal at each site.
 */
export const DISCORD_STATUS = {
  Online: "online",
  Idle: "idle",
  Dnd: "dnd",
  Offline: "offline",
} as const;
export type DiscordStatus = (typeof DISCORD_STATUS)[keyof typeof DISCORD_STATUS];

/**
 * Lanyard's `activity.type` numbers, as Discord defines them. Named because a
 * bare `4` in a map key is unreadable and un-greppable — the old comment beside
 * the field was the only thing carrying the meaning, and a comment isn't a
 * lookup. Only the types we surface are listed; 5 (Competing) is ignored.
 */
export const LANYARD_ACTIVITY_TYPE = {
  Playing: 0,
  Streaming: 1,
  Listening: 2,
  Watching: 3,
  Custom: 4,
} as const;

/** The subset of Lanyard's payload we read. */
export interface LanyardActivity {
  /** See {@link LANYARD_ACTIVITY_TYPE}. */
  type: number;
  name: string;
  state?: string;
  details?: string;
  application_id?: string;
  /** Spotify track id on a listening activity — stable across plays of one track,
   *  so it's the identity for "top songs". */
  sync_id?: string;
  emoji?: { name?: string };
  timestamps?: { start?: number; end?: number };
  assets?: { large_image?: string; large_text?: string };
}
export interface LanyardData {
  discord_status?: DiscordStatus;
  discord_user?: { id?: string; avatar?: string | null; username?: string; global_name?: string | null };
  activities?: LanyardActivity[];
  listening_to_spotify?: boolean;
  spotify?: { song: string; artist: string; album?: string; album_art_url?: string };
}

/** One curated presence card, ready to render. */
export interface PresenceCard {
  category: PresenceCategory;
  title: string;
  subtitle?: string;
  image?: string;
  /** Start time (ms epoch) for an "elapsed" display, if known. */
  since?: number;
}

export interface PresenceView {
  status: DiscordStatus;
  /** Discord avatar URL for the profile header, when the account exposes one. */
  avatar?: string;
  cards: PresenceCard[];
}

const TYPE_TO_CATEGORY: Record<number, PresenceCategory> = {
  [LANYARD_ACTIVITY_TYPE.Playing]: "game",
  [LANYARD_ACTIVITY_TYPE.Streaming]: "streaming",
  [LANYARD_ACTIVITY_TYPE.Listening]: "music",
  [LANYARD_ACTIVITY_TYPE.Watching]: "watching",
  [LANYARD_ACTIVITY_TYPE.Custom]: "custom",
};

/** Build the Discord CDN avatar URL from the user object (animated -> gif). */
function discordAvatarUrl(u: LanyardData["discord_user"]): string | undefined {
  if (!u?.id || !u.avatar) return undefined;
  const ext = u.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=128`;
}

/** Best-effort resolve a Lanyard asset image ref to a URL (common cases only). */
function assetUrl(a: LanyardActivity): string | undefined {
  const img = a.assets?.large_image;
  if (!img) return undefined;
  if (img.startsWith("mp:external/")) return `https://media.discordapp.net/${img.slice(3)}`;
  if (/^https?:\/\//.test(img)) return img;
  if (a.application_id && /^[0-9]+$/.test(img)) {
    return `https://cdn.discordapp.com/app-assets/${a.application_id}/${img}.png`;
  }
  return undefined;
}

/**
 * The album-art URL for a Spotify activity, if it carries one.
 *
 * Discord ships the cover in `assets.large_image` as `spotify:<id>`, which maps
 * to Spotify's CDN — the same `i.scdn.co` host the media proxy already allow-lists.
 * A rare listen has a full `https://` image instead (handled), or none (undefined,
 * so the row falls back to a monogram). Pure and dependency-free, so the sampler
 * can call it when persisting a play and the resolver stays out of it.
 */
export function spotifyAlbumArtUrl(a: LanyardActivity): string | undefined {
  const img = a.assets?.large_image;
  if (!img) return undefined;
  if (img.startsWith("spotify:")) return `https://i.scdn.co/image/${img.slice("spotify:".length)}`;
  if (/^https?:\/\//.test(img)) return img;
  return undefined;
}

/**
 * Map Lanyard data to a filtered PresenceView. `show` is the owner's allow-list
 * of categories; anything not in it is dropped. Spotify is surfaced as a single
 * `music` card (Lanyard duplicates it as an activity, so we de-dupe). Pure.
 */
export function normalizePresence(
  data: LanyardData,
  show: readonly PresenceCategory[],
): PresenceView {
  const allow = new Set(show);
  const status: DiscordStatus = data.discord_status ?? DISCORD_STATUS.Offline;
  const avatar = discordAvatarUrl(data.discord_user);
  const cards: PresenceCard[] = [];

  // Music: prefer the structured Spotify object (one clean card).
  if (allow.has("music") && data.listening_to_spotify && data.spotify) {
    cards.push({
      category: "music",
      title: data.spotify.song,
      subtitle: data.spotify.album
        ? `${data.spotify.artist} · ${data.spotify.album}`
        : data.spotify.artist,
      ...(data.spotify.album_art_url ? { image: data.spotify.album_art_url } : {}),
    });
  }

  for (const a of data.activities ?? []) {
    const category = TYPE_TO_CATEGORY[a.type];
    if (!category || !allow.has(category)) continue;
    if (category === "music") continue; // already handled via the Spotify object

    if (category === "custom") {
      const text = [a.emoji?.name, a.state].filter(Boolean).join(" ").trim();
      if (text) cards.push({ category, title: text });
      continue;
    }

    cards.push({
      category,
      title: a.name,
      ...(a.details || a.state ? { subtitle: [a.details, a.state].filter(Boolean).join(" — ") } : {}),
      ...(assetUrl(a) ? { image: assetUrl(a) } : {}),
      ...(a.timestamps?.start ? { since: a.timestamps.start } : {}),
    });
  }

  return { status, ...(avatar ? { avatar } : {}), cards };
}


// ── observed playtime ────────────────────────────────────────────────────────

/**
 * A session shorter than this isn't a fact, it's a row.
 *
 * A game glimpsed by exactly one poll, with no `timestamps.start` from Discord,
 * has `last_seen == started` — zero seconds. Charting it would put a name on the
 * axis for something we can't say anything about. Sixty seconds is the smallest
 * span a poll can actually evidence.
 */
export const PLAYTIME_MIN_SECONDS = 60;

/**
 * Default IANA timezone for aggregating observed sessions into days and hours.
 * Overridden by the `TZ` environment variable. Sessions are stored in UTC; the
 * day strips and the weekday×hour heatmap bucket in this zone so they read in the
 * owner's local time (and cross-midnight play lands on the right local day).
 */
export const DEFAULT_TIMEZONE = "Europe/Berlin";

/** Whether `tz` is an IANA zone the runtime's tz database knows. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A usable IANA zone, falling back to the default for anything unrecognised. */
export function sanitizeTimeZone(tz: unknown): string {
  return typeof tz === "string" && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

/**
 * The window the playtime chart covers.
 *
 * Fourteen days, to match the listening chart's fortnight so "playing" and
 * "listening" answer over the same span. A different window here would put two
 * time ranges on facing cards and invite reading them as one.
 */
export const PLAYTIME_WINDOW_DAYS = 14;

/** How many rows each music "top" list fetches. The module shows 5 with a
 *  show-more toggle, so a handful past that is enough to make the toggle real
 *  without shipping a long tail nobody expands. */
export const MUSIC_TOP_LIMIT = 12;

/**
 * How often to ask Discord what's running.
 *
 * Five minutes, and the number is smaller than it looks: Discord dates the session
 * (`timestamps.start`), so the poll doesn't measure the duration — it only decides
 * whether a session is *seen at all*. A game played for less than one interval,
 * between two polls, is missed entirely; anything longer is dated exactly and the
 * only error is the tail between the last poll and quitting.
 *
 * So this trades one HTTP call per five minutes against the length of the shortest
 * session worth recording. Lanyard's socket would close that gap, at the price of a
 * persistent connection to reconnect, back off and supervise — for a personal site
 * whose question is "what did I play this fortnight", a poll is the honest cost.
 */
export const PRESENCE_SAMPLE_SCHEDULE = "*/5 * * * *";

/**
 * How long an *undated* session stays open between polls.
 *
 * Most activities carry `timestamps.start`, and those are keyed by it: two polls
 * of one session are one row, and idempotence is the primary key's job.
 *
 * The ones Discord doesn't date have no such key, and the naive fallback —
 * `started_at = now` — makes every poll a new zero-length session, so an undated
 * game accumulates *nothing, forever*. Instead the poll extends whatever undated
 * session is still open for that name; this is how long "still open" lasts.
 *
 * Twice the poll interval, so one failed poll doesn't saw a session in half. Longer
 * would glue genuinely separate sessions together across a break; that's the whole
 * trade, and it only applies to activities Discord wouldn't date anyway.
 */
export const PRESENCE_SESSION_GAP_MS = 10 * 60 * 1000;

/** One weekday×hour cell of the play heatmap (feature 03). */
export interface PlaytimeHeatCell {
  /** 0=Sunday..6=Saturday, as SQLite's %w returns it. The view rotates to Mon-first. */
  weekday: number;
  /** 0..23, local hour the session started. */
  hour: number;
  minutes: number;
}

/** One day's total for the ledger strip (feature 02). */
export interface PlaytimeDay {
  /** `YYYY-MM-DD`, local. */
  day: string;
  minutes: number;
  sessions: number;
}

/** Playtime for one activity, as observed. */
export interface PlaytimeEntry {
  name: string;
  minutes: number;
  /** How many separate sessions this is summed from. */
  sessions: number;
  /** Whether every session's start came from Discord rather than from first
   *  sight. False means the total is a floor. */
  exact: boolean;
}

/** One row of the playtime chart — an observed game and its minutes. Cover art
 *  and genre, when known, are attached by the resolver from the metadata cache
 *  (RAWG), matched by name; Discord itself gives only a name and a duration. */
export interface PlaytimeView {
  name: string;
  minutes: number;
  /** Whether every session's start came from Discord rather than from first
   *  sight. False means the total is a floor. */
  exact: boolean;
  /** Cover image URL (re-served through the media proxy). From RAWG, by name. */
  coverUrl?: string;
  /** Primary genre. From RAWG, by name. */
  genre?: string;
}

/** Metadata for a game, resolved from a cross-platform database (RAWG) by name.
 *  Cached in the store keyed by {@link gameMetaKey}; the resolver attaches it to the
 *  playtime rows so a Discord-observed name gets cover art and a genre it never
 *  carried on its own. */
export interface GameMeta {
  /** Cover image URL (re-served through the media proxy at render time). */
  coverUrl?: string;
  /** Primary genre. */
  genre?: string;
}

/** The cache key for a game name — trimmed + lowercased. The store keys metadata
 *  by this and the resolver looks up by this, so a row and its lookup always agree
 *  regardless of the casing/spacing Discord happened to report. */
export function gameMetaKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Shape observed per-game totals into chart rows, most-played first, attaching
 * cached metadata (cover art, genre) by name where it's known.
 *
 * Playtime is entirely Lanyard-observed now: the sampler records every game
 * Discord reports — Steam and non-Steam alike — and this turns those per-game
 * totals into rows. Steam used to contribute a parallel, strictly-more-accurate
 * fortnight here (it counted hours Discord wasn't watching), merged in by name;
 * it was dropped because it only ever knew Steam titles, so the observed number —
 * one consistent measurement across every game — is what's left, and it's the
 * only thing that ever saw the non-Steam ones anyway. Cover art and genre, which
 * Steam used to bring, come from RAWG (cross-platform) via the metadata cache.
 */
export function playtimeRows(
  observed: PlaytimeEntry[],
  meta?: ReadonlyMap<string, GameMeta>,
): PlaytimeView[] {
  return observed
    .map((o): PlaytimeView => {
      const m = meta?.get(gameMetaKey(o.name));
      return {
        name: o.name,
        minutes: o.minutes,
        exact: o.exact,
        ...(m?.coverUrl ? { coverUrl: m.coverUrl } : {}),
        ...(m?.genre ? { genre: m.genre } : {}),
      };
    })
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}


// ── music (Spotify plays, for a Wrapped-style view) ──────────────────────────

/**
 * Split Discord's artist string into individual artists.
 *
 * Discord joins collaborators with "; " — `"Icona Pop; Charli xcx"`. "Top
 * artists" has to count each separately (Charli XCX's solo plays should merge
 * with her features), so this splits on the separator, trims, and drops empties.
 * Over-splitting a name that genuinely contains a semicolon is the acceptable
 * error; under-merging two artists into one would silently corrupt the count.
 */
export function splitArtists(state: string | undefined): string[] {
  if (!state) return [];
  return [...new Set(state.split(/;\s*/).map((a) => a.trim()).filter(Boolean))];
}

/** A single track play, as captured from presence. */
export interface MusicPlay {
  trackId: string;
  song: string;
  /** Raw artist string, verbatim from Discord. */
  artist: string;
  album?: string;
  /** Album cover URL (Spotify CDN), when the play exposed one. */
  albumArtUrl?: string;
  startedAt: string;
  seenAt: string;
}

/** One row of a "top" list (songs, artists, or albums). */
export interface MusicRankEntry {
  /** Display name — song title, artist, or album. */
  name: string;
  minutes: number;
  /** How many distinct plays this is summed from. */
  plays: number;
  /** Artist(s), for a song/album row — lets the UI show "Song — Artist". */
  by?: string;
  /** Album cover URL, when known. Songs/albums carry their own; an artist row
   *  borrows its most-played track's cover. Absent → the UI shows a monogram. */
  artUrl?: string;
}

/** One track played on a given day — the music drill-in, parallel to the
 *  playtime day breakdown. */
export interface MusicDayTrack {
  song: string;
  artist: string;
  minutes: number;
  plays: number;
  artUrl?: string;
}

/** `/api/music/day` reply: the tracks played on one date. */
export interface MusicDayResponse {
  day: string;
  tracks: MusicDayTrack[];
}

/** The music module's data: top songs / artists / albums plus a listening
 *  timeline, over a window. Genre and podcasts are absent — Discord's Spotify
 *  presence doesn't expose them; they'd need the Spotify Web API. */
export interface MusicModuleData {
  totalHours: number;
  topSongs: MusicRankEntry[];
  topArtists: MusicRankEntry[];
  topAlbums: MusicRankEntry[];
  /** Minutes listened per day, oldest first — same shape as the playtime ledger. */
  ledger: { day: string; minutes: number }[];
  since?: string;
}
