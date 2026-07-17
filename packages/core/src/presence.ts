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

/** The category the Steam half of the widget is gated on (the one non-Discord one). */
export const STEAM_CATEGORY = "steam" satisfies PresenceCategory;

/** A category Discord's live socket can fill. The `Exclude<>` and the runtime
 *  list are one derivation, so they can't disagree: the resolver used to hold a
 *  hand-copied `["game","streaming","music","watching","custom"]`, which a sixth
 *  Discord category would have silently missed. */
export type LivePresenceCategory = Exclude<PresenceCategory, typeof STEAM_CATEGORY>;

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
  const seen = new Set<PresenceCategory>();
  for (const v of input) {
    if (typeof v === "string" && (PRESENCE_CATEGORIES as readonly string[]).includes(v)) {
      seen.add(v as PresenceCategory);
    }
  }
  return [...seen];
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
