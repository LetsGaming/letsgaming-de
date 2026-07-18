/**
 * Discord presence (Lanyard) — the live half of the activity widget.
 *
 * Lanyard streams *everything* Discord sees. This module is the curation layer:
 * a pure `normalizePresence(raw, show)` maps Lanyard's raw activities into a small,
 * friendly shape and keeps only the categories the owner enabled — so "disable
 * music" or "only games" is a config choice, not a code change. The live socket
 * lives in the web island; the Steam "what I actually play" half is a separate,
 * server-synced source folded in alongside.
 */

/**
 * Every presence category the owner can toggle, in display order. `steam` gates
 * the synced Steam section; the rest come from Discord.
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
  "steam",
] as const;

export type PresenceCategory = (typeof PRESENCE_CATEGORIES)[number];

export function isPresenceCategory(value: unknown): value is PresenceCategory {
  return typeof value === "string" && (PRESENCE_CATEGORIES as readonly string[]).includes(value);
}

/** The category the Steam half of the widget is gated on (the one non-Discord one). */
export const STEAM_CATEGORY = "steam" satisfies PresenceCategory;

/** A category Discord's live socket can fill. The `Exclude<>` and the runtime
 *  list are one derivation, so they can't disagree: the resolver used to hold a
 *  hand-copied `["game","streaming","music","watching","custom"]`, which a sixth
 *  Discord category would have silently missed. */
export type LivePresenceCategory = Exclude<PresenceCategory, typeof STEAM_CATEGORY>;

/**
 * Is this a category Discord's socket can actually fill?
 *
 * A predicate rather than `LIVE_PRESENCE_CATEGORIES.includes(c as …)`, because the
 * derived list is `LivePresenceCategory[]` and `includes` therefore refuses a
 * plain `PresenceCategory` — correctly: `steam` is in the vocabulary and not in
 * this list. The server used to hand-write `["game","streaming","music",
 * "watching","custom"]` typed as `PresenceCategory[]`, which took anything and
 * asked nothing. The narrower type is the better question.
 */
export function isLivePresenceCategory(c: PresenceCategory): c is LivePresenceCategory {
  return c !== STEAM_CATEGORY;
}

export const LIVE_PRESENCE_CATEGORIES: readonly LivePresenceCategory[] =
  PRESENCE_CATEGORIES.filter((c): c is LivePresenceCategory => c !== STEAM_CATEGORY);

/** CMS-owned presence config: which categories the widget may reveal. */
export interface PresenceSettings {
  show: PresenceCategory[];
}

/** Sensible starting allow-list; used to seed the store and as a fallback.
 *  Everything except `watching` — a YouTube title is a stronger claim about a
 *  person than "playing something", so it's opt-in. */
export function defaultPresenceSettings(): PresenceSettings {
  return { show: PRESENCE_CATEGORIES.filter((c) => c !== "watching") };
}

/** Keep only valid, de-duplicated categories (guards CMS input + stored rows). */
export function sanitizePresenceShow(input: unknown): PresenceCategory[] {
  if (!Array.isArray(input)) return [];
  // The predicate narrows, so nothing here asserts. `includes` + `as` was the
  // same check written as a claim the compiler couldn't verify.
  return [...new Set(input.filter(isPresenceCategory))];
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
  category: LivePresenceCategory;
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

const TYPE_TO_CATEGORY: Record<number, LivePresenceCategory> = {
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
 * The window the playtime chart covers.
 *
 * Fourteen days because that's what Steam's `minutes2Weeks` is, and the chart puts
 * both on one axis. A different span for the observed half would be two questions
 * drawn as one — the exact conflation that keeping `source` on every entry exists
 * to prevent.
 */
export const PLAYTIME_WINDOW_DAYS = 14;

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

/** What Steam hands back for a recently-played game. Mirrored here rather than
 *  imported from `source.ts` to keep the merge's signature readable at the call
 *  site; the resolver passes `SteamData["recent"]` straight in. */
export interface SteamRecentGame {
  name: string;
  appId: number;
  minutes2Weeks: number;
  iconUrl?: string;
  accent?: string;
}

/** One row of the playtime chart, whichever half it came from. */
export interface PlaytimeView {
  name: string;
  minutes: number;
  source: PlaytimeSource;
  exact: boolean;
  /** Steam only — a store link. */
  appId?: number;
  /** Steam only — the game's icon. */
  iconUrl?: string;
  /** Steam only — the game's own colour, sampled from its icon at sync. */
  accent?: string;
}

/** Where a playtime number came from — the two are different claims. */
export const PLAYTIME_SOURCES = ["steam", "observed"] as const;
export type PlaytimeSource = (typeof PLAYTIME_SOURCES)[number];

export function isPlaytimeSource(value: unknown): value is PlaytimeSource {
  return typeof value === "string" && (PLAYTIME_SOURCES as readonly string[]).includes(value);
}

/**
 * Steam's number and Discord's are not the same measurement.
 *
 * Steam reports *all* playtime in a rolling fortnight, including hours when
 * Discord was closed. Discord reports what it watched happen. For a game Steam
 * knows, Steam's total is strictly better and the observed one is a subset — so
 * summing them double-counts, and picking the larger is still a guess about which
 * measurement you're holding.
 *
 * So: Steam where Steam has an answer, observed everywhere else, and each entry
 * says which. That's the whole reason non-Steam games were invisible — nothing was
 * watching them — and the reason the fix can't just add two numbers together.
 *
 * Matched on a normalised name because that's all there is: Lanyard reports what
 * Discord's game detection calls it, with no Steam appid attached.
 */
export function mergePlaytime(
  steam: SteamRecentGame[],
  observed: PlaytimeEntry[],
): PlaytimeView[] {
  const key = (n: string) => n.trim().toLowerCase();
  const fromSteam = new Set(steam.map((g) => key(g.name)));

  const merged: PlaytimeView[] = steam.map((g) => ({
    name: g.name,
    minutes: g.minutes2Weeks,
    source: "steam",
    exact: true,
    // Steam's identity travels with the entry rather than being flattened away:
    // an appId is a store link, an icon is a picture, and the accent is that
    // game's own colour, sampled at sync. A merge that dropped them would trade
    // the richer half of the chart for the ability to show the other half.
    appId: g.appId,
    ...(g.iconUrl ? { iconUrl: g.iconUrl } : {}),
    ...(g.accent ? { accent: g.accent } : {}),
  }));

  for (const o of observed) {
    if (fromSteam.has(key(o.name))) continue; // Steam already counted it, better
    // No appId, no icon, no accent — Discord gives a name and nothing else. The
    // widget renders it plainly, which is honest: we know less about this game.
    merged.push({ name: o.name, minutes: o.minutes, source: "observed", exact: o.exact });
  }

  return merged.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}


// ── the all-time ledger (feature 02) ─────────────────────────────────────────

/** A snapshot of lifetime minutes per game, at a point in time. */
export interface SteamSnapshot {
  syncedAt: string;
  games: { name: string; appId: number; minutesForever: number }[];
}

/** Exact minutes played in a day, differenced from lifetime counters. */
export interface LedgerDay {
  /** `YYYY-MM-DD`. */
  day: string;
  minutes: number;
}

/**
 * Turn a run of lifetime-minute snapshots into exact minutes played per day.
 *
 * The counter this differences is `playtime_forever`, which only ever grows — so
 * the delta between two snapshots of one game is exactly the minutes played
 * between them, with none of the decay that makes `playtime_2weeks` useless for
 * this (that one is played-minus-expired, and can fall). The snapshots already
 * exist: every Steam sync is archived in `source_snapshots`.
 *
 * Three things it has to get right, and each is a real case rather than a
 * hypothetical:
 *
 * - **A game appears for the first time.** It has no prior snapshot, so its whole
 *   lifetime total isn't "played today" — that would credit hundreds of hours to
 *   the first day it entered the recent list. A game's first sighting seeds its
 *   baseline and contributes nothing until the *next* snapshot.
 * - **The counter goes backwards.** Steam occasionally resets or re-reports; a
 *   negative delta isn't negative playtime, it's noise. Clamped to zero, and the
 *   new value becomes the baseline so the next real delta is still right.
 * - **Snapshots are sparse.** Syncs are every 15 min but the archive may be
 *   pruned or gapped. The delta is attributed to the *newer* snapshot's day,
 *   because that's when the counter was observed to have risen — the interval
 *   might straddle midnight, but crediting the day we saw the increase is the
 *   honest, reproducible choice.
 */
export function differenceLedger(snapshots: SteamSnapshot[]): LedgerDay[] {
  const baseline = new Map<number, number>(); // appId → last seen minutesForever
  const perDay = new Map<string, number>();

  for (const snap of snapshots) {
    const day = snap.syncedAt.slice(0, 10);
    for (const g of snap.games) {
      const prev = baseline.get(g.appId);
      baseline.set(g.appId, g.minutesForever);
      if (prev === undefined) continue; // first sighting seeds, credits nothing
      const delta = g.minutesForever - prev;
      if (delta <= 0) continue; // reset or noise
      perDay.set(day, (perDay.get(day) ?? 0) + delta);
    }
  }

  return [...perDay.entries()]
    .map(([day, minutes]) => ({ day, minutes }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
